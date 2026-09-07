/**
 * What the agenda page reports about itself once it has rendered.
 *
 * The integration tests drive the real page and then ask it what it drew: the
 * days, the rows, the sections, the header layout it settled on, the git chip
 * and the clipping marks. Reading the DOM is the whole of it -- nothing here
 * touches the page's own state -- so it lives beside the page rather than
 * inside its closure, where a thousand lines of markup and message handling
 * were already keeping company.
 *
 * Inlined into the page by `Function.prototype.toString()`, so each function
 * stands on its own or calls another of this file by a bare name: no module
 * bindings survive that (see inlinedHelpers.test.ts).
 */
import type { GitAction } from './agendaGitAction';

/** The rendered plan: its days, rows, sections and directory chips. */
export function collectViewInfo() {
    const dayHeaders = [...document.querySelectorAll('.day-header')]
        .map((el) => el.getAttribute('data-date'))
        .filter((d): d is string => d !== null);
    const flags = [...document.querySelectorAll('.flag')].map((el) => el.getAttribute('data-flag') ?? '');
    // Section-panel titles in document order (Day and Tasks cards), so a
    // test can assert the grouping and its order.
    const sections = [...document.querySelectorAll('.day-section-name')].map((el) => el.textContent);
    // Which sections offer an action on the whole band: the key each
    // menu carries, which is also what a click on it would post back.
    const sectionMenus = [...document.querySelectorAll('.group-menu')].map(
        (el) => el.getAttribute('data-section') ?? ''
    );
    // Every head that can fold, and whether it is folded now. The title
    // above says nothing about that -- a folded section keeps its heading,
    // which is the whole point of folding it rather than dropping it.
    const sectionFolds = [...document.querySelectorAll('.day-section-head')].map((el) => {
        const key = el.getAttribute('data-section') ?? '';
        return el.classList.contains('day-section-is-folded') ? `${key} (folded)` : key;
    });
    // How many rows the page is actually showing. A folded section leaves
    // its rows out of the render rather than hiding them, and this is what
    // tells the two apart from outside.
    const taskRows = document.querySelectorAll('.task-line').length;
    // Collection dots in row order, each reported by the tooltip that
    // names its directory: with one directory scanned there are none,
    // which is the state a test has no other way to tell apart from
    // "the mark was rendered without a name".
    const collectionMarks = [...document.querySelectorAll('.task-line .collection')].map(
        (el) => el.getAttribute('title') ?? ''
    );
    // The chip row, each chip as its directory name plus the state it is
    // in. The name alone would not tell a chip that is off from one
    // that is on, and that difference is the whole feature.
    const collectionChips = [...document.querySelectorAll('.collection-chip')].map(
        (el) => `${el.textContent}${el.classList.contains('off') ? ' (off)' : ''}`
    );
    return {
        dayHeaders,
        flags,
        sections,
        sectionMenus,
        sectionFolds,
        taskRows,
        collectionMarks,
        collectionChips
    };
}

/** The header: which layout it settled on, and what it is showing. */
export function collectHeaderInfo() {
    // Measured, not inferred: the compact header is only compact if the
    // hero really shares a line with the control block. A class on
    // <body> proves nothing about the layout it was supposed to
    // produce, so the two boxes are compared for vertical overlap.
    const heroEl = document.querySelector('.agenda-hero');
    const navEl = document.getElementById('nav-bar');
    let heroSharesControlRow = false;
    if (heroEl && navEl) {
        const hero = heroEl.getBoundingClientRect();
        const nav = navEl.getBoundingClientRect();
        heroSharesControlRow = hero.bottom > nav.top + 1 && nav.bottom > hero.top + 1;
    }
    // Hero subtitle and calendar cell numbers as rendered: a locale with
    // non-Latin digits must reach the page as such, and nothing but the
    // rendered text proves it.
    const heroSub = document.querySelector('.hero-sub span')?.textContent ?? '';
    const dayNumbers = [...document.querySelectorAll('.calendar-day .day-number')].map((el) => el.textContent);
    // The dates behind those numbers, so a test can hold the grid against
    // the days the extractor sent. The column headings come with them:
    // they are what the first-day-of-week setting still decides in the
    // page, now that the dates themselves arrive decided.
    const calendarDates = [...document.querySelectorAll('.calendar-day')].map(
        (el) => el.getAttribute('data-date') ?? ''
    );
    const calendarHeaders = [...document.querySelectorAll('.calendar-header')].map((el) => el.textContent);
    return {
        heroSharesControlRow,
        heroSub,
        dayNumbers,
        calendarDates,
        calendarHeaders,
        // The header layout is a class on <body>, so this is how a test
        // sees which of the two the page settled on.
        headerLayout: document.body.classList.contains('compact-header') ? 'compact' : 'full',
        focusedTag: document.activeElement?.tagName ?? ''
    };
}

/**
 * The git chip and its dropdown: what it says and what it offers.
 *
 * `actionOf` names the action a button id stands for. It arrives as an argument
 * rather than as an import because a call across modules compiles to a module
 * reference the page cannot resolve once this function is inlined into it.
 */
export function collectGitInfo(actionOf: (id: string) => GitAction) {
    // The git chip arrives on its own message, after the render; its
    // text is how a test sees that the whole path -- repository
    // resolution, the status message, the markup -- reached the page.
    const gitChip = document.getElementById('gitMenuBtn')?.textContent ?? '';
    // Which actions the dropdown offers and what state a press left them
    // in. `off` is the disabled attribute the click sets on all of them,
    // `busy` the marker the pressed one carries -- the two together are the
    // whole feedback a press gives before the host answers.
    const gitActions = [...document.querySelectorAll<HTMLButtonElement>('#gitMenu .git-action')].map((btn) => {
        const kind = actionOf(btn.id);
        const marks = [btn.disabled ? 'off' : '', btn.getAttribute('data-busy') === 'true' ? 'busy' : '']
            .filter((mark) => mark !== '')
            .join(', ');
        return marks === '' ? kind : `${kind} (${marks})`;
    });
    // Group titles of the dropdown, so a test can tell the conflict group
    // from the ones that ask for a commit.
    const gitGroups = [...document.querySelectorAll('#gitMenu .git-group')].map(
        (el) => el.getAttribute('data-group') ?? ''
    );
    // Whether the dropdown stands open, which is how a test sees that a
    // status arriving underneath it left it alone.
    const gitMenuOpen = document.getElementById('gitMenu')?.classList.contains('open') ?? false;
    return { gitChip, gitActions, gitGroups, gitMenuOpen };
}

/**
 * Clipping chips per day header, in the same order as `dayHeaders`.
 *
 * A hidden chip reports 0 rather than its stale text, which is what the
 * page shows the user.
 */
export function collectClipInfo() {
    const clipAbove: number[] = [];
    const clipBelow: number[] = [];
    for (const header of document.querySelectorAll('.day-header[data-date]')) {
        clipAbove.push(readChipCount(header.querySelector<HTMLElement>('.day-clip-above')));
        clipBelow.push(readChipCount(header.querySelector<HTMLElement>('.day-clip-below')));
    }
    return { clipAbove, clipBelow };
}

export function readChipCount(chip: HTMLElement | null): number {
    if (!chip || chip.hidden) {
        return 0;
    }
    return Number(chip.textContent.replaceAll(/[^0-9]/g, '')) || 0;
}

/**
 * Is the first task row of today's day behind its own sticky header?
 *
 * This is the symptom the week view had: the header claims the day starts
 * there while its first row is already scrolled under it. `false` when
 * today has no header (another week) or no rows.
 */
export function measureTodayFirstRowHidden(todayIso: string): boolean {
    const header = document.querySelector('.day-header[data-date="' + todayIso + '"]');
    if (!header) {
        return false;
    }
    let node = header.nextElementSibling;
    while (node && !node.classList.contains('day-header') && !node.classList.contains('task-line')) {
        node = node.nextElementSibling;
    }
    if (!node?.classList.contains('task-line')) {
        return false;
    }
    return node.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 0.5;
}
