-- ============================================================
-- Fix: resolve_knockout_realloc() failed at the admin "Resolve & lock
-- knockouts" button with "UPDATE requires a WHERE clause".
--
-- The idempotent reset that re-pends every nomination before re-awarding was
-- written WHERE-less (`update swap_nominations set status = 'pending';`). The
-- 0030 simulation passes in the SQL Editor (no sql_safe_updates there), but the
-- live RPC runs through PostgREST with sql_safe_updates on, which rejects any
-- unqualified UPDATE/DELETE. Scope the reset to the rows that actually need it
-- (only 'awarded' rows from a prior run differ from 'pending'); idempotent and
-- WHERE-qualified. Everything else is byte-identical to the 0030 definition.
-- ============================================================

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
  -- worst total_points picks first; ties broken by reverse draft order (a later
  -- original draft slot — higher draft_order index — picks earlier). Mirrors
  -- lib/knockoutView.reallocPickOrder. (The admin should refresh results first.)
  select draft_order into v_draft from game_config where id = 1;
  select array_agg(p.id order by coalesce(s.total_points, 0) asc, coalesce(d.idx, 0) desc)
    into v_order
    from profiles p
    left join scores s on s.user_id = p.id
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

grant execute on function public.resolve_knockout_realloc() to authenticated;
