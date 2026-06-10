-- ============================================================
-- 0026_manager_one_liners.sql
-- Simplified one-line manager bios (2026-06-10) for /managers/[id]
-- (profiles.summary) — supersedes the longer 0020 blurbs. Idempotent
-- (keyed on the stable `display_name`), safe to re-run. Run in the
-- Supabase SQL editor.
--
-- SQL note: single quotes inside the text are escaped by doubling ('').
-- `tallon d’or` is matched by his real curly apostrophe (see 346a697).
-- ============================================================

update profiles set summary =
'The app''s creator — maybe he''s rigged the game in his favour? Astute picks — expect him to do well.'
where display_name = 'ryban3z';

update profiles set summary =
'Used to live in London — maybe he has insider knowledge and went for England?'
where display_name = 'Hans';

update profiles set summary =
'Currently on a career break, which means far too much free time to decide his picks.'
where display_name = 'CravingDrumsticks';

update profiles set summary =
'Quiet, thoughtful, dry — but maybe too much confidence in Gabriel Magalhães with that Brazil pick.'
where display_name = 'mzhong23';

update profiles set summary =
'Clearly too busy working in his new job to make a good pick — South Korea just to please the Mrs.'
where display_name = 'Ho1328';

update profiles set summary =
'Drafted dead last in the snake and will be nursing the chip on his shoulder. Home ground advantage based in NYC.'
where display_name = 'W';

update profiles set summary =
'Still tired from his impromptu Budapest trip to watch Arsenal let the CL slip. Good patriotic Aussie though.'
where display_name = 'Frimpong';

update profiles set summary =
'Globe-trotting hobo with a guitar. Currently based in England just in case It''s Coming Home?'
where display_name = 'tallon d’or';

update profiles set summary =
'More of a train and plane lover than football players. Possible dark horse to watch.'
where display_name = 'HST';
