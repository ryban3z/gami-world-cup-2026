-- ============================================================
-- Snake draft engine (Plan 2). All rules enforced server-side in
-- security-definer functions so they hold atomically and cannot be
-- bypassed from the client. team_ownership stays directly unreadable;
-- draft_state() is the only read window (blind-during / reveal-after).
-- Canonical design: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ---------- internal: who picks at a given 0-based pick index ----------
-- Mirrors lib/draft.ts playerIndexForPick. Even rounds forward, odd reverse.
create or replace function public._draft_player_at(p_order uuid[], p_pick int)
returns uuid
language plpgsql
immutable
as $$
declare
  n     int := array_length(p_order, 1);
  rnd   int := p_pick / n;     -- integer division, 0-based round
  pos   int := p_pick % n;
begin
  if n is null or n = 0 then
    return null;
  end if;
  if rnd % 2 = 1 then
    pos := n - 1 - pos;        -- reverse on odd rounds
  end if;
  return p_order[pos + 1];     -- Postgres arrays are 1-based
end;
$$;

-- ---------- internal: insert one pick, advance the turn, auto-reveal ----------
-- Assumes the caller has already validated phase, turn ownership, and team
-- availability. Writes the team_ownership row for p_user, then either advances
-- draft_current_user_id to the next snake picker or, on the final pick, flips
-- current_phase to 'group_locked' (the reveal) and clears the current picker.
create or replace function public._apply_pick(p_user uuid, p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order uuid[];
  v_tpp   int;
  v_made  int;      -- picks already made before this one
  v_total int;
begin
  select draft_order, teams_per_player into v_order, v_tpp
    from game_config where id = 1;

  v_made  := (select count(*) from team_ownership where phase = 'group');
  v_total := array_length(v_order, 1) * v_tpp;

  insert into team_ownership (user_id, team_id, phase, pick_order, snake_round, acquired_via)
  values (
    p_user,
    p_team,
    'group',
    v_made + 1,                         -- 1-based overall pick number
    (v_made / array_length(v_order, 1)) + 1,  -- 1-based snake round
    'draft'
  );

  if v_made + 1 >= v_total then
    -- Final pick: auto-reveal.
    update game_config
       set current_phase = 'group_locked',
           draft_current_user_id = null,
           draft_turn_started_at = null,
           updated_at = now()
     where id = 1;
  else
    update game_config
       set draft_current_user_id = public._draft_player_at(v_order, v_made + 1),
           draft_turn_started_at = now(),
           updated_at = now()
     where id = 1;
  end if;
end;
$$;

-- ---------- start_draft(): admin opens the draft ----------
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
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- make_pick(team_id): the current player drafts a team ----------
create or replace function public.make_pick(p_team_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select current_phase from game_config where id = 1) <> 'draft' then
    raise exception 'the draft is not currently open';
  end if;
  if (select draft_current_user_id from game_config where id = 1) <> auth.uid() then
    raise exception 'it is not your turn';
  end if;
  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'no such team';
  end if;
  if exists (select 1 from team_ownership where team_id = p_team_id and phase = 'group') then
    raise exception 'that team is already taken';
  end if;

  perform public._apply_pick(auth.uid(), p_team_id);
end;
$$;

-- ---------- admin_autopick(): admin assigns a random available team to the current player ----------
create or replace function public.admin_autopick()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_current uuid;
  v_team    uuid;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'only an admin can auto-pick';
  end if;
  if (select current_phase from game_config where id = 1) <> 'draft' then
    raise exception 'the draft is not currently open';
  end if;

  select draft_current_user_id into v_current from game_config where id = 1;
  if v_current is null then
    raise exception 'no current picker';
  end if;

  select t.id into v_team
    from teams t
   where not exists (
     select 1 from team_ownership o where o.team_id = t.id and o.phase = 'group'
   )
   order by random()
   limit 1;
  if v_team is null then
    raise exception 'no available teams left';
  end if;

  perform public._apply_pick(v_current, v_team);
end;
$$;

-- ---------- draft_state(): the single authenticated read window ----------
-- Returns phase, whose turn, progress, the 48-team board, the caller's own
-- picks, and (only once revealed) full rosters. Owners on the board are hidden
-- while current_phase = 'draft'. SECURITY DEFINER bypasses RLS, so this is the
-- only way clients see team_ownership — blind-during / reveal-after lives here.
create or replace function public.draft_state()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid      uuid := auth.uid();
  v_phase    game_phase;
  v_order    uuid[];
  v_current  uuid;
  v_tpp      int;
  v_revealed boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select current_phase, draft_order, draft_current_user_id, teams_per_player
    into v_phase, v_order, v_current, v_tpp
    from game_config where id = 1;

  -- Revealed once the draft is over (group_locked and every phase after it).
  v_revealed := v_phase not in ('registration', 'draft');

  return jsonb_build_object(
    'phase', v_phase,
    'is_admin', coalesce((select is_admin from profiles where id = v_uid), false),
    'current_user_id', v_current,
    'current_user_name', (select display_name from profiles where id = v_current),
    'is_my_turn', (v_current = v_uid),
    'picks_made', (select count(*) from team_ownership where phase = 'group'),
    'picks_total', coalesce(array_length(v_order, 1), 0) * v_tpp,
    'order_names', (
      select coalesce(jsonb_agg(p.display_name order by ord.idx), '[]'::jsonb)
        from unnest(v_order) with ordinality as ord(uid, idx)
        join profiles p on p.id = ord.uid
    ),
    'my_team_ids', (
      select coalesce(jsonb_agg(o.team_id), '[]'::jsonb)
        from team_ownership o
       where o.phase = 'group' and o.user_id = v_uid
    ),
    'board', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'group_letter', t.group_letter,
          'flag_url', t.flag_url,
          'taken', (o.team_id is not null),
          'owner_name', case when v_revealed then own.display_name else null end
        ) order by t.group_letter, t.name
      ), '[]'::jsonb)
      from teams t
      left join team_ownership o on o.team_id = t.id and o.phase = 'group'
      left join profiles own on own.id = o.user_id
    ),
    'rosters', case when v_revealed then (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'display_name', p.display_name,
          'team_ids', coalesce((
            select jsonb_agg(o2.team_id order by o2.pick_order)
              from team_ownership o2
             where o2.user_id = p.id and o2.phase = 'group'
          ), '[]'::jsonb)
        ) order by p.display_name
      ), '[]'::jsonb)
      from profiles p
      where exists (
        select 1 from team_ownership o3 where o3.user_id = p.id and o3.phase = 'group'
      )
    ) else null end
  );
end;
$$;

-- ---------- grants ----------
grant execute on function public.start_draft()      to authenticated;
grant execute on function public.make_pick(uuid)    to authenticated;
grant execute on function public.admin_autopick()   to authenticated;
grant execute on function public.draft_state()      to authenticated;
-- _draft_player_at and _apply_pick are internal: no grant (callable only from
-- the definer functions above, which run as owner).
