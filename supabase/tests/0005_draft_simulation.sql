-- Runnable verification for the draft engine (Plan 2). Paste into the Supabase
-- SQL editor and Run. It creates throwaway players, runs a complete draft by
-- impersonating each current picker (set request.jwt.claim.sub = their id), and
-- asserts the invariants, then ROLLS BACK so nothing is persisted.
--
-- Expected final output: a single NOTICE "DRAFT SIMULATION PASSED", and because
-- of the ROLLBACK at the end, no rows are committed. If any assertion fails the
-- block raises an exception and the transaction aborts.

begin;

do $$
declare
  v_ids     uuid[] := '{}';
  v_id      uuid;
  v_i       int;
  v_n       int := 4;          -- simulate 4 players
  v_tpp     int;
  v_total   int;
  v_current uuid;
  v_team    uuid;
  v_phase   game_phase;
  v_minpick int;
  v_maxpick int;
  v_distinct int;
begin
  -- Create players the same way real signups do: insert into auth.users with
  -- display_name in raw_user_meta_data, which fires the on_auth_user_created
  -- trigger -> handle_new_user(), auto-creating the profiles row. We then flip
  -- is_admin so start_draft passes. (Do NOT insert into profiles directly — the
  -- trigger already did, and a second insert would violate the primary key.)
  for v_i in 1..v_n loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'sim-' || v_i || '@sim.local',
              jsonb_build_object('display_name', 'Sim Player ' || v_i));
    update profiles set is_admin = true where id = v_id;  -- so start_draft passes
    v_ids := v_ids || v_id;
  end loop;

  -- Reset config to a clean registration state for the sim.
  update game_config
     set current_phase = 'registration',
         draft_order = '{}',
         draft_current_user_id = null,
         teams_per_player = 3
   where id = 1;

  -- Impersonate player 1 (an admin) and start the draft.
  perform set_config('request.jwt.claim.sub', v_ids[1]::text, true);
  perform public.start_draft();

  select teams_per_player into v_tpp from game_config where id = 1;
  v_total := v_n * v_tpp;

  -- Run every pick: impersonate the current picker, pick first available team.
  for v_i in 1..v_total loop
    select draft_current_user_id into v_current from game_config where id = 1;
    if v_current is null then
      raise exception 'current picker went null at pick % of %', v_i, v_total;
    end if;
    perform set_config('request.jwt.claim.sub', v_current::text, true);
    select t.id into v_team
      from teams t
     where not exists (select 1 from team_ownership o where o.team_id = t.id and o.phase = 'group')
     order by t.name
     limit 1;
    perform public.make_pick(v_team);
  end loop;

  -- Assertions ----------------------------------------------------------
  select current_phase into v_phase from game_config where id = 1;
  if v_phase <> 'group_locked' then
    raise exception 'expected auto-reveal to group_locked, got %', v_phase;
  end if;

  select min(c), max(c) into v_minpick, v_maxpick from (
    select count(*) c from team_ownership where phase = 'group' group by user_id
  ) s;
  if v_minpick <> v_tpp or v_maxpick <> v_tpp then
    raise exception 'expected every player to have % teams; got min % max %', v_tpp, v_minpick, v_maxpick;
  end if;

  select count(distinct team_id) into v_distinct from team_ownership where phase = 'group';
  if v_distinct <> v_total then
    raise exception 'expected % distinct teams, got %', v_total, v_distinct;
  end if;

  raise notice 'DRAFT SIMULATION PASSED';
end;
$$;

rollback;
