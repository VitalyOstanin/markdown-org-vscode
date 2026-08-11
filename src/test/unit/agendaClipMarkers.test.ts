import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { countClippedRows, renderDayClipHtml, updateDayClipMarkers } from '../../utils/agendaClipMarkers';
import { AGENDA_STRINGS, formatString } from '../../utils/agendaI18n';

const CLIP_TITLES = AGENDA_STRINGS.en.clip;

// The webview embeds all three helpers via `.toString()`, so these tests
// transitively cover what the week view does on every scroll frame.
suite('countClippedRows', () => {
    // A header pinned at 100px in a 500px-tall viewport: the geometry the
    // week view has once the user has scrolled into a day.
    const HEADER_BOTTOM = 100;
    const VIEWPORT = 500;

    test('rows fully inside the visible band count as visible', () => {
        const rows = [
            { top: 110, bottom: 130 },
            { top: 300, bottom: 320 },
            { top: 470, bottom: 490 }
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 0, below: 0 });
    });

    test('rows whose bottom edge is under the header count as hidden above', () => {
        // Includes rows scrolled past the top of the window entirely
        // (negative coordinates) -- those are covered by the same test.
        const rows = [
            { top: -40, bottom: -20 },
            { top: 60, bottom: 80 },
            { top: 200, bottom: 220 }
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 2, below: 0 });
    });

    test('rows starting at or past the bottom edge count as hidden below', () => {
        const rows = [
            { top: 200, bottom: 220 },
            { top: 520, bottom: 540 },
            { top: 560, bottom: 580 }
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 0, below: 2 });
    });

    test('both edges are counted in one pass', () => {
        const rows = [
            { top: 40, bottom: 60 },
            { top: 200, bottom: 220 },
            { top: 700, bottom: 720 }
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 1, below: 1 });
    });

    test('a row cut past its halfway mark counts as hidden on either edge', () => {
        // 20 of 60px left under the header, 20 of 60px left above the bottom
        // edge: both show padding rather than text.
        const rows = [
            { top: 60, bottom: 120 }, // crosses the header's bottom edge
            { top: 480, bottom: 540 } // crosses the viewport's bottom edge
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 1, below: 1 });
    });

    test('a row that keeps more than half of its height counts as visible', () => {
        // 40 of 60px on either edge: cut, but the text still reads, and a chip
        // that counts it would report a task the user can see.
        const rows = [
            { top: 80, bottom: 140 },
            { top: 460, bottom: 520 }
        ];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 0, below: 0 });
    });

    test('a row sliced to a few pixels of padding counts as hidden', () => {
        // The week view's own geometry: 42px rows, the last one starting 7px
        // above the bottom edge. Counting it as visible reported one task
        // fewer than the day actually hid.
        const rows = [{ top: VIEWPORT - 7, bottom: VIEWPORT + 35 }];
        assert.deepStrictEqual(countClippedRows(rows, HEADER_BOTTOM, VIEWPORT), { above: 0, below: 1 });
    });

    test('the half-pixel slack resolves a halfway tie towards visible', () => {
        // A row parked exactly on the halfway mark lands on 0.3px differences
        // between zoom levels; without the slack the chip would flicker
        // between 0 and 1 while nothing moves.
        const exactlyHalf = [{ top: 90, bottom: 110 }]; // 10 of 20px visible
        const justUnderHalf = [{ top: 89, bottom: 109 }]; // 9 of 20px visible
        assert.strictEqual(countClippedRows(exactlyHalf, HEADER_BOTTOM, VIEWPORT).above, 0);
        assert.strictEqual(countClippedRows(justUnderHalf, HEADER_BOTTOM, VIEWPORT).above, 1);

        const exactlyHalfBelow = [{ top: 490, bottom: 510 }];
        const justUnderHalfBelow = [{ top: 491, bottom: 511 }];
        assert.strictEqual(countClippedRows(exactlyHalfBelow, HEADER_BOTTOM, VIEWPORT).below, 0);
        assert.strictEqual(countClippedRows(justUnderHalfBelow, HEADER_BOTTOM, VIEWPORT).below, 1);
    });

    test('a day with no rows reports nothing hidden', () => {
        assert.deepStrictEqual(countClippedRows([], HEADER_BOTTOM, VIEWPORT), { above: 0, below: 0 });
    });
});

suite('renderDayClipHtml', () => {
    test('both chips start hidden', () => {
        // Markup is emitted while rendering, before any measurement exists;
        // a chip visible at that point would flash a stale "0" on every
        // re-render.
        const html = renderDayClipHtml();
        assert.ok(html.includes('class="day-clip-count day-clip-above" hidden'));
        assert.ok(html.includes('class="day-clip-count day-clip-below" hidden'));
    });
});

suite('updateDayClipMarkers (jsdom)', () => {
    // Rows are flat siblings of their day header in the week view, so the
    // fixture mirrors that: header, its rows, next header, its rows.
    function setupDom(): Document {
        const dom = new JSDOM(
            `<!DOCTYPE html>
            <html><body>
              <div class="day-header" data-date="2025-12-08">
                <span>Mon 8</span>${renderDayClipHtml()}
              </div>
              <div class="task-line" id="a1"></div>
              <div class="task-line" id="a2"></div>
              <div class="task-line" id="a3"></div>
              <div class="day-header" data-date="2025-12-09">
                <span>Tue 9</span>${renderDayClipHtml()}
              </div>
              <div class="task-line" id="b1"></div>
            </body></html>`,
            { pretendToBeVisual: true }
        );
        return dom.window.document;
    }

    /** jsdom lays nothing out, so every measured box is planted by hand. */
    function setRect(document: Document, selector: string, top: number, bottom: number): void {
        const el = document.querySelector(selector)!;
        el.getBoundingClientRect = () => ({ top: top, bottom: bottom }) as DOMRect;
    }

    function chip(document: Document, date: string, side: 'above' | 'below'): HTMLElement {
        return document.querySelector<HTMLElement>(`.day-header[data-date="${date}"] .day-clip-${side}`)!;
    }

    test('a day with rows on both sides shows both chips with their counts', () => {
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 40, 60); // behind the header
        setRect(document, '#a2', 200, 220); // visible
        setRect(document, '#a3', 700, 720); // past the bottom edge
        setRect(document, '.day-header[data-date="2025-12-09"]', 900, 920);
        setRect(document, '#b1', 940, 960);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        const above = chip(document, '2025-12-08', 'above');
        const below = chip(document, '2025-12-08', 'below');
        assert.strictEqual(above.hidden, false);
        assert.strictEqual(above.textContent, '↑ 1');
        assert.strictEqual(above.getAttribute('title'), 'Hidden above the view: 1');
        assert.strictEqual(below.hidden, false);
        assert.strictEqual(below.textContent, '↓ 1');
        assert.strictEqual(below.getAttribute('title'), 'Hidden below the view: 1');
    });

    test('the counts follow the date locale, as the rest of the header does', () => {
        // The day number beside them goes through `formatNumber`; a marker
        // printing the raw count put two numbering systems in one header.
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 40, 60);
        setRect(document, '#a2', 200, 220);
        setRect(document, '#a3', 700, 720);
        setRect(document, '.day-header[data-date="2025-12-09"]', 900, 920);
        setRect(document, '#b1', 940, 960);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, (n) => `«${n}»`);

        const above = chip(document, '2025-12-08', 'above');
        assert.strictEqual(above.textContent, '↑ «1»');
        assert.strictEqual(above.getAttribute('title'), 'Hidden above the view: «1»');
    });

    test('a fully visible day keeps both chips hidden', () => {
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 110, 130);
        setRect(document, '#a2', 140, 160);
        setRect(document, '#a3', 170, 190);
        setRect(document, '.day-header[data-date="2025-12-09"]', 200, 220);
        setRect(document, '#b1', 230, 250);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        assert.strictEqual(chip(document, '2025-12-08', 'above').hidden, true);
        assert.strictEqual(chip(document, '2025-12-08', 'below').hidden, true);
        assert.strictEqual(chip(document, '2025-12-09', 'above').hidden, true);
        assert.strictEqual(chip(document, '2025-12-09', 'below').hidden, true);
    });

    test('rows are attributed to their own header, not to the whole page', () => {
        // The second day's single row is out of view; the first day is fully
        // visible. Walking siblings past the next header would blame the
        // first day for the second day's row.
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 110, 130);
        setRect(document, '#a2', 140, 160);
        setRect(document, '#a3', 170, 190);
        setRect(document, '.day-header[data-date="2025-12-09"]', 200, 220);
        setRect(document, '#b1', 800, 820);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        assert.strictEqual(chip(document, '2025-12-08', 'below').hidden, true, 'day 8 owns no hidden row');
        assert.strictEqual(chip(document, '2025-12-09', 'below').textContent, '↓ 1');
    });

    test('the shadow class tracks only the rows hidden above', () => {
        // The shadow says "this day continues above"; a day clipped only at
        // the bottom must not draw one.
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 110, 130);
        setRect(document, '#a2', 140, 160);
        setRect(document, '#a3', 700, 720);
        setRect(document, '.day-header[data-date="2025-12-09"]', 900, 920);
        setRect(document, '#b1', 940, 960);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        const header = document.querySelector('.day-header[data-date="2025-12-08"]')!;
        assert.strictEqual(header.classList.contains('day-header-clipped'), false);

        setRect(document, '#a1', 40, 60);
        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);
        assert.strictEqual(header.classList.contains('day-header-clipped'), true);
    });

    test('a repeated pass clears markers once the rows come back into view', () => {
        // Scrolling back to the top must retract the chips and the shadow,
        // otherwise a stale "↑ 1" claims hidden content that is on screen.
        const document = setupDom();
        setRect(document, '.day-header[data-date="2025-12-08"]', 80, 100);
        setRect(document, '#a1', 40, 60);
        setRect(document, '#a2', 200, 220);
        setRect(document, '#a3', 700, 720);
        setRect(document, '.day-header[data-date="2025-12-09"]', 900, 920);
        setRect(document, '#b1', 940, 960);
        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        setRect(document, '#a1', 110, 130);
        setRect(document, '#a3', 300, 320);
        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        const header = document.querySelector('.day-header[data-date="2025-12-08"]')!;
        assert.strictEqual(chip(document, '2025-12-08', 'above').hidden, true);
        assert.strictEqual(chip(document, '2025-12-08', 'below').hidden, true);
        assert.strictEqual(header.classList.contains('day-header-clipped'), false);
    });

    test('headers without a data-date are left alone', () => {
        // The Tasks view labels its sections with .day-header elements that
        // carry no date and no chips; measuring them would walk the whole
        // list and could throw on the missing chip nodes.
        const dom = new JSDOM(
            `<!DOCTYPE html><html><body>
               <div class="day-header"><span>No priority</span></div>
               <div class="task-line" id="x1"></div>
             </body></html>`,
            { pretendToBeVisual: true }
        );
        const document = dom.window.document;
        setRect(document, '.day-header', 80, 100);
        setRect(document, '#x1', 40, 60);

        updateDayClipMarkers(document, 500, CLIP_TITLES, countClippedRows, formatString, String);

        assert.strictEqual(document.querySelector('.day-header')!.classList.contains('day-header-clipped'), false);
    });

    test('the source calls no sibling helper of its own module', () => {
        // Inlined into the page by `.toString()`, which brings no module
        // bindings along: a direct call to countClippedRows would be an
        // undefined name there. It arrives as a parameter instead.
        const source = updateDayClipMarkers.toString();
        assert.ok(
            !source.includes('countClippedRows'),
            'updateDayClipMarkers must receive the counter as a parameter, not call the module-level one'
        );
        assert.ok(!source.includes('formatString'), 'updateDayClipMarkers must receive the formatter as a parameter');
        assert.ok(
            !source.includes('renderDayClipHtml'),
            'updateDayClipMarkers must not reach for its neighbours in this module'
        );
    });
});
