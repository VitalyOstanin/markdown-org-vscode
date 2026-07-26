import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { wireDayHeaderNavigation } from '../../utils/agendaDayHeaderNav';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';

// The drill-down tooltip is handed in rather than baked into the helper, so it
// speaks the configured UI language (see agendaI18n.ts).
const OPEN_DAY_TITLE = AGENDA_STRINGS.en.openDayView;

// jsdom mirrors the agenda webview DOM so the day-header drill-down wiring
// is exercised without a full VS Code instance. The webview embeds the
// source of wireDayHeaderNavigation via `.toString()`, so these tests
// transitively cover the runtime behaviour.
suite('wireDayHeaderNavigation (jsdom)', () => {
    function setupDom(mode: 'day' | 'week' | 'month' | 'tasks') {
        // Week payload: three day-headers with data-date, plus one header
        // without data-date (a Tasks-style priority label) that must be
        // ignored regardless of mode.
        const dom = new JSDOM(
            `<!DOCTYPE html>
            <html><body>
              <div id="content">
                <div class="day-header" data-date="2025-12-08"><span>Mon 8</span></div>
                <div class="task-line" data-file="/a.md" data-line="1"><span>t</span></div>
                <div class="day-header" data-date="2025-12-09"><span>Tue 9</span></div>
                <div class="day-header" data-date="2025-12-10"><span>Wed 10</span></div>
                <div class="day-header"><span>No priority</span></div>
              </div>
            </body></html>`,
            { pretendToBeVisual: true }
        );
        void mode;
        return dom.window.document;
    }

    test('week mode wires every day-header that carries a data-date', () => {
        const document = setupDom('week');
        const seen: string[] = [];

        const count = wireDayHeaderNavigation(document, 'week', (date) => seen.push(date), OPEN_DAY_TITLE);

        assert.strictEqual(count, 3, 'three data-date headers should be wired');
        const linked = document.querySelectorAll('.day-header.day-header-link');
        assert.strictEqual(linked.length, 3, 'each wired header gets the day-header-link class');
        // Wired headers carry a hover tooltip explaining the drill-down.
        linked.forEach((el) => assert.strictEqual(el.getAttribute('title'), OPEN_DAY_TITLE));
        // The header without data-date must stay inert.
        const inert = [...document.querySelectorAll('.day-header')].filter(
            (el) => !el.classList.contains('day-header-link')
        );
        assert.strictEqual(inert.length, 1, 'the data-date-less header stays unlinked');
    });

    test('clicking a wired header calls onNavigate with that header date', () => {
        const document = setupDom('week');
        const seen: string[] = [];

        wireDayHeaderNavigation(document, 'week', (date) => seen.push(date), OPEN_DAY_TITLE);

        document.querySelector<HTMLElement>('.day-header[data-date="2025-12-09"]')!.click();
        document.querySelector<HTMLElement>('.day-header[data-date="2025-12-08"]')!.click();

        // Each click reports its own header's date (closure captures the
        // per-iteration date, not the last one).
        assert.deepStrictEqual(seen, ['2025-12-09', '2025-12-08']);
    });

    for (const mode of ['day', 'month', 'tasks'] as const) {
        test(`${mode} mode wires nothing (drill-down is week-only)`, () => {
            const document = setupDom(mode);
            const seen: string[] = [];

            const count = wireDayHeaderNavigation(document, mode, (date) => seen.push(date), OPEN_DAY_TITLE);

            assert.strictEqual(count, 0, `${mode} mode must not wire day-headers`);
            assert.strictEqual(
                document.querySelectorAll('.day-header-link').length,
                0,
                `${mode} mode must not add the day-header-link class`
            );
            document.querySelector<HTMLElement>('.day-header[data-date="2025-12-08"]')!.click();
            assert.deepStrictEqual(seen, [], `${mode} mode click must not navigate`);
        });
    }

    test('an empty data-date is skipped rather than navigating to ""', () => {
        const dom = new JSDOM(
            `<!DOCTYPE html><html><body>
               <div class="day-header" data-date=""><span>empty</span></div>
             </body></html>`,
            { pretendToBeVisual: true }
        );
        const document = dom.window.document;
        const seen: string[] = [];

        const count = wireDayHeaderNavigation(document, 'week', (date) => seen.push(date), OPEN_DAY_TITLE);

        assert.strictEqual(count, 0, 'empty data-date is not a navigable header');
        document.querySelector<HTMLElement>('.day-header')!.click();
        assert.deepStrictEqual(seen, []);
    });
});
