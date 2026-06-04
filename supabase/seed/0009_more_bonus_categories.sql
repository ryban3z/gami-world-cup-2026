-- Three more bonus categories, added 2026-06-04 (before the kickoff lock).
-- Runner-Up + Wooden Spoon are team picks (dropdowns); Most Assists is free-text.
-- Idempotent — safe to re-run.
insert into bonus_categories (key, name) values
  ('runner_up',    'Runner-Up — Losing Finalist'),
  ('most_assists', 'Most Assists — Playmaker'),
  ('wooden_spoon', 'Wooden Spoon — Worst Team')
on conflict (key) do nothing;
