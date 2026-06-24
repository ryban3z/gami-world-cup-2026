-- Runnable verification for the knockout re-allocation engine (0030). Paste into
-- the Supabase SQL editor and Run. Builds a throwaway 3-player game (admin A,
-- plus B and C) with group ownership, standings and a snapshot leaderboard, then
-- asserts: open snapshots the reverse-standings order; blind submit validates the
-- drop + free-agent picks; the wildcard is one-time; resolve walks worst-first,
-- awards top still-available picks, materializes knockout ownership (dropped teams
-- left unowned), and locks. Then ROLLS BACK.
--
-- Expected: a NOTICE "KNOCKOUT REALLOC SIMULATION PASSED" and no committed rows.

begin;

do $$
declare
  v_a uuid := gen_random_uuid();  -- admin, leaderboard top (picks last)
  v_b uuid := gen_random_uuid();  -- worst-placed (picks first)
  v_c uuid := gen_random_uuid();  -- middle
  t1 uuid := gen_random_uuid();   -- A's group team (survivor)
  t2 uuid := gen_random_uuid();   -- B's group team (B will drop)
  t3 uuid := gen_random_uuid();   -- C's group team (C will drop)
  t4 uuid := gen_random_uuid();   -- free agent (both B and C want it)
  t5 uuid := gen_random_uuid();   -- free agent
  t6 uuid := gen_random_uuid();   -- free agent
  v_cat uuid;
  v_order uuid[];
  v_count int;
  v_used timestamptz;
begin
  -- ---- players (via the signup trigger) + admin flag ----
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ko-a@sim.local', jsonb_build_object('display_name', 'KO A')),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ko-b@sim.local', jsonb_build_object('display_name', 'KO B')),
    (v_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ko-c@sim.local', jsonb_build_object('display_name', 'KO C'));
  update profiles set is_admin = true where id = v_a;

  -- ---- teams ----
  insert into teams (id, name, group_letter) values
    (t1,'T1','A'),(t2,'T2','A'),(t3,'T3','B'),(t4,'T4','B'),(t5,'T5','C'),(t6,'T6','C');

  -- ---- group ownership (one team each) ----
  insert into team_ownership (user_id, team_id, phase, acquired_via) values
    (v_a, t1, 'group','draft'),(v_b, t2, 'group','draft'),(v_c, t3, 'group','draft');

  -- ---- standings: all six reached R16 (so t4/t5/t6 are eligible free agents) ----
  insert into team_standings (team_id, furthest_stage) values
    (t1,'r16'),(t2,'r16'),(t3,'r16'),(t4,'r16'),(t5,'r16'),(t6,'r16');

  -- ---- leaderboard snapshot: B worst (10) < C (20) < A (30) ----
  insert into scores (user_id, total_points) values (v_a, 30),(v_b, 10),(v_c, 20);

  -- ---- a bonus category + B's current pick (for the wildcard test) ----
  insert into bonus_categories (key, name) values ('sim_award_'||substr(v_a::text,1,8), 'Sim Award')
    returning id into v_cat;
  insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_b, v_cat, 1, 'Old Pick');

  -- ---- draft order drives the reverse-snake tiebreak ----
  update game_config set draft_order = array[v_a, v_b, v_c], current_phase = 'group_locked' where id = 1;

  -- 1) open requires admin
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  begin
    perform public.open_knockout_realloc();
    raise exception 'expected non-admin open to be rejected';
  exception when others then
    if sqlerrm <> 'only an admin can open knockout re-allocation' then
      raise exception 'wrong error for non-admin open: %', sqlerrm;
    end if;
  end;

  -- 2) admin opens → snapshots reverse-standings order [B, C, A]
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform public.open_knockout_realloc();
  select knockout_order into v_order from game_config where id = 1;
  if v_order <> array[v_b, v_c, v_a] then
    raise exception 'expected order [B,C,A], got %', v_order;
  end if;
  if (select current_phase from game_config where id = 1) <> 'knockout_realloc' then
    raise exception 'open did not advance to knockout_realloc';
  end if;

  -- 3) submit validation: can't drop a team you don't own
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  begin
    perform public.submit_swap_nomination(t1, array[t4]);  -- t1 is A's
    raise exception 'expected drop-of-unowned to be rejected';
  exception when others then
    if sqlerrm <> 'you do not own the team you are trying to drop' then
      raise exception 'wrong error for unowned drop: %', sqlerrm;
    end if;
  end;

  -- 4) submit validation: a pick that isn't a free agent (t1 is group-owned)
  begin
    perform public.submit_swap_nomination(t2, array[t1]);
    raise exception 'expected non-free-agent pick to be rejected';
  exception when others then
    if sqlerrm <> 'one of your wishlist picks is not an available free agent' then
      raise exception 'wrong error for non-free-agent: %', sqlerrm;
    end if;
  end;

  -- 5) valid blind submissions: B drops t2 wants [t4,t5]; C drops t3 wants [t4,t6]
  perform public.submit_swap_nomination(t2, array[t4, t5]);
  perform set_config('request.jwt.claim.sub', v_c::text, true);
  perform public.submit_swap_nomination(t3, array[t4, t6]);
  select count(*) into v_count from swap_nominations;
  if v_count <> 4 then raise exception 'expected 4 wishlist rows, got %', v_count; end if;

  -- 6) wildcard: B re-answers the category once; a second use is rejected
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform public.use_wildcard(v_cat, 1, 'New Pick');
  select wildcard_used_at into v_used from profiles where id = v_b;
  if v_used is null then raise exception 'wildcard did not stamp wildcard_used_at'; end if;
  select count(*) into v_count from bonus_predictions
   where user_id = v_b and category_id = v_cat and is_active and pick_value = 'New Pick';
  if v_count <> 1 then raise exception 'wildcard did not activate the new pick'; end if;
  if not exists (select 1 from bonus_predictions where user_id = v_b and category_id = v_cat
                  and not is_active and pick_value = 'Old Pick' and superseded_by is not null) then
    raise exception 'wildcard did not supersede the old pick';
  end if;
  begin
    perform public.use_wildcard(v_cat, 1, 'Third Pick');
    raise exception 'expected second wildcard use to be rejected';
  exception when others then
    if sqlerrm <> 'you have already used your wildcard' then
      raise exception 'wrong error for second wildcard: %', sqlerrm;
    end if;
  end;

  -- 7) admin resolves: B gets t4 (top pick), C's t4 is taken so C gets t6
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform public.resolve_knockout_realloc();

  if (select current_phase from game_config where id = 1) <> 'knockout_locked' then
    raise exception 'resolve did not lock the phase';
  end if;
  if not exists (select 1 from team_ownership where user_id = v_b and team_id = t4 and phase = 'knockout') then
    raise exception 'B should have claimed t4';
  end if;
  if not exists (select 1 from team_ownership where user_id = v_c and team_id = t6 and phase = 'knockout') then
    raise exception 'C should have claimed t6 (t4 was taken)';
  end if;
  -- A did not swap → keeps t1 into the knockouts (materialized).
  if not exists (select 1 from team_ownership where user_id = v_a and team_id = t1 and phase = 'knockout') then
    raise exception 'A should keep t1 in the knockout phase';
  end if;
  -- dropped teams (t2, t3) end with no knockout owner.
  if exists (select 1 from team_ownership where phase = 'knockout' and team_id in (t2, t3)) then
    raise exception 'dropped teams must have no knockout owner';
  end if;
  select count(*) into v_count from team_ownership where phase = 'knockout';
  if v_count <> 3 then raise exception 'expected 3 knockout rows, got %', v_count; end if;
  -- C's t4 wishlist row stays pending (not awarded); C's t6 is awarded.
  if (select status from swap_nominations where user_id = v_c and pick_team_id = t4) <> 'pending' then
    raise exception 'C''s taken pick should remain pending';
  end if;
  if (select status from swap_nominations where user_id = v_c and pick_team_id = t6) <> 'awarded' then
    raise exception 'C''s claimed pick should be awarded';
  end if;

  raise notice 'KNOCKOUT REALLOC SIMULATION PASSED';
end;
$$;

rollback;
