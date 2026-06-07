-- ============================================================
-- Single-pick team categories (bug fix, 2026-06-07).
-- Tournament Winner, Runner-Up and Wooden Spoon each have exactly one
-- correct answer, so they get ONE pick — not two. Player awards (Golden
-- Boot, etc.) still allow two guesses. This:
--   1. Reissues save_bonus_category() to force slot 2 empty for the three
--      single-pick keys (defense in depth — the form already renders one slot).
--   2. Clears any slot-2 rows that were saved for those categories before the fix.
-- Idempotent — safe to re-run.
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- save_bonus_category(): single-pick guard for team categories ----------
-- Reissued from 0006 with one added rule: for the single-pick team categories,
-- the second pick is ignored (treated as empty), so slot 2 is never stored.
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
  v_key text;
  v1 text := nullif(btrim(coalesce(p_value1, '')), '');
  v2 text := nullif(btrim(coalesce(p_value2, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not coalesce((select predictions_open from game_config where id = 1), false) then
    raise exception 'the prediction window is closed';
  end if;
  select key into v_key from bonus_categories where id = p_category_id and is_active;
  if v_key is null then
    raise exception 'no such active category';
  end if;

  -- Single-pick categories: there's only one winner / runner-up / worst team,
  -- so ignore any second pick (and never persist a slot-2 row).
  if v_key in ('tournament_winner', 'runner_up', 'wooden_spoon') then
    v2 := null;
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

-- ---------- one-time cleanup: drop stale slot-2 picks on team categories ----------
delete from bonus_predictions
 where pick_slot = 2
   and category_id in (
     select id from bonus_categories
      where key in ('tournament_winner', 'runner_up', 'wooden_spoon')
   );

grant execute on function public.save_bonus_category(uuid, text, text) to authenticated;
