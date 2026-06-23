-- ============================================================
-- Knockout re-allocation + wildcard (the knockout_realloc phase).
-- After the group stage each manager may, blind:
--   * drop one owned team and submit a ranked top-3 wishlist of unowned R32
--     teams (free-agent pickup), and/or
--   * use a one-time wildcard to re-answer one whole bonus category.
-- The admin opens the window (snapshots the reverse-standings pick order),
-- then resolves it: managers are walked worst-placed-first and each is awarded
-- their highest still-available wishlist pick; the drop executes only on a
-- successful claim. resolve_knockout_realloc() is the ONLY path to
-- knockout_locked, so knockout ownership is always fully materialized there.
--
-- All rules live in security-definer RPCs (writes bypass RLS but the client
-- can't); knockout_realloc_state() is the single read window, blind-during /
-- reveal-after, mirroring draft_state(). swap_nominations (dormant Option B
-- table) is repurposed for the drop + ranked-claim state.
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- repurpose swap_nominations: drop + ranked wishlist ----------
-- The old Option B shape (team offered up + matched_with) is gone; this never
-- carried production data. One row per manager per wishlist rank.
drop table if exists swap_nominations cascade;
create table swap_nominations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id),
  drop_team_id uuid not null references teams(id),   -- explicit, never inferred
  rank         int  not null check (rank between 1 and 3),
  pick_team_id uuid not null references teams(id),    -- wishlist team at this rank
  status       text not null default 'pending',       -- pending | awarded
  created_at   timestamptz not null default now(),
  unique (user_id, rank)
);
alter table swap_nominations enable row level security;

-- ---------- pick order snapshot on game_config ----------
-- Resolved reverse-standings order (worst total_points first), fixed for the
-- whole window. Mirrors draft_order (snake base order). profile ids.
alter table game_config
  add column if not exists knockout_order uuid[] not null default '{}';

-- ---------- internal: eligible free agents ----------
-- A team that reached the Round of 32 (enum order: group < r32 < r16 < …) and
-- is owned by nobody in the group phase. team_standings has a row per team
-- (every team plays group games), so this is complete once the R32 bracket
-- exists. SECURITY DEFINER so the definer RPCs below can read team_standings /
-- team_ownership regardless of the caller's RLS.
create or replace function public._knockout_free_agent_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select ts.team_id
    from team_standings ts
   where ts.furthest_stage >= 'r32'
     and not exists (
       select 1 from team_ownership o where o.team_id = ts.team_id and o.phase = 'group'
     );
$$;

-- ---------- open_knockout_realloc(): admin opens the window ----------
create or replace function public.open_knockout_realloc()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_draft uuid[];
  v_order uuid[];
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can open knockout re-allocation';
  end if;
  if (select current_phase from game_config where id = 1) <> 'group_locked' then
    raise exception 'knockout re-allocation can only open from the group_locked phase';
  end if;

  select draft_order into v_draft from game_config where id = 1;

  -- Reverse-standings priority: worst total_points picks first; ties broken by
  -- reverse draft order (a later original draft slot — higher draft_order index
  -- — picks earlier). Mirrors lib/knockoutView.reallocPickOrder.
  select array_agg(p.id order by coalesce(s.total_points, 0) asc, coalesce(d.idx, 0) desc)
    into v_order
    from profiles p
    left join scores s on s.user_id = p.id
    left join lateral (
      select ord.idx from unnest(v_draft) with ordinality as ord(uid, idx)
       where ord.uid = p.id
    ) d on true;

  update game_config
     set current_phase = 'knockout_realloc',
         knockout_order = coalesce(v_order, '{}'),
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- submit_swap_nomination(): a manager's blind drop + wishlist ----------
-- Re-submission overwrites. No drop / empty wishlist => no swap (keep roster).
-- Picks must be distinct eligible free agents and not the dropped team; capped
-- at the top 3 in order.
create or replace function public.submit_swap_nomination(
  p_drop_team_id uuid,
  p_pick_team_ids uuid[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pick uuid;
  v_rank int := 0;
  v_seen uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if (select current_phase from game_config where id = 1) <> 'knockout_realloc' then
    raise exception 'the knockout re-allocation window is closed';
  end if;

  -- A fresh submission replaces any previous one.
  delete from swap_nominations where user_id = v_uid;

  -- Doing nothing is valid: no drop or no wishlist => keep the roster.
  if p_drop_team_id is null
     or p_pick_team_ids is null
     or array_length(p_pick_team_ids, 1) is null then
    return;
  end if;

  if not exists (
    select 1 from team_ownership
     where user_id = v_uid and team_id = p_drop_team_id and phase = 'group'
  ) then
    raise exception 'you do not own the team you are trying to drop';
  end if;

  foreach v_pick in array p_pick_team_ids loop
    exit when v_rank >= 3;            -- top 3 only
    if v_pick is null then continue; end if;
    if v_pick = any(v_seen) then
      raise exception 'your wishlist must not repeat a team';
    end if;
    if v_pick = p_drop_team_id then
      raise exception 'you cannot claim the team you are dropping';
    end if;
    if not exists (select 1 from public._knockout_free_agent_ids() fa where fa = v_pick) then
      raise exception 'one of your wishlist picks is not an available free agent';
    end if;
    v_rank := v_rank + 1;
    v_seen := v_seen || v_pick;
    insert into swap_nominations (user_id, drop_team_id, rank, pick_team_id)
    values (v_uid, p_drop_team_id, v_rank, v_pick);
  end loop;

  -- A drop with no valid picks resolves to no swap.
  if v_rank = 0 then
    delete from swap_nominations where user_id = v_uid;
  end if;
end;
$$;

-- ---------- use_wildcard(): one-time re-answer of a whole bonus category ----------
-- Models save_bonus_category, but gated on the knockout_realloc window and a
-- one-time profiles.wildcard_used_at. The old active pick(s) are deactivated
-- and linked via superseded_by to the replacements (audit trail), and the new
-- picks become the active ones — the wildcard is a replacement, not a new entity.
create or replace function public.use_wildcard(
  p_category_id uuid,
  p_value1 text,
  p_value2 text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v1 text := nullif(btrim(coalesce(p_value1, '')), '');
  v2 text := nullif(btrim(coalesce(p_value2, '')), '');
  v_new1 uuid;
  v_new2 uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if (select current_phase from game_config where id = 1) <> 'knockout_realloc' then
    raise exception 'the wildcard window is not open';
  end if;
  if (select wildcard_used_at from profiles where id = v_uid) is not null then
    raise exception 'you have already used your wildcard';
  end if;
  if not exists (select 1 from bonus_categories where id = p_category_id and is_active) then
    raise exception 'no such active category';
  end if;
  if v1 is null then
    raise exception 'pick at least one value for your wildcard category';
  end if;
  if v1 is not null and v2 is not null and lower(v1) = lower(v2) then
    raise exception 'your two picks for a category must be different';
  end if;

  -- Deactivate current picks first (the active-only unique index would block the
  -- new rows otherwise); link the audit trail after the replacements exist.
  update bonus_predictions
     set is_active = false
   where user_id = v_uid and category_id = p_category_id and is_active;

  insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
  values (v_uid, p_category_id, 1, v1)
  returning id into v_new1;

  if v2 is not null then
    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_uid, p_category_id, 2, v2)
    returning id into v_new2;
  end if;

  update bonus_predictions
     set superseded_by = v_new1
   where user_id = v_uid and category_id = p_category_id and pick_slot = 1
     and not is_active and superseded_by is null;
  update bonus_predictions
     set superseded_by = v_new2
   where v_new2 is not null
     and user_id = v_uid and category_id = p_category_id and pick_slot = 2
     and not is_active and superseded_by is null;

  update profiles set wildcard_used_at = now() where id = v_uid;
end;
$$;

-- ---------- resolve_knockout_realloc(): admin auto-allocates + locks ----------
-- Walk managers in the snapshot order; award each their highest-ranked
-- still-available wishlist team; materialize every manager's final knockout
-- roster (kept teams, or 2 kept + 1 claimed for a successful swap); lock.
-- Idempotent: clears prior phase='knockout' rows first.
create or replace function public.resolve_knockout_realloc()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order uuid[];
  v_uid   uuid;
  v_claim uuid;
  v_drop  uuid;
  v_taken uuid[] := '{}';   -- free agents claimed so far this pass
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can resolve knockout re-allocation';
  end if;
  if (select current_phase from game_config where id = 1) <> 'knockout_realloc' then
    raise exception 'knockout re-allocation is not open';
  end if;

  select knockout_order into v_order from game_config where id = 1;

  -- Safe to re-run: rebuild knockout ownership from scratch.
  delete from team_ownership where phase = 'knockout';
  update swap_nominations set status = 'pending';

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

  update game_config
     set current_phase = 'knockout_locked',
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- knockout_realloc_state(): the single authenticated read window ----------
-- Own submission always visible; everyone's results revealed only once locked.
create or replace function public.knockout_realloc_state()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid      uuid := auth.uid();
  v_phase    game_phase;
  v_revealed boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select current_phase into v_phase from game_config where id = 1;
  v_revealed := v_phase in ('knockout_locked', 'complete');

  return jsonb_build_object(
    'phase', v_phase,
    'is_admin', coalesce((select is_admin from profiles where id = v_uid), false),
    'wildcard_used', (select wildcard_used_at from profiles where id = v_uid) is not null,
    'my_roster', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', t.id, 'name', t.name, 'flag_url', t.flag_url, 'group_letter', t.group_letter)
        order by t.name
      ), '[]'::jsonb)
      from team_ownership o
      join teams t on t.id = o.team_id
      where o.user_id = v_uid and o.phase = 'group'
    ),
    'free_agents', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', t.id, 'name', t.name, 'flag_url', t.flag_url, 'group_letter', t.group_letter)
        order by t.group_letter, t.name
      ), '[]'::jsonb)
      from public._knockout_free_agent_ids() fa
      join teams t on t.id = fa
    ),
    'my_submission', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'drop_team_id', max(sn.drop_team_id::text),
        'pick_team_ids', jsonb_agg(sn.pick_team_id order by sn.rank)
      ) end
      from swap_nominations sn
      where sn.user_id = v_uid
    ),
    'results', case when v_revealed then (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', sn.user_id,
          'display_name', p.display_name,
          'drop_name', dt.name,
          'claimed_name', pt.name,
          'claimed_flag_url', pt.flag_url
        ) order by p.display_name
      ), '[]'::jsonb)
      from swap_nominations sn
      join profiles p on p.id = sn.user_id
      join teams dt on dt.id = sn.drop_team_id
      join teams pt on pt.id = sn.pick_team_id
      where sn.status = 'awarded'
    ) else null end
  );
end;
$$;

-- ---------- RLS: own nominations always; everyone's once locked ----------
create policy "read own or revealed swap_nominations"
  on swap_nominations for select to authenticated
  using (
    user_id = auth.uid()
    or (select current_phase from game_config where id = 1) in ('knockout_locked', 'complete')
  );

-- ---------- grants ----------
grant execute on function public.open_knockout_realloc()                  to authenticated;
grant execute on function public.submit_swap_nomination(uuid, uuid[])     to authenticated;
grant execute on function public.use_wildcard(uuid, text, text)           to authenticated;
grant execute on function public.resolve_knockout_realloc()               to authenticated;
grant execute on function public.knockout_realloc_state()                 to authenticated;
-- _knockout_free_agent_ids is internal: called only from the definer functions
-- above (which run as owner), so no grant.
