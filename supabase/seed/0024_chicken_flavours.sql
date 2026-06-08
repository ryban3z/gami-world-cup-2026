-- ============================================================
-- 0024_chicken_flavours.sql
-- The pool-wide running gag: each manager's "fried chicken order"
-- (profiles.chicken_flavour), shown on /managers/[id]. Idempotent (keyed on the
-- stable `display_name`), safe to re-run. Run in the Supabase SQL editor.
-- ============================================================

update profiles set chicken_flavour = 'Gami Original — but asks if they''ll boil it instead, for Ronaldo''s abs.' where display_name = 'ryban3z';
update profiles set chicken_flavour = 'Gami Snowing, hold the cheese — just a little white seasoning.'        where display_name = 'Hans';
update profiles set chicken_flavour = 'KFC Zinger Box — the lone defector from the Gami church.'              where display_name = 'CravingDrumsticks';
update profiles set chicken_flavour = 'Gami Yangnyeom, sweet & spicy, inhaled in silence between patients.'    where display_name = 'mzhong23';
update profiles set chicken_flavour = 'Gami Ganjang soy-garlic, with a fermented yoghurt chaser.'             where display_name = 'Ho1328';
update profiles set chicken_flavour = 'Gami Half & Half — the dark horse refuses to commit to one flavour.'   where display_name = 'W';
update profiles set chicken_flavour = 'Gami Smoky — something slow-burning to nurse the Budapest heartbreak.' where display_name = 'Frimpong';
update profiles set chicken_flavour = 'Gami Spicy — though he''ll insist, brooding, that Paris does it better.' where display_name = 'tallon d''or';
update profiles set chicken_flavour = 'Gami Original, every single time — reliable as a train timetable.' where display_name = 'HST';
