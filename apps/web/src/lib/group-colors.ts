/** Palette a group's colour is picked from. Kept to hand-picked hues that stay
 *  legible as a 8px dot on both the light and the dark surface, so charts and
 *  group dots never render a colour the theme can't carry. */
export const GROUP_COLORS = [
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Fuchsia", hex: "#d946ef" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Slate", hex: "#64748b" },
] as const;

/** Colour a brand-new group opens on, so two groups created in a row don't both
 *  land on the same default. */
export function randomGroupColor(): string {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)].hex;
}
