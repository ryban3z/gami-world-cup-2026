-- ============================================================
-- DEV / TESTING RESET — wipe game state back to a clean pre-draft
-- (registration) state so the draft, picks, and scoring can be re-run.
--
-- Paste into the Supabase SQL Editor and Run. Wrapped in a transaction,
-- so it's all-or-nothing.
--
-- PRESERVES: profiles (registered players), teams, bonus_categories,
--            scoring_rules, scoring_config, admin flags.
-- CLEARS:    all draft picks, bonus predictions, derived scores/standings,
--            swap nominations, and ingested matches; and resets the
--            game_config state machine + per-player wildcard usage.
--
-- ⚠️ Destructive. Intended for testing on a not-yet-live game. Running it
-- mid-tournament would erase picks/scores (rebuildable from source, but
-- picks/predictions are NOT — they'd be gone).
-- ============================================================

begin;

-- Game state + derived data (delete children/derived first).
delete from bonus_predictions;
delete from team_ownership;
delete from swap_nominations;
delete from scores;
delete from team_standings;
delete from matches;

-- Reset the single-row state machine to pre-draft.
update game_config
   set current_phase         = 'registration',
       draft_order           = '{}',
       draft_current_user_id  = null,
       draft_turn_started_at  = null,
       registration_open      = true,
       predictions_open       = false,
       predictions_locked_at  = null,
       updated_at             = now()
 where id = 1;

-- Clear per-category resolved answers and per-player wildcard usage.
update bonus_categories set resolved_answer = null;
update profiles set wildcard_used_at = null;

commit;

-- Sanity check (optional): should show registration, empty order, no picks.
-- select current_phase, registration_open, predictions_open,
--        array_length(draft_order, 1) as players_in_order
--   from game_config where id = 1;
-- select count(*) as draft_picks from team_ownership;
