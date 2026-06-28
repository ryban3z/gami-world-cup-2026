-- ============================================================
-- Make the home dashboard roster cards (and the leaderboard "My teams" panel,
-- and manager profile pages) reflect the knockout swap once it locks.
--
-- draft_state() is the single read window for team_ownership, and its 'rosters'
-- + 'my_team_ids' were hard-wired to phase = 'group', so a manager who swapped
-- in resolve_knockout_realloc() never saw the team they picked up.
--
-- Once we're in knockout_locked / complete, the rosters now reflect the
-- post-swap ownership, and each roster also carries:
--   * claimed_team_ids  — free agents picked up via the swap (acquired_via='swap'),
--                          so the card can badge them "NEW".
--   * dropped_team_ids   — group teams the manager gave up (owned in 'group' but
--                          not in 'knockout'), so the card can still show them,
--                          dimmed/struck-through, rather than silently vanishing.
-- Both are empty in the group_locked / knockout_realloc phases (cards render
-- exactly as before).
--
-- This is a DISPLAY change only. Group scoring is untouched: the phase split is
-- preserved in `scores.breakdown.by_team` (group points stay on the group owner,
-- knockout points on the knockout owner), and the per-team points shown on a card
-- already sum across phases (lib/leaderboardView.buildRosterTeamPoints) — so a
-- dropped team still shows the points it banked in the group stage. picks_made
-- and the A-L draft board stay group-phase (they're the draft UI / progress).
--
-- Everything else in draft_state() is byte-identical to the 0005 definition.
-- ============================================================

create or replace function public.draft_state()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid          uuid := auth.uid();
  v_phase        game_phase;
  v_order        uuid[];
  v_current      uuid;
  v_tpp          int;
  v_revealed     boolean;
  -- Which ownership phase the rosters reflect: the post-swap knockout snapshot
  -- once it's locked, otherwise the group-stage draft.
  v_roster_phase owner_phase;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select current_phase, draft_order, draft_current_user_id, teams_per_player
    into v_phase, v_order, v_current, v_tpp
    from game_config where id = 1;

  -- Revealed once the draft is over (group_locked and every phase after it).
  v_revealed := v_phase not in ('registration', 'draft');
  v_roster_phase := case
    when v_phase in ('knockout_locked', 'complete') then 'knockout'
    else 'group'
  end::owner_phase;

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
       where o.phase = v_roster_phase and o.user_id = v_uid
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
            -- Group rows order by draft pick_order; knockout rows have no
            -- pick_order (nulls last) so they fall back to team name.
            select jsonb_agg(o2.team_id order by o2.pick_order nulls last, tn.name)
              from team_ownership o2
              join teams tn on tn.id = o2.team_id
             where o2.user_id = p.id and o2.phase = v_roster_phase
          ), '[]'::jsonb),
          -- Free agents picked up via the swap → "NEW" badge on the card.
          'claimed_team_ids', case when v_roster_phase = 'knockout' then coalesce((
            select jsonb_agg(k.team_id)
              from team_ownership k
             where k.user_id = p.id and k.phase = 'knockout' and k.acquired_via = 'swap'
          ), '[]'::jsonb) else '[]'::jsonb end,
          -- Group teams the manager dropped (owned in group, not carried into the
          -- knockouts) → shown dimmed/struck-through, not silently dropped.
          'dropped_team_ids', case when v_roster_phase = 'knockout' then coalesce((
            select jsonb_agg(g.team_id order by g.pick_order)
              from team_ownership g
             where g.user_id = p.id and g.phase = 'group'
               and not exists (
                 select 1 from team_ownership k2
                  where k2.user_id = p.id and k2.team_id = g.team_id and k2.phase = 'knockout'
               )
          ), '[]'::jsonb) else '[]'::jsonb end
        ) order by p.display_name
      ), '[]'::jsonb)
      from profiles p
      where exists (
        select 1 from team_ownership o3 where o3.user_id = p.id and o3.phase = v_roster_phase
      )
    ) else null end
  );
end;
$$;

grant execute on function public.draft_state() to authenticated;
