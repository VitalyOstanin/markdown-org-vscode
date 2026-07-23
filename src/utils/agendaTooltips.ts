/**
 * Hover-tooltip text for the terse agenda glyphs, so a user who does not yet
 * know the visual language can read what a flag / status dot / priority chip
 * means. Colour and shape still carry the meaning; the tooltip is the legend.
 *
 * These are inlined into the agenda webview via `.toString()`, so each body
 * must stay self-contained (no module-level imports). Unknown inputs return
 * '' (no tooltip) rather than guessing.
 */

/** Tooltip for a `.flag[data-flag]` type glyph. Mirrors TaskFlag in agendaTaskFlag.ts. */
export function flagTooltip(flag: string): string {
    switch (flag) {
        case 'cancelled':
            return 'Cancelled';
        case 'deadline':
            return 'Has a deadline';
        case 'repeat':
            return 'Repeating task';
        case 'scheduled':
            return 'Scheduled at a set time';
        default:
            return '';
    }
}

/** Tooltip for a `.status[data-attention]` dot. Mirrors AttentionLevel in agendaAttention.ts. */
export function attentionTooltip(level: string): string {
    switch (level) {
        case 'done':
            return 'Done';
        case 'cancelled':
            return 'Cancelled';
        case 'danger':
            return 'Deadline or overdue — needs action';
        case 'normal':
            return 'On schedule';
        default:
            return '';
    }
}

/** Tooltip for a `.priority[data-priority]` chip. Empty letter -> no tooltip. */
export function priorityTooltip(letter: string): string {
    const upper = (letter || '').toUpperCase();
    if (!upper) {
        return '';
    }
    if (upper === 'A') {
        return 'Priority A (highest)';
    }
    if (upper === 'C') {
        return 'Priority C (lowest)';
    }
    return 'Priority ' + upper;
}
