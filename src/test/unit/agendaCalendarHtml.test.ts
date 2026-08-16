import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import {
    buildWeekdayLabels,
    calendarCellOpenTag,
    renderMonthCalendar,
    resolveFirstDayOffset
} from '../../utils/agendaCalendarHtml';
import { buildMonthGrid } from '../../utils/agendaMonthCells';
import type { MonthDayIndex } from '../../utils/agendaMonthCells';
import type { OverdueBandIndex } from '../../utils/agendaDaySummary';
import { countLabel } from '../../utils/agendaSummaryHtml';
import { AGENDA_STRINGS, formatString, pluralIndex } from '../../utils/agendaI18n';
import { formatNumber } from '../../utils/formatNumber';
import { escapeHtml } from '../../utils/agendaEscapeHtml';

const EN = AGENDA_STRINGS.en;

function parse(html: string): Document {
    return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

/** The real helpers, so the assertions describe what the page actually renders. */
function ctxFor(index: MonthDayIndex, holidays: string[] = [], locale = 'en-US', bands: OverdueBandIndex = {}) {
    return {
        locale,
        uiLang: 'en',
        openDayView: EN.openDayView,
        taskChipForms: EN.countChip.tasks,
        overdueChipLabel: EN.countChip.overdue,
        index,
        bands,
        isHoliday: (date: string): boolean => holidays.includes(date),
        escapeHtml,
        formatString,
        formatNumber,
        pluralIndex,
        countLabel
    };
}

suite('agendaCalendarHtml.resolveFirstDayOffset', () => {
    test('the setting wins over the locale', () => {
        assert.strictEqual(resolveFirstDayOffset('sunday', 'ru-RU'), 0);
        assert.strictEqual(resolveFirstDayOffset('monday', 'en-US'), 1);
    });

    test('on auto the locale decides -- en-US starts on Sunday, ru-RU on Monday', () => {
        assert.strictEqual(resolveFirstDayOffset('auto', 'en-US'), 0);
        assert.strictEqual(resolveFirstDayOffset('auto', 'ru-RU'), 1);
    });

    test('an unusable locale falls back to Monday rather than throwing', () => {
        assert.strictEqual(resolveFirstDayOffset('auto', 'not a locale'), 1);
        assert.strictEqual(resolveFirstDayOffset('auto', ''), 1);
    });
});

suite('agendaCalendarHtml.buildWeekdayLabels', () => {
    test('seven labels, starting on the configured day', () => {
        assert.deepStrictEqual(buildWeekdayLabels(1, 'en-US'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        assert.strictEqual(buildWeekdayLabels(0, 'en-US')[0], 'Sun');
    });

    test('the names follow the locale', () => {
        assert.strictEqual(buildWeekdayLabels(1, 'ru-RU').length, 7);
        assert.notStrictEqual(buildWeekdayLabels(1, 'ru-RU')[0], 'Mon');
    });
});

suite('agendaCalendarHtml.calendarCellOpenTag', () => {
    test('a cell is a button carrying its date and the drill-down tooltip', () => {
        const cell = parse(
            `${calendarCellOpenTag('calendar-day', '2025-12-09', { openDayView: EN.openDayView, escapeHtml })}</button>`
        ).querySelector('button');
        assert.strictEqual(cell?.getAttribute('data-date'), '2025-12-09');
        assert.strictEqual(cell.getAttribute('title'), EN.openDayView);
        assert.strictEqual(cell.getAttribute('type'), 'button');
    });
});

suite('agendaCalendarHtml.renderMonthCalendar', () => {
    const cells = buildMonthGrid('2025-12-15', 1, '2025-12-09');
    const labels = buildWeekdayLabels(1, 'en-US');

    test('a header row plus one button per grid cell', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({})));
        assert.strictEqual(doc.querySelectorAll('.calendar-header').length, 7);
        assert.strictEqual(doc.querySelectorAll('.calendar-day').length, cells.length);
    });

    test('padding days, weekends, holidays and today each get their class', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({}, ['2025-12-25'])));
        const classes = (date: string): string => doc.querySelector(`[data-date="${date}"]`)?.className ?? '';
        assert.match(classes('2026-01-04'), /\bother-month\b/);
        assert.match(classes('2025-12-06'), /\bweekend\b/);
        assert.match(classes('2025-12-25'), /\bholiday\b/);
        assert.match(classes('2025-12-09'), /\btoday\b/);
        assert.doesNotMatch(classes('2025-12-08'), /\b(weekend|holiday|today|other-month)\b/);
    });

    test('a day with tasks gets the count chip and the has-tasks class', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 3, overdue: false } })));
        const cell = doc.querySelector('[data-date="2025-12-09"]');
        assert.match(cell?.className ?? '', /\bhas-tasks\b/);
        assert.strictEqual(cell?.querySelector('.task-count')?.textContent, '3');
        assert.strictEqual(cell.querySelector('.task-count')?.getAttribute('title'), '3 tasks');
    });

    test('an empty day carries no chip at all', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 1, overdue: false } })));
        assert.strictEqual(doc.querySelector('[data-date="2025-12-10"]')?.querySelector('.task-count'), null);
    });

    test('overdue work tints the chip and is named in its tooltip', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 4, overdue: true } })));
        const chip = doc.querySelector('[data-date="2025-12-09"] .task-count');
        assert.match(chip?.className ?? '', /\btask-count-overdue\b/);
        assert.strictEqual(chip?.getAttribute('title'), '4 tasks, overdue');
    });

    test('the tooltip spells the overdue count out band by band', () => {
        // The grid shows a number and no rows, so this is the only place a
        // reader can tell six missed repeats from six dates left in 2021.
        const bands = {
            '2025-12-09': [
                { title: EN.sections.overdueRepeat, count: 2 },
                { title: EN.sections.overdueEarlier, count: 4 }
            ]
        };
        const doc = parse(
            renderMonthCalendar(
                cells,
                labels,
                ctxFor({ '2025-12-09': { total: 8, overdue: true } }, [], 'en-US', bands)
            )
        );
        assert.strictEqual(
            doc.querySelector('[data-date="2025-12-09"] .task-count')?.getAttribute('title'),
            `8 tasks, overdue (${EN.sections.overdueRepeat}: 2, ${EN.sections.overdueEarlier}: 4)`
        );
    });

    test('a day with nothing overdue keeps the plain count, bands or not', () => {
        const bands = { '2025-12-09': [{ title: EN.sections.overdueRepeat, count: 2 }] };
        const doc = parse(
            renderMonthCalendar(
                cells,
                labels,
                ctxFor({ '2025-12-09': { total: 3, overdue: false } }, [], 'en-US', bands)
            )
        );
        assert.strictEqual(doc.querySelector('[data-date="2025-12-09"] .task-count')?.getAttribute('title'), '3 tasks');
    });

    test('a date the bands say nothing about is still named overdue', () => {
        // An older payload, or a date the index skipped: the chip says what it
        // knows rather than dropping the mark it does have.
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 4, overdue: true } })));
        assert.strictEqual(
            doc.querySelector('[data-date="2025-12-09"] .task-count')?.getAttribute('title'),
            '4 tasks, overdue'
        );
    });

    test('a single task is counted in the singular', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 1, overdue: false } })));
        assert.strictEqual(doc.querySelector('[data-date="2025-12-09"] .task-count')?.getAttribute('title'), '1 task');
    });

    test('day numbers and counts follow the date locale', () => {
        const doc = parse(
            renderMonthCalendar(cells, labels, ctxFor({ '2025-12-09': { total: 3, overdue: false } }, [], 'ar-EG'))
        );
        const cell = doc.querySelector('[data-date="2025-12-09"]');
        assert.strictEqual(cell?.querySelector('.day-number')?.textContent, formatNumber(9, 'ar-EG'));
        assert.strictEqual(cell.querySelector('.task-count')?.textContent, formatNumber(3, 'ar-EG'));
    });

    test('every cell is a drill-down button, padding days included', () => {
        const doc = parse(renderMonthCalendar(cells, labels, ctxFor({})));
        const buttons = [...doc.querySelectorAll('.calendar-day')];
        assert.ok(
            buttons.every((b) => b.tagName === 'BUTTON' && b.getAttribute('title') === EN.openDayView),
            'each cell opens its day in Day view'
        );
    });
});
