-- ============================================================
-- 0020_manager_summaries.sql
-- Humorous per-manager blurbs for /managers/[id] (profiles.summary).
-- Each riffs on the manager's real roster + personality. Idempotent (keyed on
-- the stable `display_name`), safe to re-run. Supersedes any earlier summary
-- seed. Run in the Supabase SQL editor.
--
-- SQL note: single quotes inside the text are escaped by doubling ('').
-- ============================================================

update profiles set summary =
'The app''s creator — so who''s to say he hasn''t slipped in a line or two of code to nudge things his way. A Chelsea supporter based in Barcelona, so he''s got that Spain bias baked in. Quietly counting on Ronaldo''s selfishness, boiled chicken and rock-hard abs to propel Portugal to the final.'
where display_name = 'ryban3z';

update profiles set summary =
'A high-flying Director of Legal at a Big Four firm, and a former Londoner — maybe that local knowledge hands England the edge. Norway and Sweden are the real gamble, though: Scandinavians built for the cold, dropped into a North American summer. Expect them to wilt.'
where display_name = 'Hans';

update profiles set summary =
'Chaotic good, with zero patience for stupidity or anyone who can''t get shit done. Currently on a career break, which means far too much free time — most of it spent overanalysing a roster of Argentina, Mexico and Switzerland he''d have locked in within seconds if work were keeping him busy.'
where display_name = 'CravingDrumsticks';

update profiles set summary =
'A neurologist with barely a minute to look past his beloved Arsenal — not between patients, Strava kms and three daughters. All but silent in the group chat, yet he''s drafted Brazil, Uruguay and Turkey: three of the loudest footballing nations on the planet.'
where display_name = 'mzhong23';

update profiles set summary =
'Non-stop working — recently took over as head of Strategy at Coles, and whatever hours are left go into dreaming up the next fermented yoghurt brand for Australia, not scouting his squad. South Korea is pure husbandly devotion (his wife''s from there); Spain and Croatia are pure luck, gifted by a kind snake-draft order.'
where display_name = 'Ho1328';

update profiles set summary =
'The pool''s dark horse. New York-based, which drops him right in the beating heart of the World Cup — he''ll be in the stands for a few games while everyone else watches on a screen. Drafted dead last in the snake and still nursing the chip on his shoulder, he''s banking on the Netherlands, Ecuador and Austria — and a steady supply of fried chicken — to make the rest regret the order.'
where display_name = 'W';

update profiles set summary =
'Another Arsenal man, still basking in the Premier League title — enough to fly out to Budapest for the Champions League final against PSG, only to taste agonising defeat on penalties. A glutton for a tense finish, then, which might explain a roster of Belgium, Ivory Coast and Australia.'
where display_name = 'Frimpong';

update profiles set summary =
'A brooding, moody artist forever circling the globe in search of his next adventure. London is the current base — though with France his headline pick, he''d be better off decamping to Paris. Colombia and Morocco round out a roster as restless and well-travelled as he is.'
where display_name = 'tallon d’or';

update profiles set summary =
'Stumbled into the pool more or less by accident — a devoted trainspotter, not a football man. He''ll quietly will England on out of pure national affection, but his actual roster — Germany, USA and Canada — hints at a very different, possibly timetable-based, drafting strategy.'
where display_name = 'HST';
