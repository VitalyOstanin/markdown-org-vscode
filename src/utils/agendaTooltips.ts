/**
 * Hover-tooltip text for the terse agenda glyphs, so a user who does not yet
 * know the visual language can read what a flag / status dot / priority chip
 * means. Colour and shape still carry the meaning; the tooltip is the legend.
 *
 * The wording comes in as a `strings` argument (the `tooltips` section of the
 * active `AgendaStrings` dictionary, see agendaI18n.ts) rather than being
 * baked in, so the agenda speaks the language the user configured.
 *
 * These are inlined into the agenda webview via `.toString()`, so each body
 * must stay self-contained (no module-level imports -- hence the injected
 * strings and the injected `fill`; the `AgendaStrings` import is a type, erased
 * at compile time). Unknown inputs return '' (no tooltip) rather than guessing.
 */
import type { AgendaStrings } from './agendaI18n';

export type TooltipStrings = AgendaStrings['tooltips'];

/**
 * Task fields the detailed flag tooltip reads. All optional -- an older
 * extractor or an untimed task simply leaves them undefined, and the tooltip
 * falls back to the generic legend text.
 */
export interface FlagTooltipTask {
    timestamp_date?: string;
    timestamp_time?: string;
    timestamp_end_time?: string;
    timestamp_repeater?: string;
    // Next still-upcoming occurrence resolved by markdown-org-extract (ADR-0023);
    // the repeat tooltip prefers it over the stored (possibly overdue) anchor.
    timestamp_next?: string;
    // The occurrence after the day this row is drawn on (extract ADR-0029),
    // present only on a row that has a day of its own. Preferred over
    // `timestamp_next`, which answers the same question from today wherever
    // the row is read -- and so repeats one date down a whole week.
    timestamp_next_after?: string;
}

/**
 * Placeholder substitution, passed in rather than imported.
 *
 * These helpers are injected into the webview via `.toString()`, which carries
 * no module bindings, so they may not reach for a module-level import. The
 * caller supplies `formatString` from agendaI18n.ts (the webview inlines it
 * too), the same way `resolveTaskFlag` takes `isCancelled` -- one
 * implementation of `{0}` substitution instead of a private copy per helper.
 */
export type FormatString = (template: string, ...values: string[]) => string;

/**
 * Date rendering, passed in for the same reason as `fill`: this module is
 * injected into the webview as source text and cannot import. The caller
 * supplies `formatIsoDate` bound to the active locale (utils/formatIsoDate.ts),
 * so a tooltip writes the date the same way the offset column does.
 */
export type FormatDate = (iso: string) => string;

/**
 * Tooltip for a `.flag[data-flag]` type glyph. Mirrors TaskFlag in
 * agendaTaskFlag.ts. When `task` carries the timestamp fields, the tooltip
 * spells out the concrete date/time (e.g. `Deadline: 12.08.2026 14:00`);
 * without them it degrades to the generic legend. Kept self-contained
 * (substitution and date rendering arrive as arguments) for the `.toString()`
 * webview injection.
 */
export function flagTooltip(
    flag: string,
    strings: TooltipStrings,
    fill: FormatString,
    fmtDate: FormatDate,
    task?: FlagTooltipTask
): string {
    const t = task ?? {};
    const time = t.timestamp_time ?? '';
    const endTime = t.timestamp_end_time ?? '';
    // "<date> 14:00" / "<date> 14:00–15:00" / "<date>" / "" from a Y-M-D date;
    // the time part (if any) stays the same across occurrences.
    const whenOf = (iso: string): string => {
        const d = iso ? fmtDate(iso) : '';
        return d ? d + (time ? ' ' + time + (endTime ? '–' + endTime : '') : '') : '';
    };
    // Computed per branch rather than up front: every task row calls this
    // helper, most of them land in `default` (no flag), and formatting a date
    // there produced a value that was thrown away -- with a fresh
    // `Intl.DateTimeFormat` behind it on every row.
    switch (flag) {
        case 'cancelled':
            return strings.cancelled;
        case 'deadline': {
            const when = whenOf(t.timestamp_date ?? '');
            return when ? fill(strings.deadlineAt, when) : strings.deadline;
        }
        case 'scheduled': {
            const when = whenOf(t.timestamp_date ?? '');
            return when ? fill(strings.scheduledAt, when) : strings.scheduled;
        }
        case 'repeat': {
            const when = whenOf(t.timestamp_date ?? '');
            const rep = t.timestamp_repeater ? ' (' + t.timestamp_repeater + ')' : '';
            // A row drawn on a day of its own carries the occurrence after
            // that day (timestamp_next_after, extract ADR-0029); the copies
            // borrowed into today -- arrears and deadlines coming up -- carry
            // only the one after today. Preferring the former is what makes
            // Tuesday's row of a daily task say Wednesday instead of repeating
            // tomorrow's date on every day of the week.
            const next = t.timestamp_next_after ?? t.timestamp_next;
            if (next) {
                // markdown-org-extract resolved the occurrence
                // (ADR-0023, ADR-0029). An hour repeater is
                // projected there onto a whole-day grid with its N ignored, so
                // the stored clock time is not the time of that occurrence and
                // is left out; every other unit keeps the time of day.
                // Units are lower-case in the extractor's grammar, so the test is too.
                const hourly = (t.timestamp_repeater ?? '').trim().endsWith('h');
                const resolved = hourly ? fmtDate(next) : whenOf(next);
                return fill(strings.repeatingNext, rep, resolved);
            }
            // No resolved occurrence: the `tasks` scope, where the extractor
            // skips the next-occurrence pass entirely (extract ADR-0023) even
            // though the rows do carry `timestamp_date`, or an extractor older
            // than 0.11.0, which has no such field at all. The stored
            // anchor may itself be overdue, so it is named as the task's own
            // date rather than passed off as the next occurrence.
            return when ? fill(strings.repeatingOn, rep, when) : strings.repeating + rep;
        }
        default:
            return '';
    }
}

/** Tooltip for a `.status[data-attention]` dot. Mirrors AttentionLevel in agendaAttention.ts. */
export function attentionTooltip(level: string, strings: TooltipStrings): string {
    switch (level) {
        case 'done':
            return strings.attentionDone;
        case 'cancelled':
            return strings.attentionCancelled;
        case 'danger':
            return strings.attentionDanger;
        case 'normal':
            return strings.attentionNormal;
        default:
            return '';
    }
}

/** Tooltip for a `.priority[data-priority]` chip. Empty letter -> no tooltip. */
export function priorityTooltip(letter: string, strings: TooltipStrings, fill: FormatString): string {
    const upper = (letter || '').toUpperCase();
    if (!upper) {
        return '';
    }
    if (upper === 'A') {
        return fill(strings.priorityHighest, upper);
    }
    if (upper === 'C') {
        return fill(strings.priorityLowest, upper);
    }
    return fill(strings.priority, upper);
}
