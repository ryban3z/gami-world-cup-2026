-- ============================================================
-- 0019_manager_avatars.sql
-- Point each manager at their committed photo under public/managers/.
-- Idempotent (keyed on the stable `display_name`), safe to re-run. Apply after
-- the image files are committed to public/managers/. Managers left unset fall
-- back to their initials on the profile page.
--
-- Paths are public/-relative (leading slash, no "public/"). Adjust the filename
-- to match whatever was actually committed, then run in the Supabase SQL editor.
-- ============================================================

update profiles set avatar_url = '/managers/ryban3z.png'           where display_name = 'ryban3z';
update profiles set avatar_url = '/managers/hans.png'              where display_name = 'Hans';
update profiles set avatar_url = '/managers/cravingdrumsticks.png' where display_name = 'CravingDrumsticks';
update profiles set avatar_url = '/managers/mzhong23.png'          where display_name = 'mzhong23';
update profiles set avatar_url = '/managers/ho1328.png'            where display_name = 'Ho1328';
update profiles set avatar_url = '/managers/w.png'                where display_name = 'W';
update profiles set avatar_url = '/managers/frimpong.png'          where display_name = 'Frimpong';
update profiles set avatar_url = '/managers/tallon-dor.png'        where display_name = 'tallon d’or';
update profiles set avatar_url = '/managers/hst.png'              where display_name = 'HST';
