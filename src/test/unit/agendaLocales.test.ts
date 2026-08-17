import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import { formatDayHeaderParts } from '../../utils/agendaDayHeader';
import { formatIsoDate } from '../../utils/formatIsoDate';
import { AGENDA_STRINGS, UI_LANGUAGES, formatString, pluralIndex } from '../../utils/agendaI18n';
import {
    countLabel,
    renderDayHeaderHtml,
    renderSectionPanel,
    renderSummaryBar,
    summaryStat
} from '../../utils/agendaSummaryHtml';
import { buildWeekdayLabels, renderMonthCalendar } from '../../utils/agendaCalendarHtml';
import { buildMonthGrid } from '../../utils/agendaMonthCells';
import type { MonthDayIndex } from '../../utils/agendaMonthCells';
import type { OverdueBandIndex } from '../../utils/agendaDaySummary';
import { countClippedRows, renderDayClipHtml, updateDayClipMarkers } from '../../utils/agendaClipMarkers';
import { renderGitMenu } from '../../utils/agendaGitHtml';
import { escapeHtml } from '../../utils/agendaEscapeHtml';
import { formatNumber } from '../../utils/formatNumber';

/**
 * The agenda formats dates through `Intl` with whatever `markdown-org.dateLocale`
 * holds, which is not limited to the two languages the interface ships strings
 * for. This suite walks a spread of locales -- Latin, Cyrillic, CJK, RTL, and a
 * region without a language -- and checks that every one of them produces a
 * usable header rather than an empty field or a throw.
 *
 * Exact wording is deliberately not asserted: it comes from the ICU data of the
 * running Node build and changes between versions. What is asserted is the
 * shape: non-empty parts, digits where digits belong, and the locale actually
 * having an effect.
 */
const LOCALES = ['en-US', 'ru-RU', 'de-DE', 'fr-FR', 'es-ES', 'ja-JP', 'zh-CN', 'ar-EG', 'he-IL', 'tr-TR', 'fi-FI'];

// Any Unicode decimal digit, not just ASCII: ar-EG renders 2026 as "٢٠٢٦"
// (Arabic-Indic digits), which is correct output, not a formatting failure.
const HAS_DIGIT = /\p{Nd}/u;

suite('agenda localization across locales', () => {
    const iso = '2026-01-05'; // a Monday, single-digit day and month

    test('the day header has every part filled in, whatever the locale', () => {
        for (const locale of LOCALES) {
            const parts = formatDayHeaderParts(iso, locale);
            assert.ok(parts.weekday.length > 0, `${locale}: empty weekday`);
            assert.ok(parts.day.length > 0, `${locale}: empty day`);
            assert.ok(parts.month.length > 0, `${locale}: empty month`);
            assert.ok(HAS_DIGIT.test(parts.year), `${locale}: year without digits: "${parts.year}"`);
        }
    });

    test('the weekday actually follows the locale', () => {
        // If the locale were being ignored, every one of these would be equal.
        const weekdays = new Set(LOCALES.map((l) => formatDayHeaderParts(iso, l).weekday));
        assert.ok(weekdays.size > 3, `expected the weekday to vary by locale, got ${[...weekdays].join(', ')}`);
    });

    test('offset dates render in the locale and stay one line', () => {
        for (const locale of LOCALES) {
            const formatted = formatIsoDate(iso, locale);
            assert.ok(formatted.length > 0, `${locale}: empty date`);
            assert.ok(!formatted.includes('\n'), `${locale}: date spans lines: "${formatted}"`);
            assert.ok(HAS_DIGIT.test(formatted), `${locale}: date without digits: "${formatted}"`);
        }
    });

    test('a malformed or unknown tag degrades instead of throwing', () => {
        for (const locale of ['ru_RU', 'not-a-locale', 'xx-YY', '']) {
            const parts = formatDayHeaderParts(iso, locale);
            assert.ok(parts.weekday.length > 0, `${locale}: empty weekday after degrading`);
            assert.ok(formatIsoDate(iso, locale).length > 0, `${locale}: empty offset date after degrading`);
        }
    });

    // The interface language is a separate axis from the date locale: a user can
    // read Russian dates with an English interface. Whichever is picked, no
    // counted noun may render as "5 undefined".
    test('counted nouns resolve for every count in every shipped language', () => {
        for (const lang of UI_LANGUAGES) {
            const strings = AGENDA_STRINGS[lang];
            // Every set of counted nouns the interface has, not a sample:
            // a form missing from `git.commits` shows as "отправлено 5", a
            // number with nothing after it, which reads as a truncation
            // rather than as a missing translation.
            for (const forms of [
                strings.summary.tasks,
                strings.countChip.tasks,
                strings.git.files,
                strings.git.commits
            ]) {
                for (let n = 0; n <= 120; n++) {
                    const form = forms[pluralIndex(n, lang)];
                    assert.ok(form, `${lang}: no plural form for ${n}`);
                    assert.ok(!formatString('{0} {1}', String(n), form).includes('undefined'));
                }
            }
        }
    });
});

/**
 * A locale decides the digits, so one counter printing a raw JavaScript number
 * puts two numbering systems on the same screen: in ar-EG the day header reads
 * "٥ يناير ٢٠٢٦" while a chip beside it shows "12". This suite renders every
 * counter of one screen -- day header, summary bar, section chip, month cells
 * and the week view's clipping markers -- in a locale whose digits are not
 * ASCII, and asserts that nothing the reader sees carries an ASCII digit.
 *
 * Only what is readable counts: element text and tooltips. Attributes that
 * merely carry state (`data-date` and friends) stay in ISO form on purpose.
 */
suite('agenda counters share one numbering system', () => {
    const locale = 'ar-EG';
    const EN = AGENDA_STRINGS.en;
    const iso = '2026-01-05';
    const ASCII_DIGIT = /[0-9]/;

    /** Everything the reader can read on the screen: text plus tooltips. */
    function readable(document: Document): string {
        const titles = [...document.querySelectorAll('[title]')].map((el) => el.getAttribute('title') ?? '');
        return [document.body.textContent, ...titles].join(' | ');
    }

    const base = { locale, uiLang: 'en', escapeHtml, formatString, formatNumber, pluralIndex };

    test('the day screen prints no ASCII digit outside its attributes', () => {
        const panelCtx = {
            ...base,
            inSectionTemplate: EN.countChip.inSection,
            taskForms: EN.countChip.tasks,
            // Formatted, as the page formats it: the raw template carries a
            // `{0}`, and the placeholder's digit is not one the reader sees.
            fold: { folded: false, label: formatString(EN.fold.collapse, EN.sections.overdueRecent) }
        };
        const index: MonthDayIndex = { [iso]: { total: 12, overdue: true, dueSoon: false } };
        // The chip's tooltip spells the overdue count out band by band, and
        // those counts are numbers on the screen like any other.
        const bands: OverdueBandIndex = {
            [iso]: [
                { title: EN.sections.overdueRepeat, count: 1 },
                { title: EN.sections.overdueRecent, count: 2 }
            ]
        };
        const calendarCtx = {
            ...base,
            openDayView: EN.openDayView,
            taskChipForms: EN.countChip.tasks,
            overdueChipLabel: EN.countChip.overdue,
            dueChipLabel: EN.countChip.due,
            index,
            bands,
            isHoliday: (): boolean => false,
            countLabel
        };
        const html =
            `<div class="day-header" data-date="${iso}">${renderDayHeaderHtml(formatDayHeaderParts(iso, locale))}</div>` +
            renderSummaryBar(
                iso,
                [
                    summaryStat(12, EN.summary.tasks, '', panelCtx),
                    summaryStat(3, EN.summary.overdue, 'day-summary-overdue', panelCtx)
                ],
                panelCtx
            ) +
            renderSectionPanel('overdueRecent', EN.sections.overdueRecent, 12, '', panelCtx, '') +
            renderMonthCalendar(buildMonthGrid(iso, 1, iso), buildWeekdayLabels(1, locale), calendarCtx);

        const text = readable(new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document);
        assert.ok(!ASCII_DIGIT.test(text), `an ASCII digit reached the screen: "${text}"`);
    });

    test('the git menu -- the densest numbers in the header -- follows it too', () => {
        // Four chip counters, five group headings, the commit count and the
        // "and N more" line: the surface where a new counter written as `${n}`
        // would slip through unnoticed.
        const files = [
            {
                file: '/repo/a.md',
                label: 'a.md',
                repoRoot: '/repo',
                uncommitted: true,
                unpushed: false,
                conflicted: false
            },
            {
                file: '/repo/b.md',
                label: 'b.md',
                repoRoot: '/repo',
                uncommitted: false,
                unpushed: true,
                conflicted: false
            },
            {
                file: '/repo/c.md',
                label: 'c.md',
                repoRoot: '/repo',
                uncommitted: false,
                unpushed: false,
                conflicted: true
            },
            {
                file: '/repo/d.md',
                label: 'd.md',
                repoRoot: '/repo',
                uncommitted: false,
                unpushed: false,
                conflicted: false
            },
            { file: '/loose/e.md', label: 'e.md', uncommitted: false, unpushed: false, conflicted: false }
        ];
        const html = renderGitMenu(
            {
                repos: [
                    {
                        root: '/repo',
                        name: 'repo',
                        branch: 'master',
                        upstream: 'origin/master',
                        aheadCommits: 12,
                        // A hash with no digit in it: `abc1234` is an
                        // identifier, not a number, and would fail this check
                        // for saying so.
                        unpushedCommitList: [{ hash: 'abcdeff', subject: 'Sort the backlog' }]
                    }
                ],
                files,
                uncommittedCount: 1,
                unpushedCount: 1,
                outsideGitCount: 1,
                unpushedCommits: 12,
                conflictCount: 1
            },
            { ...base, git: EN.git }
        );

        const text = readable(new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document);
        assert.ok(!ASCII_DIGIT.test(text), `an ASCII digit reached the screen: "${text}"`);
    });

    test('the week view clipping chips follow the same system', () => {
        const document = new JSDOM(
            `<!DOCTYPE html><body>
                <div class="day-header" data-date="${iso}">
                    ${renderDayHeaderHtml(formatDayHeaderParts(iso, locale))}${renderDayClipHtml()}
                </div>
                <div class="task-line" id="hidden-above"></div>
                <div class="task-line" id="visible"></div>
                <div class="task-line" id="hidden-below"></div>
            </body>`,
            { pretendToBeVisual: true }
        ).window.document;
        const setRect = (selector: string, top: number, bottom: number): void => {
            document.querySelector(selector)!.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
        };
        setRect('.day-header', 80, 100);
        setRect('#hidden-above', 40, 60);
        setRect('#visible', 200, 220);
        setRect('#hidden-below', 700, 720);

        updateDayClipMarkers(document, 500, {
            titles: EN.clip,
            countRows: countClippedRows,
            format: formatString,
            formatCount: (n: number) => formatNumber(n, locale)
        });

        const text = readable(document);
        assert.ok(!ASCII_DIGIT.test(text), `an ASCII digit reached the screen: "${text}"`);
    });
});
