/**
 * Agenda visual style presets. Orthogonal to the agenda "mode"
 * (day/week/month/tasks): mode picks which data slice is shown, style picks
 * the visual language it is rendered in. See
 * docs/superpowers/specs/2026-07-22-agenda-visual-style-design.md.
 */
export const AGENDA_STYLES_LIST = ['monospace', 'native', 'hybrid', 'table'] as const;

export type AgendaStyle = (typeof AGENDA_STYLES_LIST)[number];

export const DEFAULT_AGENDA_STYLE: AgendaStyle = 'hybrid';

/**
 * Coerce an arbitrary config value into a valid AgendaStyle. Unknown, empty,
 * or non-string input falls back to DEFAULT_AGENDA_STYLE so a corrupted
 * setting never breaks rendering.
 */
export function normalizeAgendaStyle(value: unknown): AgendaStyle {
    if (typeof value !== 'string') {
        return DEFAULT_AGENDA_STYLE;
    }
    const v = value.trim().toLowerCase();
    return (AGENDA_STYLES_LIST as readonly string[]).includes(v) ? (v as AgendaStyle) : DEFAULT_AGENDA_STYLE;
}
