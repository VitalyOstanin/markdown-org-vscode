import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { renderCard, renderTaskRow } from '../../utils/agendaCardHtml';
import type { TaskRowContext } from '../../utils/agendaCardHtml';
import type { TaskWithOffset } from '../../types';
import { escapeHtml } from '../../utils/agendaEscapeHtml';
import { sanitizeTaskLine } from '../../utils/agendaClick';
import { isCancelled } from '../../utils/normalizeTaskType';
import { resolveTaskFlag } from '../../utils/agendaTaskFlag';
import { resolveAttentionLevel } from '../../utils/agendaAttention';
import { resolveHeadingClass } from '../../utils/agendaHeadingTint';
import {
    attentionTooltip,
    flagTooltip,
    headingTooltip,
    offsetTooltip,
    priorityTooltip,
    timeTooltip
} from '../../utils/agendaTooltips';
import { AGENDA_STRINGS, formatString } from '../../utils/agendaI18n';

const EN = AGENDA_STRINGS.en;

function parse(html: string): Document {
    return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

// The real helpers, so a row is asserted as the page actually renders it.
const ctx: TaskRowContext = {
    tooltips: EN.tooltips,
    escapeHtml,
    formatString,
    // Deliberately recognisable, so the offset column and the flag tooltip can
    // be told apart from raw ISO text.
    formatDate: (iso: string): string => `[${iso}]`,
    sanitizeTaskLine,
    isCancelled,
    resolveTaskFlag,
    resolveAttentionLevel,
    resolveHeadingClass,
    attentionTooltip,
    flagTooltip,
    priorityTooltip,
    timeTooltip,
    headingTooltip,
    offsetTooltip,
    // The page binds this to the locale-aware counter; a fixed English form is
    // all the row needs, and it keeps the assertions readable.
    countDays: (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`
};

function task(overrides: Partial<TaskWithOffset> = {}): TaskWithOffset {
    return {
        file: '/w/notes.md',
        line: 12,
        heading: 'Write the report',
        content: '',
        task_type: 'TODO',
        timestamp_type: 'SCHEDULED',
        timestamp_date: '2025-12-09',
        ...overrides
    };
}

function row(t: TaskWithOffset, daysOffset?: number, taskType?: string): Element {
    const el = parse(renderTaskRow(t, daysOffset, taskType, ctx)).querySelector('.task-line');
    assert.ok(el, 'expected a task row');
    return el;
}

/** A row as the date-less Tasks card renders it: every date spelled out. */
function alwaysDatedRow(t: TaskWithOffset, taskType?: string): Element {
    const html = renderTaskRow(t, undefined, taskType, { ...ctx, showDate: 'always' });
    const el = parse(html).querySelector('.task-line');
    assert.ok(el, 'expected a task row');
    return el;
}

suite('agendaCardHtml.renderTaskRow', () => {
    test('the row carries the click target: file and line', () => {
        const el = row(task());
        assert.strictEqual(el.getAttribute('data-file'), '/w/notes.md');
        assert.strictEqual(el.getAttribute('data-line'), '12');
    });

    test('a bad line number is sanitized rather than passed through', () => {
        assert.strictEqual(row(task({ line: -4 })).getAttribute('data-line'), '0');
        assert.strictEqual(row(task({ line: 7.9 })).getAttribute('data-line'), '7');
    });

    test('the status keyword drives data-status, both CANCELLED spellings included', () => {
        assert.strictEqual(row(task({ task_type: 'TODO' })).getAttribute('data-status'), 'todo');
        assert.strictEqual(row(task({ task_type: 'DONE' })).getAttribute('data-status'), 'done');
        assert.strictEqual(row(task({ task_type: 'CANCELLED' })).getAttribute('data-status'), 'cancelled');
        assert.strictEqual(row(task({ task_type: 'CANCELED' })).getAttribute('data-status'), 'cancelled');
    });

    test('a task with no keyword leaves data-status empty', () => {
        const bare = task();
        delete bare.task_type;
        assert.strictEqual(row(bare).getAttribute('data-status'), '');
    });

    test('the priority letter is lower-cased for the attribute and shown as written', () => {
        const el = row(task({ priority: 'A' }));
        assert.strictEqual(el.getAttribute('data-priority'), 'a');
        assert.strictEqual(el.querySelector('.priority')?.textContent, 'A');
    });

    test('a DEADLINE task is typed as one, so the stylesheet can paint it', () => {
        assert.strictEqual(row(task({ timestamp_type: 'DEADLINE' })).getAttribute('data-type'), 'deadline');
        assert.strictEqual(row(task()).getAttribute('data-type'), 'scheduled');
    });

    test('a timed task shows HH:MM; an all-day one leaves the column empty', () => {
        assert.strictEqual(row(task({ timestamp_time: '09:30' })).querySelector('.time-plain')?.textContent, '09:30');
        assert.strictEqual(row(task()).querySelector('.time-plain')?.textContent, '');
    });

    test('the offset column shows the task date only when the row is off the anchor day', () => {
        assert.strictEqual(row(task(), -2, 'overdue').querySelector('.offset')?.textContent, '[2025-12-09]');
        assert.strictEqual(row(task(), 0).querySelector('.offset')?.textContent, '', 'today needs no date');
        assert.strictEqual(row(task(), undefined).querySelector('.offset')?.textContent, '');
    });

    test('the offset column says which way it points', () => {
        assert.strictEqual(row(task(), 3, 'upcoming').querySelector('.offset')?.getAttribute('data-dir'), 'upcoming');
        assert.strictEqual(row(task(), -3, 'overdue').querySelector('.offset')?.getAttribute('data-dir'), 'overdue');
    });

    test('a card with no date axis spells the date out on every row, today included', () => {
        // The Tasks card holds tasks of every date at once, so a bare 09:30
        // names no day. The date is the only thing that places such a row.
        assert.strictEqual(alwaysDatedRow(task(), 'today').querySelector('.offset')?.textContent, '[2025-12-09]');
        assert.strictEqual(alwaysDatedRow(task(), 'overdue').querySelector('.offset')?.textContent, '[2025-12-09]');
    });

    test('a task carrying no date leaves the column empty rather than inventing one', () => {
        const undated = task();
        delete undated.timestamp_date;
        assert.strictEqual(alwaysDatedRow(undated).querySelector('.offset')?.textContent, '');
    });

    test('a date on the anchor day points neither back nor forward', () => {
        assert.strictEqual(alwaysDatedRow(task(), 'today').querySelector('.offset')?.getAttribute('data-dir'), 'today');
    });

    test('every glyph column carries a tooltip -- colour and shape are the only other legend', () => {
        const el = row(task({ priority: 'A', timestamp_type: 'DEADLINE' }), -1, 'overdue');
        for (const sel of ['.status', '.flag', '.priority']) {
            assert.ok(el.querySelector(sel)?.getAttribute('title'), `${sel} must explain itself`);
        }
    });

    test('the text columns explain themselves too, glyphs or not', () => {
        // The three that read as plain text: the clock, the heading and the
        // date. Each is terse for the room it has -- an empty cell, a heading
        // with its file left in an attribute, a date whose direction is a
        // colour -- and the tooltip is where the rest of it goes.
        const el = row(task({ timestamp_time: '09:30' }), -2, 'overdue');
        assert.strictEqual(el.querySelector('.time-plain')?.getAttribute('title'), 'Starts at 09:30');
        assert.strictEqual(
            el.querySelector('.heading')?.getAttribute('title'),
            'Write the report — /w/notes.md, line 12'
        );
        assert.strictEqual(el.querySelector('.offset')?.getAttribute('title'), 'Overdue by 2 days');
    });

    test('the time tooltip names the span when the entry has an end', () => {
        const el = row(task({ timestamp_time: '09:30', timestamp_end_time: '11:00' }));
        assert.strictEqual(el.querySelector('.time-plain')?.getAttribute('title'), 'From 09:30 to 11:00');
    });

    test('an all-day row says so where the column says nothing', () => {
        const el = row(task());
        assert.strictEqual(el.querySelector('.time-plain')?.textContent, '');
        assert.strictEqual(el.querySelector('.time-plain')?.getAttribute('title'), 'All day — the entry names no time');
    });

    test('an undated row is not told it is late', () => {
        // `data-dir` falls back to `overdue` for want of anything else to
        // style, and a tooltip built from that would be a claim about a date
        // the task does not have.
        const undated = task();
        delete undated.timestamp_date;
        assert.strictEqual(alwaysDatedRow(undated).querySelector('.offset')?.getAttribute('title'), '');
    });

    test('a dated row with no offset to count still says which way it points', () => {
        // The Tasks card: no anchor day, so the direction comes from the date
        // and there is no distance to name.
        const el = alwaysDatedRow(task(), 'upcoming');
        assert.strictEqual(el.querySelector('.offset')?.getAttribute('title'), 'Dated after today');
    });

    test('the flag tooltip is given the same date formatter as the offset column', () => {
        const title = row(task({ timestamp_type: 'DEADLINE' }))
            .querySelector('.flag')
            ?.getAttribute('title');
        assert.match(title ?? '', /\[2025-12-09]/);
    });

    test('an overdue row asks for attention, a done one does not', () => {
        assert.strictEqual(
            row(task(), -1, 'overdue').querySelector('.status')?.getAttribute('data-attention'),
            'danger'
        );
        assert.strictEqual(
            row(task({ task_type: 'DONE' }))
                .querySelector('.status')
                ?.getAttribute('data-attention'),
            'done'
        );
    });

    test('a heading with markup in it cannot inject anything', () => {
        const el = row(task({ heading: '<img src=x onerror=alert(1)>' }));
        assert.strictEqual(el.querySelectorAll('img').length, 0);
        assert.strictEqual(el.querySelector('.heading')?.textContent, '<img src=x onerror=alert(1)>');
    });

    test('a file path with a quote in it cannot break out of the attribute', () => {
        assert.strictEqual(row(task({ file: '/w/a".md' })).getAttribute('data-file'), '/w/a".md');
    });
});

suite('agendaCardHtml.renderCard', () => {
    test('the card names its view, which is how the panel is identified', () => {
        assert.strictEqual(
            parse(renderCard('day', '<div class="day-header"></div>', '<section></section>', 'empty', { escapeHtml }))
                .querySelector('.day-card')
                ?.getAttribute('data-card'),
            'day'
        );
        assert.strictEqual(
            parse(renderCard('tasks', '', '<section></section>', 'empty', { escapeHtml }))
                .querySelector('.day-card')
                ?.getAttribute('data-card'),
            'tasks'
        );
    });

    test('sections follow the summary bar', () => {
        const card = parse(
            renderCard('day', '<div class="day-summary"></div>', '<section class="day-section"></section>', 'e', {
                escapeHtml
            })
        ).querySelector('.day-card');
        assert.deepStrictEqual(
            [...(card?.children ?? [])].map((el) => el.className),
            ['day-summary', 'day-section']
        );
    });

    test('no sections means the empty-state line, and the summary bar stays', () => {
        const card = parse(
            renderCard('tasks', '<div class="day-summary"></div>', '', 'Nothing scheduled', { escapeHtml })
        ).querySelector('.day-card');
        assert.strictEqual(card?.querySelector('.day-empty')?.textContent, 'Nothing scheduled');
        assert.ok(card.querySelector('.day-summary'), 'the counts are still worth showing at zero');
    });

    test('the empty-state text is escaped', () => {
        const card = parse(renderCard('day', '', '', '<b>none</b>', { escapeHtml }));
        assert.strictEqual(card.querySelectorAll('b').length, 0);
        assert.strictEqual(card.querySelector('.day-empty')?.textContent, '<b>none</b>');
    });
});
