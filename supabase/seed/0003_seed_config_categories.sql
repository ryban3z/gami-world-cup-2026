-- Seed the single game_config row and the 5 bonus categories.
insert into game_config (id, current_phase) values (1, 'registration')
on conflict (id) do nothing;

insert into bonus_categories (key, name) values
  ('golden_boot',  'Golden Boot — Top Scorer'),
  ('golden_ball',  'Golden Ball — Best Player'),
  ('golden_glove', 'Golden Glove — Best Goalkeeper'),
  ('young_player',  'Best Young Player'),
  ('tournament_winner', 'Tournament Winner')
on conflict (key) do nothing;
