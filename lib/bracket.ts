// Static knockout-bracket topology for WC 2026 (the "road to the final"). No IO.
//
// The schema stores knockout matches as flat rows keyed by football-data
// `external_id` with no link saying which match feeds which — this file supplies
// that spine for the Round of 16 onward, where the structure is fixed and
// publicly known. The mapping was confirmed against the published bracket:
//
//   external_id 537375..537390 == FIFA match numbers M89..M104 (ascending), so
//   R16 = 537375..537382 (M89-96), QF = 537383..537386 (M97-100),
//   SF  = 537387..537388 (M101-102), third = 537389 (M103), final = 537390 (M104).
//
// Confirmed feeder structure (winner of match X advances to…):
//   R16:  M89=W74/W77  M90=W73/W75  M91=W76/W78  M92=W79/W80
//         M93=W83/W84  M94=W81/W82  M95=W86/W88  M96=W85/W87
//   QF:   M97=W89/W90  M98=W93/W94  M99=W91/W92  M100=W95/W96
//   SF:   M101=W97/W98 M102=W99/W100        Final: M104=W101/W102
//
// The 16 Round-of-32 fixtures (537415..537430) are deliberately NOT in this
// spine: football-data's R32 ids are not in match-number order, so rather than
// hard-code a fragile mapping we attach each R32 match to its R16 parent
// dynamically in bracketView.ts (the R16 slot whose team is that R32's winner).
// The spine still pins every R32 match to a half once it resolves.

export type SpineStage = "r16" | "qf" | "sf" | "final" | "third_place";

export interface BracketSpineNode {
  externalId: string;
  stage: SpineStage;
  // Which side of the split draw the node sits on. The two semi-final subtrees
  // are "left" and "right"; the final + third-place play-off are "center".
  half: "left" | "right" | "center";
  order: number; // vertical order within its (half, stage) column, top-to-bottom
  feedsInto: string | null; // external_id of the next-round match, null for final/third
}

// Left half is the top of the draw (→ SF 537387), right half the bottom
// (→ SF 537388). order values stack the column top-to-bottom.
export const BRACKET_SPINE: BracketSpineNode[] = [
  // ── Left half → Semi-final 537387 (M101) ──
  { externalId: "537375", stage: "r16", half: "left", order: 0, feedsInto: "537383" }, // M89
  { externalId: "537376", stage: "r16", half: "left", order: 1, feedsInto: "537383" }, // M90
  { externalId: "537379", stage: "r16", half: "left", order: 2, feedsInto: "537384" }, // M93
  { externalId: "537380", stage: "r16", half: "left", order: 3, feedsInto: "537384" }, // M94
  { externalId: "537383", stage: "qf", half: "left", order: 0, feedsInto: "537387" }, // M97
  { externalId: "537384", stage: "qf", half: "left", order: 1, feedsInto: "537387" }, // M98
  { externalId: "537387", stage: "sf", half: "left", order: 0, feedsInto: "537390" }, // M101

  // ── Right half → Semi-final 537388 (M102) ──
  { externalId: "537377", stage: "r16", half: "right", order: 0, feedsInto: "537385" }, // M91
  { externalId: "537378", stage: "r16", half: "right", order: 1, feedsInto: "537385" }, // M92
  { externalId: "537381", stage: "r16", half: "right", order: 2, feedsInto: "537386" }, // M95
  { externalId: "537382", stage: "r16", half: "right", order: 3, feedsInto: "537386" }, // M96
  { externalId: "537385", stage: "qf", half: "right", order: 0, feedsInto: "537388" }, // M99
  { externalId: "537386", stage: "qf", half: "right", order: 1, feedsInto: "537388" }, // M100
  { externalId: "537388", stage: "sf", half: "right", order: 0, feedsInto: "537390" }, // M102

  // ── Centre ──
  { externalId: "537390", stage: "final", half: "center", order: 0, feedsInto: null }, // M104
  { externalId: "537389", stage: "third_place", half: "center", order: 1, feedsInto: null }, // M103
];

export const FINAL_EXTERNAL_ID = "537390";
export const THIRD_PLACE_EXTERNAL_ID = "537389";

// external_id → spine node, for quick lookups in the view layer.
export const SPINE_BY_ID: ReadonlyMap<string, BracketSpineNode> = new Map(
  BRACKET_SPINE.map((n) => [n.externalId, n]),
);
