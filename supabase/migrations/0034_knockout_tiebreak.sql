-- ============================================================
-- Knockout pick-order tiebreak: fewest points → worst goal difference →
-- admin-entered manual tiebreak → reverse draft order.
--
-- The knockout free-agent pick order was "fewest total_points, ties broken by
-- reverse draft order". This adds two earlier tiebreakers so a genuine
-- standings tie is resolved fairly:
--   1. total_points (fewest first)            — unchanged, primary
--   2. goal difference (worst first)          — NEW: sum of GF−GA across the
--      manager's group-phase teams' finished matches
--   3. profiles.knockout_tiebreak (lower first) — NEW: admin enters the result
--      of a managers' vote when points AND GD are still level
--   4. reverse draft order (later slot first) — deterministic backstop
--
-- Mirrors lib/knockoutView.reallocPickOrder. Everything in
-- resolve_knockout_realloc() other than the order snapshot is byte-identical to
-- 0031.
-- ============================================================

-- Admin-entered manual tiebreak. Lower picks earlier; 0 (default) = unset. Only
-- consulted when two managers are level on both points and goal difference.
alter table profiles add column if not exists knockout_tiebreak int not null default 0;

-- ---------- _manager_goal_difference(): GF−GA across a manager's group teams ----------
-- Derived, read-only. Sums the goal difference of every completed ('final')
-- match played by the manager's phase='group' teams. Managers with no completed
-- matches are absent (callers coalesce to 0).
create or replace function public._manager_goal_difference()
returns table(user_id uuid, gd int)
language sql
security definer set search_path = public
stable
as $$
  select o.user_id,
         sum(
           case
             when m.home_team_id = o.team_id then coalesce(m.home_score, 0) - coalesce(m.away_score, 0)
             when m.away_team_id = o.team_id then coalesce(m.away_score, 0) - coalesce(m.home_score, 0)
             else 0
           end
         )::int as gd
    from team_ownership o
    join matches m
      on (m.home_team_id = o.team_id or m.away_team_id = o.team_id)
     and m.status = 'final'
   where o.phase = 'group'
   group by o.user_id;
$$;

-- ---------- set_knockout_tiebreak(): admin records a managers'-vote result ----------
-- Only meaningful within a (points, GD) tie; lower rank picks earlier. Set the
-- same distinct positive numbers across all tied managers to order them.
create or replace function public.set_knockout_tiebreak(p_user_id uuid, p_rank int)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can set the knockout tiebreak';
  end if;
  update profiles set knockout_tiebreak = coalesce(p_rank, 0) where id = p_user_id;
end;
$$;

-- ---------- knockout_tiebreak_standings(): admin read of points + GD + tiebreak ----------
-- Lets the admin spot genuine ties (equal points AND GD) and enter the vote
-- result. Returned worst-placed-first, i.e. current resolve pick order.
create or replace function public.knockout_tiebreak_standings()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_draft uuid[];
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can read the knockout tiebreak standings';
  end if;

  select draft_order into v_draft from game_config where id = 1;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.id,
        'display_name', p.display_name,
        'total_points', coalesce(s.total_points, 0),
        'goal_difference', coalesce(g.gd, 0),
        'tiebreak', p.knockout_tiebreak
      )
      order by coalesce(s.total_points, 0) asc,
               coalesce(g.gd, 0) asc,
               p.knockout_tiebreak asc,
               coalesce(d.idx, 0) desc
    ), '[]'::jsonb)
    from profiles p
    left join scores s on s.user_id = p.id
    left join public._manager_goal_difference() g on g.user_id = p.id
    left join lateral (
      select ord.idx from unnest(v_draft) with ordinality as ord(uid, idx)
       where ord.uid = p.id
    ) d on true
  );
end;
$$;

-- ---------- resolve_knockout_realloc(): only the order snapshot changes ----------
create or replace function public.resolve_knockout_realloc()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_draft uuid[];
  v_order uuid[];
  v_uid   uuid;
  v_claim uuid;
  v_drop  uuid;
  v_taken uuid[] := '{}';   -- free agents claimed so far this pass
  v_wc    record;
  v_new   uuid;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can resolve knockout re-allocation';
  end if;
  if (select current_phase from game_config where id = 1) <> 'knockout_realloc' then
    raise exception 'knockout re-allocation is not open';
  end if;

  -- Snapshot the pick order NOW (resolve time), from the final standings:
  -- worst first by fewest total_points, then worst goal difference, then the
  -- admin-entered manual tiebreak (lower first), then reverse draft order (a
  -- later original draft slot — higher draft_order index — picks earlier).
  -- Mirrors lib/knockoutView.reallocPickOrder. (Refresh results first.)
  select draft_order into v_draft from game_config where id = 1;
  select array_agg(p.id
           order by coalesce(s.total_points, 0) asc,
                    coalesce(g.gd, 0) asc,
                    p.knockout_tiebreak asc,
                    coalesce(d.idx, 0) desc)
    into v_order
    from profiles p
    left join scores s on s.user_id = p.id
    left join public._manager_goal_difference() g on g.user_id = p.id
    left join lateral (
      select ord.idx from unnest(v_draft) with ordinality as ord(uid, idx)
       where ord.uid = p.id
    ) d on true;
  update game_config set knockout_order = coalesce(v_order, '{}') where id = 1;

  -- Safe to re-run: rebuild knockout ownership from scratch.
  delete from team_ownership where phase = 'knockout';
  -- Re-pend any nomination awarded by a prior run. WHERE-qualified so it survives
  -- sql_safe_updates (a plain `set status = 'pending'` is rejected as an
  -- unqualified UPDATE on the live RPC connection).
  update swap_nominations set status = 'pending' where status <> 'pending';

  -- 1) Award free agents in priority order; a successful claim executes the drop.
  foreach v_uid in array coalesce(v_order, '{}') loop
    v_claim := null;
    v_drop  := null;

    select sn.pick_team_id, sn.drop_team_id
      into v_claim, v_drop
      from swap_nominations sn
     where sn.user_id = v_uid
       and not (sn.pick_team_id = any(v_taken))
       and exists (select 1 from public._knockout_free_agent_ids() fa where fa = sn.pick_team_id)
     order by sn.rank asc
     limit 1;

    if v_claim is not null then
      v_taken := v_taken || v_claim;
      update swap_nominations
         set status = 'awarded'
       where user_id = v_uid and pick_team_id = v_claim;

      -- New knockout owner of the claimed team.
      insert into team_ownership (user_id, team_id, phase, acquired_via)
      values (v_uid, v_claim, 'knockout', 'swap');

      -- Carry this manager's other group teams (all but the dropped one).
      insert into team_ownership (user_id, team_id, phase, acquired_via)
      select user_id, team_id, 'knockout', 'draft'
        from team_ownership
       where user_id = v_uid and phase = 'group' and team_id <> v_drop;
    end if;
  end loop;

  -- 2) Materialize knockout ownership for everyone who didn't swap (and any team
  -- a swapper kept that isn't already carried). A dropped team of a successful
  -- swap is excluded, so it ends with no knockout owner (its knockout points go
  -- to nobody — group scoring is untouched).
  insert into team_ownership (user_id, team_id, phase, acquired_via)
  select g.user_id, g.team_id, 'knockout', 'draft'
    from team_ownership g
   where g.phase = 'group'
     and not exists (
       select 1 from team_ownership k
        where k.phase = 'knockout' and k.team_id = g.team_id
     )
     and not exists (
       select 1 from swap_nominations sn
        where sn.user_id = g.user_id and sn.status = 'awarded' and sn.drop_team_id = g.team_id
     );

  -- 3) Apply each pending wildcard (one bonus pick per manager). The old active
  -- pick at that slot is deactivated and linked via superseded_by to its
  -- replacement; the other slot is untouched. Only for managers who haven't
  -- already had a wildcard applied (one-time).
  for v_wc in
    select wc.user_id, wc.category_id, wc.pick_slot, wc.new_value
      from wildcard_choices wc
      join profiles p on p.id = wc.user_id
     where p.wildcard_used_at is null
  loop
    update bonus_predictions
       set is_active = false
     where user_id = v_wc.user_id and category_id = v_wc.category_id
       and pick_slot = v_wc.pick_slot and is_active;

    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_wc.user_id, v_wc.category_id, v_wc.pick_slot, v_wc.new_value)
    returning id into v_new;

    update bonus_predictions
       set superseded_by = v_new
     where user_id = v_wc.user_id and category_id = v_wc.category_id
       and pick_slot = v_wc.pick_slot and not is_active and superseded_by is null;

    update profiles set wildcard_used_at = now() where id = v_wc.user_id;
  end loop;

  update game_config
     set current_phase = 'knockout_locked',
         updated_at = now()
   where id = 1;
end;
$$;

grant execute on function public._manager_goal_difference()          to authenticated;
grant execute on function public.set_knockout_tiebreak(uuid, int)    to authenticated;
grant execute on function public.knockout_tiebreak_standings()       to authenticated;
grant execute on function public.resolve_knockout_realloc()          to authenticated;
