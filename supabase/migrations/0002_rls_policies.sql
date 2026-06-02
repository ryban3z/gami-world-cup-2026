-- ============================================================
-- Row Level Security: deny-by-default on every table, with explicit
-- read policies for reference data and self-access for profiles.
-- Per-feature write/visibility policies for team_ownership and
-- bonus_predictions land in Plans 2 & 3.
-- ============================================================

-- Enable RLS on every table (deny-by-default until a policy grants access).
alter table profiles          enable row level security;
alter table teams             enable row level security;
alter table game_config       enable row level security;
alter table team_ownership    enable row level security;
alter table swap_nominations  enable row level security;
alter table bonus_categories  enable row level security;
alter table bonus_predictions enable row level security;
alter table matches           enable row level security;
alter table team_standings    enable row level security;
alter table scoring_rules     enable row level security;
alter table scoring_config    enable row level security;
alter table scores            enable row level security;

-- Reference data: any authenticated user may read.
create policy "auth read teams"            on teams            for select to authenticated using (true);
create policy "auth read game_config"      on game_config      for select to authenticated using (true);
create policy "auth read bonus_categories" on bonus_categories for select to authenticated using (true);
create policy "auth read scoring_rules"    on scoring_rules    for select to authenticated using (true);
create policy "auth read scoring_config"   on scoring_config   for select to authenticated using (true);

-- Profiles: a user reads everyone's display name (needed for leaderboard/draft),
-- but may only update their own row; inserts happen via the security-definer trigger.
create policy "auth read profiles"   on profiles for select to authenticated using (true);
create policy "update own profile"   on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
