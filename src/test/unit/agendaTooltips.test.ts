import * as assert from 'assert';
import { suite, test } from 'mocha';
import { attentionTooltip, flagTooltip, priorityTooltip } from '../../utils/agendaTooltips';
import { AGENDA_STRINGS, formatString } from '../../utils/agendaI18n';
import { formatIsoDate } from '../../utils/formatIsoDate';

// These map the terse table-style glyphs / dot colours / priority letters to
// the hover text that explains them. The webview embeds the sources via
// `.toString()`, so these unit tests transitively cover the runtime tooltips.
// The wording arrives as an argument, so the same helpers speak whichever
// language the agenda is configured for (see agendaI18n.ts).
const EN = AGENDA_STRINGS.en.tooltips;
const RU = AGENDA_STRINGS.ru.tooltips;
// Dates arrive already localized (the webview binds the active locale), so the
// expectations below spell out the Russian numeric order. The locale-driven
// ordering itself is covered in formatIsoDate.test.ts.
const fmtRu = (iso: string) => formatIsoDate(iso, 'ru-RU');

suite('agenda tooltips', () => {
    test('flagTooltip covers every TaskFlag value', () => {
        assert.strictEqual(flagTooltip('cancelled', EN, formatString, fmtRu), 'Cancelled');
        assert.strictEqual(flagTooltip('deadline', EN, formatString, fmtRu), 'Has a deadline');
        assert.strictEqual(flagTooltip('repeat', EN, formatString, fmtRu), 'Repeating task');
        assert.strictEqual(flagTooltip('scheduled', EN, formatString, fmtRu), 'Scheduled at a set time');
        // The empty flag (no glyph) must produce no tooltip.
        assert.strictEqual(flagTooltip('', EN, formatString, fmtRu), '');
    });

    test('flagTooltip is empty for an unknown value rather than guessing', () => {
        assert.strictEqual(flagTooltip('something-else', EN, formatString, fmtRu), '');
    });

    test('flagTooltip spells out the deadline date and time when the task carries them', () => {
        assert.strictEqual(
            flagTooltip('deadline', EN, formatString, fmtRu, { timestamp_date: '2026-08-12', timestamp_time: '14:00' }),
            'Deadline: 12.08.2026 14:00'
        );
        // Date only (no clock time) -> date without a time.
        assert.strictEqual(
            flagTooltip('deadline', EN, formatString, fmtRu, { timestamp_date: '2026-08-12' }),
            'Deadline: 12.08.2026'
        );
        // No timestamp fields -> generic legend fallback.
        assert.strictEqual(flagTooltip('deadline', EN, formatString, fmtRu, {}), 'Has a deadline');
    });

    test('flagTooltip spells out a scheduled date, including an end time when present', () => {
        assert.strictEqual(
            flagTooltip('scheduled', EN, formatString, fmtRu, {
                timestamp_date: '2026-08-12',
                timestamp_time: '14:00',
                timestamp_end_time: '15:00'
            }),
            'Scheduled: 12.08.2026 14:00–15:00'
        );
        assert.strictEqual(flagTooltip('scheduled', EN, formatString, fmtRu, {}), 'Scheduled at a set time');
    });

    test('flagTooltip repeat: prefers the extractor-resolved next occurrence', () => {
        // markdown-org-extract already rolled the overdue anchor (21.07) forward
        // to the next upcoming date (28.07) in timestamp_next; the tooltip shows
        // that, not the stored past anchor.
        assert.strictEqual(
            flagTooltip('repeat', EN, formatString, fmtRu, {
                timestamp_date: '2026-07-21',
                timestamp_repeater: '++7d',
                timestamp_next: '2026-07-28'
            }),
            'Repeating (++7d) — next 28.07.2026'
        );
        // The clock time (if any) rides along with the resolved next date.
        assert.strictEqual(
            flagTooltip('repeat', EN, formatString, fmtRu, {
                timestamp_date: '2026-07-24',
                timestamp_time: '14:00',
                timestamp_repeater: '++7d',
                timestamp_next: '2026-07-31'
            }),
            'Repeating (++7d) — next 31.07.2026 14:00'
        );
    });

    test('flagTooltip repeat: an hour repeater keeps the date but drops the clock time', () => {
        // markdown-org-extract projects `+Nh` onto a whole-day grid and ignores
        // N, so the resolved date is a day, not a slot: the stored 14:00 is not
        // the time of that occurrence and must not be glued onto it.
        assert.strictEqual(
            flagTooltip('repeat', EN, formatString, fmtRu, {
                timestamp_date: '2026-07-24',
                timestamp_time: '14:00',
                timestamp_repeater: '+3h',
                timestamp_next: '2026-07-25'
            }),
            'Repeating (+3h) — next 25.07.2026'
        );
    });

    test('flagTooltip repeat: without timestamp_next the stored date is not called "next"', () => {
        // `tasks` mode (ADR-0009) and older extractors emit no timestamp_next.
        // The stored anchor may already be in the past, so it is named as the
        // task's own date instead of as the next occurrence.
        assert.strictEqual(
            flagTooltip('repeat', EN, formatString, fmtRu, {
                timestamp_date: '2026-08-12',
                timestamp_repeater: '++7d'
            }),
            'Repeating (++7d) — dated 12.08.2026'
        );
        assert.strictEqual(
            flagTooltip('repeat', RU, formatString, fmtRu, {
                timestamp_date: '2026-08-12',
                timestamp_repeater: '++7d'
            }),
            'Повторяется (++7d) — дата 12.08.2026'
        );
        // Repeater without any resolved date still names the rule.
        assert.strictEqual(
            flagTooltip('repeat', EN, formatString, fmtRu, { timestamp_repeater: '++7d' }),
            'Repeating task (++7d)'
        );
        assert.strictEqual(flagTooltip('repeat', EN, formatString, fmtRu, {}), 'Repeating task');
    });

    test('flagTooltip: cancelled ignores timestamp detail', () => {
        assert.strictEqual(
            flagTooltip('cancelled', EN, formatString, fmtRu, { timestamp_date: '2026-08-12' }),
            'Cancelled'
        );
    });

    test('flagTooltip speaks the language it is handed, dates and all', () => {
        assert.strictEqual(flagTooltip('cancelled', RU, formatString, fmtRu), 'Отменено');
        assert.strictEqual(
            flagTooltip('deadline', RU, formatString, fmtRu, { timestamp_date: '2026-08-12', timestamp_time: '14:00' }),
            'Крайний срок: 12.08.2026 14:00'
        );
        assert.strictEqual(
            flagTooltip('repeat', RU, formatString, fmtRu, {
                timestamp_repeater: '++7d',
                timestamp_next: '2026-07-28'
            }),
            'Повторяется (++7d) — следующее 28.07.2026'
        );
    });

    test('attentionTooltip covers every AttentionLevel value', () => {
        assert.strictEqual(attentionTooltip('done', EN), 'Done');
        assert.strictEqual(attentionTooltip('cancelled', EN), 'Cancelled');
        assert.strictEqual(attentionTooltip('danger', EN), 'Deadline or overdue — needs action');
        assert.strictEqual(attentionTooltip('normal', EN), 'On schedule');
        assert.strictEqual(attentionTooltip('danger', RU), 'Крайний срок или просрочка — требует действия');
    });

    test('attentionTooltip is empty for an unknown value', () => {
        assert.strictEqual(attentionTooltip('whatever', EN), '');
    });

    test('priorityTooltip names the letter and flags the extremes', () => {
        assert.strictEqual(priorityTooltip('A', EN, formatString), 'Priority A (highest)');
        assert.strictEqual(priorityTooltip('B', EN, formatString), 'Priority B');
        assert.strictEqual(priorityTooltip('C', EN, formatString), 'Priority C (lowest)');
        assert.strictEqual(priorityTooltip('A', RU, formatString), 'Приоритет A (высший)');
    });

    test('priorityTooltip lower-cases-insensitively and trims empties', () => {
        // renderTask passes the raw letter; empty means no priority -> no tooltip.
        assert.strictEqual(priorityTooltip('', EN, formatString), '');
        // A stray lowercase letter should still read sensibly.
        assert.strictEqual(priorityTooltip('a', EN, formatString), 'Priority A (highest)');
    });
});
