-- Runnable verification for the bonus-prediction engine (Plan 3). Paste into the
-- Supabase SQL editor and Run. Creates a throwaway admin player, then asserts:
-- writes are blocked while the window is closed, accepted while open, editing
-- overwrites, blanks clear a slot, duplicate picks are rejected, lock_predictions
-- closes + reveals, and writes after lock are rejected. Then ROLLS BACK.
--
-- Expected: a NOTICE "PREDICTIONS SIMULATION PASSED" and no committed rows.

begin;

do $$
declare
  v_id     uuid := gen_random_uuid();
  v_cat    uuid;
  v_count  int;
  v_locked timestamptz;
begin
  -- Create a player via the signup trigger (display_name in raw_user_meta_data),
  -- then make them admin (so lock_predictions passes). Impersonate them.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'pred-sim@sim.local',
            jsonb_build_object('display_name', 'Pred Sim'));
  update profiles set is_admin = true where id = v_id;
  perform set_config('request.jwt.claim.sub', v_id::text, true);

  select id into v_cat from bonus_categories where is_active order by key limit 1;

  -- 1) window closed -> write rejected
  update game_config set predictions_open = false, predictions_locked_at = null where id = 1;
  begin
    perform public.save_bonus_category(v_cat, 'Messi', 'Mbappe');
    raise exception 'expected closed-window write to be rejected';
  exception when others then
    if sqlerrm <> 'the prediction window is closed' then
      raise exception 'wrong error for closed window: %', sqlerrm;
    end if;
  end;

  -- 2) open window -> write accepted (2 picks)
  update game_config set predictions_open = true where id = 1;
  perform public.save_bonus_category(v_cat, 'Messi', 'Mbappe');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 2 then raise exception 'expected 2 picks, got %', v_count; end if;

  -- 3) editing overwrites in place (still 2)
  perform public.save_bonus_category(v_cat, 'Haaland', 'Mbappe');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 2 then raise exception 'expected 2 picks after edit, got %', v_count; end if;

  -- 4) clearing slot 2 (blank) deletes it
  perform public.save_bonus_category(v_cat, 'Haaland', '');
  select count(*) into v_count from bonus_predictions
   where user_id = v_id and category_id = v_cat and is_active;
  if v_count <> 1 then raise exception 'expected 1 pick after clearing slot 2, got %', v_count; end if;

  -- 5) duplicate picks rejected
  begin
    perform public.save_bonus_category(v_cat, 'Pele', 'pele');
    raise exception 'expected duplicate picks to be rejected';
  exception when others then
    if sqlerrm <> 'your two picks for a category must be different' then
      raise exception 'wrong error for duplicate: %', sqlerrm;
    end if;
  end;

  -- 6) admin lock sets the flags + reveal trigger
  perform public.lock_predictions();
  select predictions_locked_at into v_locked from game_config where id = 1;
  if v_locked is null then raise exception 'lock_predictions did not set predictions_locked_at'; end if;
  if (select predictions_open from game_config where id = 1) <> false then
    raise exception 'lock_predictions should close the window';
  end if;

  -- 7) writing after lock is rejected
  begin
    perform public.save_bonus_category(v_cat, 'Ronaldo', '');
    raise exception 'expected post-lock write to be rejected';
  exception when others then
    if sqlerrm <> 'the prediction window is closed' then
      raise exception 'wrong error after lock: %', sqlerrm;
    end if;
  end;

  raise notice 'PREDICTIONS SIMULATION PASSED';
end;
$$;

rollback;
