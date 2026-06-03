-- ============================================================
-- Bonus predictions: submission window + kickoff lock (Plan 3).
-- Window opens with the draft (start_draft sets predictions_open=true) and is
-- closed by an admin via lock_predictions(), which also reveals everyone's
-- picks. Writes go through a security-definer RPC that enforces the open
-- window; reads use an RLS policy that reveals all picks once locked.
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- window state on game_config ----------
alter table game_config
  add column if not exists predictions_open      boolean not null default false,
  add column if not exists predictions_locked_at timestamptz;

-- ---------- start_draft(): now also opens the prediction window ----------
-- Reissued verbatim from 0005 with one added line: predictions_open = true.
create or replace function public.start_draft()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order  uuid[];
  v_tpp    int;
  v_teams  int;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can start the draft';
  end if;
  if (select current_phase from game_config where id = 1) <> 'registration' then
    raise exception 'draft can only be started from the registration phase';
  end if;

  select array_agg(id order by random()) into v_order from profiles;
  if v_order is null or array_length(v_order, 1) < 2 then
    raise exception 'need at least 2 registered players to start the draft';
  end if;

  select teams_per_player into v_tpp from game_config where id = 1;
  select count(*) into v_teams from teams;
  if array_length(v_order, 1) * v_tpp > v_teams then
    raise exception 'not enough teams (%) for % players x % picks', v_teams, array_length(v_order, 1), v_tpp;
  end if;

  update game_config
     set draft_order = v_order,
         current_phase = 'draft',
         draft_current_user_id = public._draft_player_at(v_order, 0),
         draft_turn_started_at = now(),
         registration_open = false,
         predictions_open = true,          -- open the bonus-prediction window with the draft
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- lock_predictions(): admin closes the window + reveals ----------
create or replace function public.lock_predictions()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can lock predictions';
  end if;
  if (select predictions_locked_at from game_config where id = 1) is not null then
    raise exception 'predictions are already locked';
  end if;
  update game_config
     set predictions_open = false,
         predictions_locked_at = now(),
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- save_bonus_category(): upsert/clear a player's 2 picks ----------
-- Authenticated caller saves their own picks for one category. Empty values
-- clear that slot. The two picks must differ. Only works while the window is
-- open. SECURITY DEFINER bypasses RLS for the write; direct client writes stay
-- denied (no insert/update/delete policy), so the open-window rule holds.
create or replace function public.save_bonus_category(
  p_category_id uuid,
  p_value1 text,
  p_value2 text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v1 text := nullif(btrim(coalesce(p_value1, '')), '');
  v2 text := nullif(btrim(coalesce(p_value2, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not coalesce((select predictions_open from game_config where id = 1), false) then
    raise exception 'the prediction window is closed';
  end if;
  if not exists (select 1 from bonus_categories where id = p_category_id and is_active) then
    raise exception 'no such active category';
  end if;
  if v1 is not null and v2 is not null and lower(v1) = lower(v2) then
    raise exception 'your two picks for a category must be different';
  end if;

  -- slot 1
  if v1 is null then
    delete from bonus_predictions
     where user_id = v_uid and category_id = p_category_id and pick_slot = 1 and is_active;
  else
    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_uid, p_category_id, 1, v1)
    on conflict (user_id, category_id, pick_slot) where is_active
    do update set pick_value = excluded.pick_value;
  end if;

  -- slot 2
  if v2 is null then
    delete from bonus_predictions
     where user_id = v_uid and category_id = p_category_id and pick_slot = 2 and is_active;
  else
    insert into bonus_predictions (user_id, category_id, pick_slot, pick_value)
    values (v_uid, p_category_id, 2, v2)
    on conflict (user_id, category_id, pick_slot) where is_active
    do update set pick_value = excluded.pick_value;
  end if;
end;
$$;

-- ---------- RLS: own picks always; everyone's once locked ----------
create policy "read own or revealed bonus predictions"
  on bonus_predictions for select to authenticated
  using (
    user_id = auth.uid()
    or (select predictions_locked_at from game_config where id = 1) is not null
  );

-- ---------- grants ----------
grant execute on function public.lock_predictions()                  to authenticated;
grant execute on function public.save_bonus_category(uuid, text, text) to authenticated;
-- start_draft() was already granted in 0005.
