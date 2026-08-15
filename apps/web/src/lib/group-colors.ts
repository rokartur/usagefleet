/** Palette a group's colour is picked from. Kept to hand-picked hues that stay
 *  legible as a 8px dot on both the light and the dark surface, so charts and
 *  group dots never render a colour the theme can't carry. */
export const GROUP_COLORS = [
	{ hex: '#6366f1', name: 'Indigo' },
	{ hex: '#8b5cf6', name: 'Violet' },
	{ hex: '#d946ef', name: 'Fuchsia' },
	{ hex: '#ec4899', name: 'Pink' },
	{ hex: '#ef4444', name: 'Red' },
	{ hex: '#f97316', name: 'Orange' },
	{ hex: '#f59e0b', name: 'Amber' },
	{ hex: '#84cc16', name: 'Lime' },
	{ hex: '#10b981', name: 'Emerald' },
	{ hex: '#14b8a6', name: 'Teal' },
	{ hex: '#06b6d4', name: 'Cyan' },
	{ hex: '#3b82f6', name: 'Blue' },
	{ hex: '#64748b', name: 'Slate' },
] as const

/** Colour a brand-new group opens on, so two groups created in a row don't both
 *  land on the same default. */
export function randomGroupColor(): string {
	return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)].hex
}
