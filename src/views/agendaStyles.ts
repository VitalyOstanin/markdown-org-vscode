/**
 * Static CSS for the agenda webview, kept vscode-free so a unit test can
 * assert invariants over it:
 *
 *  - Theming: every colour resolves through a `var(--vscode-*)` token
 *    (or a `color-mix()` of them) with no hardcoded HEX, so the panel follows
 *    the active VS Code theme -- light, dark, or high contrast.
 *  - Spacing scale: all padding/margin/gap come from a single
 *    4/8/12/16/20 token scale (`--space-1..5`, declared once in `:root`).
 *    Fixed grid-column widths, the indicator dot size and border widths are
 *    markup sizes and stay in px.
 *  - Shape and type scales: every `border-radius` comes from
 *    `--radius-sm/-md/-pill` and every `font-size` from `--font-xs..-xl`, both
 *    declared once in `:root`, so a chip cannot drift a step away from the
 *    identical chip elsewhere. The dots' `50%` and the `.status` `font-size: 0`
 *    are shapes, not steps of those scales.
 *
 * Injected by `AgendaPanel.getHtmlContent` inside a nonce'd `<style>` tag; the
 * nonce lives on the tag, these rules are static. `renderTask` emits
 * `.task-line[data-status][data-priority][data-type]` with `.status` /
 * `.time-plain` / `.flag` / `.priority` / `.heading` / `.offset` children;
 * their whole appearance -- column widths, the status dot, the type glyph, the
 * priority chip -- lives here rather than in the renderer.
 */
export const AGENDA_STYLES = `
        :root {
            /* Spacing scale (#20): the only place these step values live as
               literals -- every padding/margin/gap below references a token. */
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 20px;
            /* Corner radii (#38): three shapes only -- a small chip (the
               priority cookie), a control or cell, and a full pill (count
               badges). The 50% used by the status/day dots is a circle from
               their fixed px size, not a step of this scale. */
            --radius-sm: 3px;
            --radius-md: 6px;
            --radius-pill: 999px;
            /* Type scale (#38): five steps, all relative to the webview's own
               font size, so the panel keeps a readable hierarchy instead of the
               ten nearly identical sizes it grew. xs = badges and chips,
               sm = section captions and muted subtitles, md = body rows and
               controls, lg = day numbers and weekday names, xl = the hero. */
            --font-xs: 0.78em;
            --font-sm: 0.85em;
            --font-md: 1em;
            --font-lg: 1.1em;
            --font-xl: 1.5em;
            /* Height of the sticky nav-bar header, measured at runtime by
               syncHeaderOffset. Day-headers stick just below it (top /
               scroll-margin-top). 0px until the first measurement. */
            --agenda-header-h: 0px;
            /* Accent palette: the theme's semantic colours softened toward the
               editor foreground, which is what gives the panel its muted look.
               Declared once here -- the same mix used to be spelled out at
               every use site, so a tweak meant editing a dozen rules. */
            --accent-red: color-mix(in srgb, var(--vscode-charts-red) 72%, var(--vscode-editor-foreground) 28%);
            --accent-yellow: color-mix(in srgb, var(--vscode-charts-yellow) 78%, var(--vscode-editor-foreground) 22%);
            --accent-blue: color-mix(in srgb, var(--vscode-charts-blue) 65%, var(--vscode-editor-foreground) 35%);
            --accent-blue-strong: color-mix(in srgb, var(--vscode-charts-blue) 82%, var(--vscode-editor-foreground) 18%);
            /* The line that ties a week-view day together (see the .day-line
               rules): the day-header's own colour, kept below the weight of the
               coloured bar a row carries so it says where a day starts and ends
               without competing with what is inside it. At 32% it was faint
               enough to be missed on a light theme, which is the boundary the
               week is read by. */
            --day-line: color-mix(in srgb, var(--vscode-textLink-foreground) 60%, transparent);
        }
        body {
            padding: var(--space-5);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            /* Base size for the em-scale below: the webview's own font size. */
            font-size: var(--vscode-font-size);
            line-height: 1.6;
        }
        /* Sticky header: the control row and the current-date line stay pinned
           to the top while the agenda scrolls. The negative margins cancel the
           body's padding so the header spans edge-to-edge and its background
           hides content scrolling underneath (including through the body's
           top/side padding); the padding re-adds the same inset inside. */
        .agenda-header {
            position: sticky;
            top: 0;
            z-index: 20;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            margin: calc(-1 * var(--space-5)) calc(-1 * var(--space-5)) var(--space-4);
            padding: var(--space-5) var(--space-5) var(--space-2);
        }
        /* Nav "A" control block: two stacked rows -- the mode segment on top,
           then the date-nav + tag chips. Separate rows keep the underline
           segment off the same baseline as the boxed nav buttons. The compact
           header deliberately overrides this to a single row (see the
           body.compact-header .nav-bar rule below), trading that separation
           for the vertical space a short panel needs. */
        .nav-bar {
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            margin-bottom: var(--space-2);
        }
        .seg-row {
            display: flex;
        }
        .control-row {
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }
        /* One focus ring for every interactive surface of the panel (#38). The
           nav pill, the mode segment, the tag chip, its dropdown rows and the
           month cells sit in the same panel and are reached by the same Tab
           key, so they cannot look different under keyboard focus. */
        .nav-btn:focus-visible,
        .seg-item:focus-visible,
        .tag-menu-btn:focus-visible,
        .chip-btn:focus-visible,
        .tag-menu-item:focus-visible,
        .group-menu-btn:focus-visible,
        .group-menu-item:focus-visible,
        .day-section-fold:focus-visible,
        .git-file:focus-visible,
        .git-action:focus-visible,
        .calendar-day:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -2px;
        }
        /* Today's cell already carries an inset accent ring at -2px; the focus
           ring moves further in so focusing today stays visible. */
        .calendar-day:focus-visible {
            outline-offset: -4px;
        }
        /* Prev/Today/Next: one rounded segmented control (a "pill"). The group
           owns the border, corner rounding and background; each segment is a
           flat cell divided from its neighbour by a single hairline. Prev/Next
           arrows get a fixed square-ish cell with a slightly larger glyph so
           the control reads as [ ‹ | Today | › ]. */
        .date-nav {
            display: inline-flex;
            align-items: stretch;
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--radius-md);
            overflow: hidden;
        }
        .nav-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-md);
            line-height: 1.3;
            transition: background 0.1s ease, color 0.1s ease;
        }
        .nav-btn + .nav-btn {
            border-left: 1px solid var(--vscode-panel-border);
        }
        .nav-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .nav-btn:active {
            background: color-mix(in srgb, var(--vscode-button-secondaryHoverBackground) 85%, var(--vscode-foreground));
        }
        /* Prev/Next arrow cells: square-ish, centred, a touch larger and muted
           until hovered so "Today" stays the visual anchor of the group. */
        .nav-btn-arrow {
            min-width: 2.1em;
            padding-left: var(--space-2);
            padding-right: var(--space-2);
            font-size: var(--font-lg);
            color: var(--vscode-descriptionForeground);
        }
        .nav-btn-arrow:hover {
            color: var(--vscode-foreground);
        }
        /* Mode segment (Nav "A"): text items with an accent underline on the
           active view instead of button chrome. */
        .mode-seg {
            display: inline-flex;
            gap: var(--space-4);
        }
        .seg-item {
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            padding: 0 0 var(--space-1) 0;
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-md);
            color: var(--vscode-descriptionForeground);
        }
        .seg-item:hover {
            color: var(--vscode-foreground);
        }
        .seg-item.active {
            color: var(--vscode-foreground);
            font-weight: bold;
            border-bottom-color: var(--vscode-textLink-foreground);
        }
        /* Pushes the tag/style chips to the right edge of the control row so
           the two dropdowns read as one paired chip group. */
        .nav-spacer {
            margin-left: auto;
        }
        /* Hero title block (Nav "A"): a large weekday/month title, a muted date
           subtitle, and an optional TODAY badge. Replaces the old single-line
           current-date. */
        .agenda-hero {
            margin-bottom: var(--space-3);
        }
        .hero-title {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            font-size: var(--font-xl);
            line-height: 1.15;
            /* Intl lower-cases weekday and month names in some locales
               ("суббота", "июль"); the hero opens the view, so it reads as a
               heading -- capitalised, like the day-headers below it. */
            text-transform: capitalize;
        }
        .hero-sub {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            margin-top: var(--space-1);
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
        }
        .hero-badge {
            border-radius: var(--radius-pill);
            padding: 0 var(--space-2);
            font-size: var(--font-xs);
            font-weight: bold;
            letter-spacing: 0.05em;
            color: var(--vscode-textLink-activeForeground);
            background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent);
            border: 1px solid color-mix(in srgb, var(--vscode-button-background) 55%, transparent);
        }
        .tag-menu {
            position: relative;
        }
        /* The Tag chip and the header-layout chip are the same component and
           mirror the rounded date-nav "pill", so the control row reads as one
           consistent set of affordances. */
        .tag-menu-btn,
        .chip-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--radius-md);
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-md);
            line-height: 1.3;
            transition: background 0.1s ease;
        }
        .tag-menu-btn:hover,
        .chip-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        /* The dropdown panel repeats the trigger's rounding and floats over the
           content on the theme's widget shadow, so the pair reads as one
           control instead of a flat rectangle under a rounded button. */
        .tag-menu-list {
            position: absolute;
            right: 0;
            top: 100%;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--radius-md);
            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
            overflow: hidden;
            z-index: 10;
            display: none;
            min-width: 120px;
        }
        .tag-menu.open .tag-menu-list {
            display: block;
        }
        /* Non-selectable caption at the top of the style dropdown. */
        .tag-menu-label {
            padding: var(--space-1) var(--space-3);
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
            cursor: default;
        }
        /* A dropdown row is a <button> (that is what gives it Tab focus and
           Enter/Space), stripped back to a plain list row. */
        .tag-menu-item {
            display: flex;
            width: 100%;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            background: none;
            border: none;
            font-family: inherit;
            font-size: inherit;
            text-align: left;
            color: var(--vscode-foreground);
        }
        /* Leading checkmark column: reserved on every row (visibility, not
           display) so the labels stay aligned; shown only on the active row. */
        .tag-menu-check {
            visibility: hidden;
            color: var(--vscode-textLink-foreground);
        }
        .tag-menu-item.active .tag-menu-check {
            visibility: visible;
        }
        .tag-menu-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .tag-menu-item.active {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
        }
        /* Git status of the agenda's source files. The chip is a .tag-menu-btn
           (same shell, same open/close behaviour as the Tag dropdown) with the
           counters laid out in a row. */
        .git-chip {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
        }
        .git-chip-stat {
            display: inline-flex;
            align-items: center;
            gap: 0.25em;
        }
        /* Pending work is the signal worth colouring; a clean tree stays in the
           muted description colour so the header does not shout when there is
           nothing to do.

           Which dictionary a counter is coloured from follows one rule: a state
           the theme already has a git colour for is taken from gitDecoration,
           so a file reads the same here and in Source Control -- which is where
           the conflict note sends the reader. A state git has no colour for
           ("could not be read") falls back to the agenda's own palette. */
        .git-chip-stat[data-kind='uncommitted'] {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
        .git-chip-stat[data-kind='unpushed'] {
            color: var(--vscode-textLink-foreground);
        }
        .git-chip-stat[data-kind='clean'] {
            color: var(--vscode-descriptionForeground);
        }
        /* "? N": files whose state could not be read. Amber rather than the
           modified colour -- there is nothing to commit here, only an answer
           the panel does not have, and git has no colour for that. */
        .git-chip-stat[data-kind='outside'] {
            color: var(--accent-yellow);
        }
        /* "! N": paths a merge left unresolved. Red, and first in the chip:
           this is the state that takes the commit button away. The theme's own
           conflict colour, so the same file is the same colour in the view this
           chip points at; the agenda's red stands in for a theme that skipped
           the token. */
        .git-chip-stat[data-kind='conflicted'] {
            color: var(--vscode-gitDecoration-conflictingResourceForeground, var(--accent-red));
        }
        /* The clean state spells itself out ("✓ clean") instead of leaving a
           bare checkmark to be guessed at. It is not dropped in the compact
           header: that layout is a size change, not a different header (see the
           invariant in agendaStyles.test.ts), and the word is one short token
           whose cost is a few pixels. */
        .git-chip-word {
            margin-left: 0.25em;
        }
        /* Wider than the tag list: these rows carry paths, not one-word tags. */
        .git-menu-list {
            min-width: 220px;
            max-width: 420px;
            max-height: 60vh;
            overflow-y: auto;
        }
        .git-group + .git-group {
            border-top: 1px solid var(--vscode-panel-border);
        }
        .git-group-title,
        .git-repo-title {
            padding: var(--space-1) var(--space-3);
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
            cursor: default;
        }
        .git-repo-title {
            padding-left: var(--space-2);
            font-style: italic;
        }
        /* The commits waiting to be pushed, listed above the files they
           touched. Rows are not interactive -- there is nothing to open behind
           a commit -- so they keep the file row's layout without its hover
           and pointer. */
        .git-commit {
            display: flex;
            align-items: baseline;
            gap: var(--space-2);
            padding: var(--space-1) var(--space-3);
            cursor: default;
        }
        /* Monospace and tabular so the subjects start at the same column down
           the list; the hash itself is the least interesting part of the row
           and stays muted. */
        .git-commit-hash {
            flex: 0 0 auto;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: var(--font-xs);
            color: var(--vscode-descriptionForeground);
        }
        .git-commit-subject {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        /* "and 22 more": a count, not a commit, so it takes the muted colour of
           a caption rather than the foreground of the rows above it. */
        .git-commit-more {
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
        }
        /* Commits and the files they touched are two lists under one heading;
           the rule marks where one ends. Hung on the first file rather than on
           the list above it, so a group with commits and no files of its own
           does not end in a line under nothing. */
        .git-commits + .git-file {
            border-top: 1px solid var(--vscode-panel-border);
        }
        .git-file {
            display: flex;
            width: 100%;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            background: none;
            border: none;
            font-family: inherit;
            font-size: inherit;
            text-align: left;
            color: var(--vscode-foreground);
        }
        .git-file:hover {
            background: var(--vscode-list-hoverBackground);
        }
        /* Fixed-width marker column so the file names line up across groups
           whose markers differ in width. */
        .git-file-mark {
            flex: 0 0 auto;
            width: 1em;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        /* The one marker that is not a state but a demand: a conflicted row
           needs the user before anything else in this menu can proceed. Same
           colour as the counter above it, from the same theme token. */
        .git-file[data-kind='conflicted'] .git-file-mark {
            color: var(--vscode-gitDecoration-conflictingResourceForeground, var(--accent-red));
        }
        /* The sentence under the conflict group. A caption, not a control:
           resolving happens in Source Control, and this row says so rather
           than offering a button that would only forward the click. */
        .git-note {
            padding: var(--space-1) var(--space-3) var(--space-2);
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
            cursor: default;
        }
        /* A path is more useful truncated at the front: the tail (the file name)
           is what distinguishes two rows. */
        .git-file-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            direction: rtl;
            text-align: left;
        }
        .git-actions {
            display: flex;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            border-top: 1px solid var(--vscode-panel-border);
        }
        .git-action {
            flex: 1 1 auto;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--radius-md);
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-md);
        }
        .git-action:hover {
            background: var(--vscode-button-hoverBackground);
        }
        /* Both buttons go inert while either operation runs: the second one
           would act on a status the first is in the middle of invalidating. */
        .git-action[disabled] {
            opacity: 0.6;
            cursor: default;
        }
        .git-action[disabled]:hover {
            background: var(--vscode-button-background);
        }
        /* The spinner marks which of the two is running, for a reader who opens
           the chip again while it still is: the press itself closes the
           dropdown, because both actions raise host UI the menu would sit
           behind. What the main path answers with is the progress notification
           the host raises; this is what the menu says when it comes back. */
        .git-action[data-busy='true']::before {
            content: '';
            display: inline-block;
            width: 0.85em;
            height: 0.85em;
            margin-right: var(--space-1);
            vertical-align: -0.1em;
            border: 2px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            animation: git-action-spin 0.8s linear infinite;
        }
        @keyframes git-action-spin {
            to {
                transform: rotate(360deg);
            }
        }
        /* Reduced motion keeps the ring -- it still marks the busy button --
           and drops only the rotation. */
        @media (prefers-reduced-motion: reduce) {
            .git-action[data-busy='true']::before {
                animation: none;
            }
        }
        .day-header {
            color: var(--vscode-textLink-foreground);
            font-weight: normal;
            /* Top spacing is padding, not margin, so it belongs to the header
               box and is filled by the background below -- a sticky header with
               a transparent top margin would let tasks show through the gap. */
            margin: 0;
            padding: var(--space-5) 0 var(--space-1) 0;
            /* weekday | day | month+year (see formatDayHeader), laid out as a
               baseline row so the parts stay tight together regardless of how
               long the weekday name is. */
            display: flex;
            align-items: baseline;
            gap: var(--space-2);
            border-bottom: 1px solid var(--vscode-panel-border);
            /* Sticky section header: each day's heading pins just below the
               sticky nav-bar (--agenda-header-h, measured by syncHeaderOffset)
               while that day's tasks scroll under it. The background hides the
               scrolling tasks; scroll-margin-top keeps scrollToWeekFocus from
               parking today's header behind the nav-bar. Flat sibling headers
               cover the previous day's header as the next day scrolls up. */
            position: sticky;
            /* Pin 1px into the header's underside so a sub-pixel rounding seam
               between the header's bottom and the header offset never leaves a
               hairline of scrolling task text visible; the header (higher
               z-index, opaque) hides the 1px overlap. */
            top: calc(var(--agenda-header-h) - 1px);
            scroll-margin-top: var(--agenda-header-h);
            z-index: 5;
            background: var(--vscode-editor-background);
        }
        /* Week-view day-headers double as drill-down links into the Day view
           (wireDayHeaderNavigation adds .day-header-link). The pointer and the
           hover underline signal the affordance; colour stays on the existing
           --vscode-textLink token the header already uses. */
        .day-header-link {
            cursor: pointer;
        }
        .day-header-link:hover .day-weekday {
            text-decoration: underline;
        }
        /* Clipping markers (updateDayClipMarkers): the two chips sit at the
           right edge of the day header and count that day's rows currently out
           of view -- above, behind the pinned header, and below, past the
           bottom of the panel. margin-left auto pushes them there without a
           spacer element; align-self overrides the header's baseline alignment,
           which would hang the pills off the text baseline. */
        .day-clip {
            display: flex;
            gap: var(--space-1);
            margin-left: auto;
            align-self: center;
        }
        .day-clip-count {
            font-size: var(--font-xs);
            line-height: 1;
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-pill);
            /* Tabular figures so the chip does not resize on every scroll step
               as the count goes 9 -> 10. */
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .day-clip-above {
            color: var(--accent-yellow);
            background: color-mix(in srgb, var(--vscode-charts-yellow) 16%, transparent);
        }
        .day-clip-below {
            color: var(--accent-blue);
            background: color-mix(in srgb, var(--vscode-charts-blue) 16%, transparent);
        }
        /* The peripheral half of the marker: while a day has rows hidden behind
           its pinned header, that header casts a shadow downwards, so "this day
           continues above" reads without looking at the number. The theme's own
           shadow token keeps it visible in light and dark alike; the negative
           spread confines it to a band under the bottom edge. */
        .day-header-clipped {
            box-shadow: 0 6px 6px -6px var(--vscode-widget-shadow);
        }
        .task-line {
            display: grid;
            /* dot | big time | flag | priority | heading | offset (see
               renderTask). When adding or removing a column, update renderTask
               in lockstep -- the grid does not span-collapse, so a missing span
               shifts every column right of it.
               Offset is auto-sized (not the mockup's fixed 52px, which fit its
               short "-2д"): the real column shows a full DD.MM.YYYY date, so a
               fixed width overflowed it past the grid edge and forced a
               horizontal scrollbar. auto sizes it to the date; the 1fr heading
               absorbs the rest. */
            grid-template-columns: 14px 56px 18px 18px 1fr auto;
            gap: var(--space-2);
            margin: var(--space-1) 0;
            cursor: pointer;
            align-items: center;
            /* The row runs at the base font size (the mockup's 13px) to stay
               compact. */
            font-size: var(--font-md);
            /* A refresh rebuilds every row, and laying them all out is what a
               large corpus actually pays for: measured over 1000 tasks, layout
               was 92 ms of a ~120 ms refresh, because the document is ~30000px
               tall while ~900px of it is on screen. Skipping the off-screen
               rows brings that to 14 ms. The auto keyword in
               contain-intrinsic-size means the placeholder height is only a
               guess until a row has been shown once, after which the measured
               size is remembered -- so the scrollbar is approximate on first
               paint and exact afterwards. */
            content-visibility: auto;
            contain-intrinsic-size: auto 26px;
        }
        .task-line:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .offset[data-dir="overdue"] { color: var(--vscode-descriptionForeground); text-align: right; }
        .offset[data-dir="upcoming"] { color: var(--vscode-textLink-foreground); text-align: right; font-weight: bold; }
        /* A date that is neither behind nor ahead carries no urgency, so it
           stays in the muted meta colour of the rest of the row's edge (design
           principle 4: colour is spent on urgency alone). Only the Tasks card,
           which has no anchor day, renders this direction. */
        .offset[data-dir="today"] { color: var(--vscode-descriptionForeground); text-align: right; }
        /* The Tasks card inverts which direction earns the colour. In the day
           and week views a date appears only on the rare row that sits off the
           anchor day, so highlighting the ones ahead reads as "this is not
           today". The Tasks card dates every row, and there the same rule paints
           most of the right edge in bold blue while an overdue date stays as
           muted as a today one -- attention pulled towards the least urgent
           work. Colour goes to what is late instead (design principle 4). */
        .day-card[data-card="tasks"] .offset[data-dir="upcoming"] {
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }
        .day-card[data-card="tasks"] .offset[data-dir="overdue"] { color: var(--vscode-charts-red); }
        /* ============ month calendar ============
           Same visual language as the cards and the nav pill: rounded cells on
           a hairline border, colour reserved for meaning (today, holidays, task
           load) rather than for chrome. Task load is a count chip in the corner
           -- how many tasks the day holds, red when any of them are overdue.
           The cells carry no fill except today's: a grid of tinted squares
           reads as a block of colour before it reads as a month, so a weekend
           and a holiday are said by the colour of the number instead. */
        .calendar {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: var(--space-1);
            margin: var(--space-3) 0 var(--space-5) 0;
            /* 460px rather than 800: the cells are square, so the width of the
               grid is what sets their height, and a cell 110px tall holds a
               day number and a count chip with the rest of it empty. At this
               width the month is a calendar to glance at rather than a page to
               scroll. */
            max-width: 460px;
        }
        .calendar-header {
            text-align: center;
            padding: var(--space-1) var(--space-2) var(--space-2) var(--space-2);
            color: var(--vscode-descriptionForeground);
            font-size: var(--font-sm);
            font-weight: bold;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        /* A calendar cell drills down into the Day view, so it is a <button>
           like the mode segment; the button chrome is stripped back to the
           bordered cell. */
        .calendar-day {
            aspect-ratio: 1;
            display: flex;
            /* The number sits in the middle of the cell and the chip is pinned
               to a corner over it: at this size a number in the top-left
               corner left the cell looking bottom-heavy, and centring it is
               what a wall calendar does. */
            align-items: center;
            justify-content: center;
            width: 100%;
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
            border-radius: var(--radius-md);
            padding: var(--space-1);
            cursor: pointer;
            background: transparent;
            color: inherit;
            font-family: inherit;
            font-size: inherit;
            text-align: center;
            position: relative;
            transition: background 0.1s ease, border-color 0.1s ease;
        }
        .calendar-day:hover {
            background: var(--vscode-list-hoverBackground);
        }
        /* No fills behind the days. A grid of tinted squares reads as a block
           of colour before it reads as a month; what a weekend and a holiday
           are is said by the colour of the number instead, mixed from a
           semantic colour so it tracks the active theme rather than a fixed
           hue. */
        .calendar-day.weekend .day-number {
            color: color-mix(in srgb, var(--vscode-charts-red) 60%, var(--vscode-editor-foreground));
        }
        .calendar-day.holiday {
            border-color: color-mix(in srgb, var(--vscode-charts-red) 45%, transparent);
        }
        .calendar-day.holiday .day-number {
            color: var(--vscode-charts-red);
        }
        /* A day with work keeps a plain border -- the chip already marks it --
           and only sets its day number in bold. */
        .calendar-day.has-tasks .day-number {
            font-weight: bold;
        }
        /* Today is the one cell that is filled. Nothing else on the grid
           carries a background, so the fill is unmistakable at a glance and
           costs no second mark; the border matches it so the cell size stays
           identical to every other one. */
        .calendar-day.today {
            background: var(--vscode-charts-blue);
            border-color: var(--vscode-charts-blue);
        }
        .calendar-day.today .day-number,
        .calendar-day.today.weekend .day-number {
            color: var(--vscode-editor-background);
            font-weight: bold;
        }
        /* The chip keeps its meaning over the fill: the badge colours are not
           guaranteed to contrast with the accent, so it is drawn as the
           background colour on the number's own ink. */
        .calendar-day.today .task-count {
            color: var(--vscode-charts-blue);
            background: var(--vscode-editor-background);
        }
        .calendar-day.other-month {
            opacity: 0.35;
        }
        .day-number {
            /* The number is what the cell is for, and a 62px cell holds it at
               the top of the scale with room to spare -- the chip sits in the
               corner below it, not beside it. */
            font-size: var(--font-xl);
            /* Set in the editor's own ink rather than the muted grey: at this
               size the muted colour reads as a number fading into the
               background instead of a quiet one. Days outside the month are
               dimmed by the cell's opacity, so the muting that is wanted is
               still there. */
            color: var(--vscode-editor-foreground);
            font-variant-numeric: tabular-nums;
        }
        /* Count chip, declared once for both places that use it: the month
           cell's task load and the card section heads. They are the same
           component, so they share one shape and one size (#38); only the
           placement below differs. */
        .task-count,
        .day-section-count {
            min-width: 22px;
            text-align: center;
            border-radius: var(--radius-pill);
            padding: 0 var(--space-1);
            font-size: var(--font-xs);
            color: var(--vscode-badge-foreground);
            background: var(--vscode-badge-background);
        }
        /* Task-load chip: pinned into the cell's bottom-right corner. */
        .task-count {
            position: absolute;
            bottom: var(--space-1);
            right: var(--space-1);
        }
        .task-count-overdue {
            color: var(--vscode-editor-background);
            background: var(--accent-red);
        }
        /* A deadline still ahead, inside the window Org warns over. Drawn as a
           ring rather than a fill: the fill is what a date in arrears takes,
           and the two must not read as the same state. The ring is held off the
           chip by a hairline of the page behind it, because a theme whose badge
           is itself a warm ochre (Solarized Light) leaves a ring laid straight
           on the chip indistinguishable from its edge. */
        .task-count-due {
            box-shadow:
                0 0 0 1px var(--vscode-editor-background),
                0 0 0 2px var(--accent-yellow);
        }
        /* ============ task rows and day headers ============ */
        body {
            font-family: var(--markdown-org-agenda-font);
        }
        /* Day header (per mockup): blue dot + weekday in blue, a muted date,
           and a thin rule underneath. */
        .day-header .day-weekday {
            /* Day-of-week: only slightly larger than the body text, saturated
               blue and bold (smaller than the mockup's 1.15em). */
            font-size: var(--font-lg);
            font-weight: 700;
            /* ru locale lowercases weekday names ("понедельник"); the mockup
               capitalises the first letter. */
            text-transform: capitalize;
            color: var(--accent-blue-strong);
        }
        .day-header .day-weekday::before {
            content: "";
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-charts-blue);
            vertical-align: middle;
            margin-right: var(--space-2);
        }
        .day-header .day-num,
        .day-header .day-rest {
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }
        /* Visual order within the row: dot first. */
        .status { order: 1; }
        .time-plain { order: 2; }
        .flag { order: 3; }
        .priority { order: 4; }
        .heading { order: 5; }
        .offset { order: 6; }
        /* status rendered as a coloured dot, not text */
        .status {
            font-size: 0;
            justify-self: center;
        }
        /* Status dot colour = attention level (resolveAttentionLevel):
           danger (red) for a DEADLINE or any overdue task, done (green),
           cancelled (grey), else normal (blue -- today or future). The base
           rule paints the normal case; the others override by data-attention. */
        .status::before {
            content: "";
            display: block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent-blue);
        }
        .status[data-attention="danger"]::before { background: var(--accent-red); }
        .status[data-attention="done"]::before { background: var(--vscode-charts-green); }
        .status[data-attention="cancelled"]::before { background: var(--vscode-disabledForeground); }
        /* big time: a clean HH:MM cell. */
        .time-plain {
            display: block;
            /* mockup renders the time in the same sans as the rest (not mono);
               tabular-nums keeps the digits column-aligned. */
            font-family: var(--markdown-org-agenda-font);
            font-variant-numeric: tabular-nums;
            /* Time sits at the heading size (not the mockup's larger 1.23em);
               it stands out by weight and the blue colour alone. */
            font-size: var(--font-md);
            font-weight: 600;
            text-align: right;
            /* Softer, lighter blue than raw charts-blue -- matches the muted
               accent in the mockup -- by blending the theme accent toward the
               foreground. */
            color: var(--accent-blue);
        }
        /* A task with no clock time leaves the column empty: design principle 2
           ("time is the spine of the row") asks for a fixed, right-aligned time
           column that is blank when there is no time, and the cell keeps its
           width either way, so the rows stay aligned. The em-dash that used to
           stand here came from the mockup and read as "no data" on a task that
           simply runs all day. */
        /* flag column */
        .flag {
            display: block;
            text-align: center;
        }
        /* Flag colours match the mockup's muted palette (deadline red, the same
           softened blue as the time, an amber repeat) by blending each theme
           accent toward the foreground; cancelled stays the theme's muted grey. */
        .flag[data-flag="deadline"]::before { content: "⚑"; color: var(--accent-red); }
        .flag[data-flag="scheduled"]::before { content: "◷"; color: var(--accent-blue); }
        .flag[data-flag="repeat"]::before { content: "↻"; color: var(--accent-yellow); }
        .flag[data-flag="cancelled"]::before { content: "⊘"; color: var(--vscode-disabledForeground); }
        /* priority chip */
        .priority {
            font-size: var(--font-xs);
            width: 1.4em;
            text-align: center;
            border-radius: var(--radius-sm);
            color: var(--vscode-editor-background);
        }
        .priority[data-priority="a"] { background: var(--accent-red); }
        .priority[data-priority="b"] { background: var(--accent-yellow); }
        .priority[data-priority="c"] { background: var(--accent-blue); }
        .priority:empty { visibility: hidden; }
        .offset {
            font-family: var(--markdown-org-agenda-font);
            font-variant-numeric: tabular-nums;
        }
        /* Headings stay neutral and regular: colour lives in the flag, the
           priority chip and the offset -- not the heading (per the mockup). */
        .task-line .heading {
            color: var(--vscode-editor-foreground);
            font-weight: normal;
        }
        .task-line[data-status="done"] .heading,
        .task-line[data-status="cancelled"] .heading {
            color: var(--vscode-disabledForeground);
            text-decoration: line-through;
        }
        /* Collection mark: which of several scanned directories the row came
           from (markdown-org.workspaceDirs). A dot at the head of the heading,
           not a column of its own -- see renderTaskRow -- and absent entirely
           while a single directory is scanned.

           The palette deliberately excludes red: colour is spent on urgency
           (design principle 4), and a collection is not urgent. The name is in
           the dot's tooltip, so nothing depends on telling the hues apart. */
        .task-line .collection {
            display: inline-block;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            margin-right: var(--space-2);
            vertical-align: middle;
            background: var(--vscode-charts-blue);
        }
        .task-line .collection[data-tone="0"] { background: var(--vscode-charts-purple); }
        .task-line .collection[data-tone="1"] { background: var(--vscode-charts-green); }
        .task-line .collection[data-tone="2"] { background: var(--vscode-charts-orange); }
        .task-line .collection[data-tone="3"] { background: var(--vscode-charts-blue); }
        .task-line .collection[data-tone="4"] { background: var(--vscode-charts-yellow); }
        /* Directory chips: the same directories the dots above stand for, as a
           row of toggles under the nav bar. A chip that is on is filled, one
           that is off keeps its dot and loses the fill -- the state has to be
           readable without comparing two chips side by side. The row is absent
           while a single directory is scanned, since there is nothing to turn
           off that would leave anything on screen. */
        .collection-chips {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-2);
            margin-bottom: var(--space-2);
        }
        .collection-chip {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-1) var(--space-3);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--radius-pill);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            font-family: inherit;
            font-size: var(--font-xs);
            cursor: pointer;
        }
        .collection-chip.off {
            opacity: 0.55;
            text-decoration: line-through;
        }
        .collection-chip-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--vscode-charts-blue);
        }
        .collection-chip[data-tone="0"] .collection-chip-dot { background: var(--vscode-charts-purple); }
        .collection-chip[data-tone="1"] .collection-chip-dot { background: var(--vscode-charts-green); }
        .collection-chip[data-tone="2"] .collection-chip-dot { background: var(--vscode-charts-orange); }
        .collection-chip[data-tone="3"] .collection-chip-dot { background: var(--vscode-charts-blue); }
        .collection-chip[data-tone="4"] .collection-chip-dot { background: var(--vscode-charts-yellow); }
        /* ============ agenda card (Day and Tasks views) ============
           A card is a sticky summary bar plus stacked section panels. The Day
           view fills it with schedule buckets (At a set time / All-day &
           upcoming / Overdue, marked data-card="day"); the date-less Tasks view
           fills it with priority groups (data-card="tasks"). The task rows
           inside stay standard .task-line elements, so the table styling and
           the click handling carry over unchanged in both. The class names keep
           their historic day- prefix -- they are shared markup hooks, not a
           statement that the card is a single day. */
        .day-card {
            margin-top: var(--space-2);
        }
        /* Summary bar reuses the sticky .day-header shell and its data-date (the
           day-view anchor-date contract) but shows counts, not the date. The
           leading "body" prefix lifts specificity to (0,2,1) so it matches --
           and, being later in the sheet, beats -- the .day-header rule, and
           resets its layout to a flex row of stats. */
        body .day-card .day-summary {
            display: flex;
            align-items: baseline;
            gap: var(--space-2);
            grid-template-columns: none;
            padding: var(--space-3) 0 var(--space-2) 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }
        .day-summary-stat b {
            color: var(--vscode-editor-foreground);
            font-weight: bold;
        }
        .day-summary-sep {
            color: var(--vscode-descriptionForeground);
            opacity: 0.6;
        }
        .day-summary-overdue b {
            color: var(--accent-red);
        }
        .day-summary-done b {
            color: var(--vscode-charts-green);
        }
        /* Tasks card: the [#A] count is the backlog's "needs attention" figure,
           so it takes the same red as the priority-A chip. */
        .day-summary-high b {
            color: var(--accent-red);
        }
        .day-section {
            margin-bottom: var(--space-4);
        }
        .day-section-head {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-3) 0 var(--space-1) 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            /* The whole head folds the section, so it says so under the
               pointer. The band menu is the one part that does something else
               and keeps the default arrow. */
            cursor: pointer;
        }
        /* The fold control: a glyph the size of the heading, in the head's own
           muted colour. It is a button so the fold is reachable by keyboard and
           announced as expanded or collapsed, and it stays quiet -- what it
           does is reversible and one press away, not the point of the section.
           No padding on the leading edge: the glyph lines up with the heading
           text of the panel above it. */
        .day-section-fold {
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-sm);
            line-height: 1;
            color: var(--vscode-descriptionForeground);
        }
        .day-section-head:hover .day-section-fold {
            color: var(--vscode-foreground);
        }
        /* A folded section keeps the space a heading takes and nothing more:
           the panel's bottom margin is what separates it from the next one, and
           between two folded heads that reads as a gap wider than the heads
           themselves. */
        .day-section.day-section-is-folded {
            margin-bottom: var(--space-2);
        }
        /* Week view: a band head standing on its own, with its rows as the
           siblings that follow it rather than as children of a panel (see
           renderBandHeading). It carries .day-section-head for the layout and
           the rule below only for the room around it -- inside a card the
           panel's own margin does that job. */
        .day-band {
            margin-top: var(--space-3);
        }
        /* Week view: one line down the left of a day, from its heading to its
           last row, so a band ("All-day & upcoming") reads as part of the day
           above it instead of as a block of its own.
           A day is a run of flat siblings -- nothing wraps one -- so the line
           is a left border on each element of the run, and the run must have no
           vertical gaps for the pieces to meet: the rows and the band trade
           their margins for the same amount of padding. Halved on the row,
           because two paddings add up where the margins they replace collapsed
           into one.
           The heading draws its piece as a pseudo-element rather than a border:
           its top padding is the gap that separates one day from the next, and
           a border would run straight through it. A row cannot do the same --
           content-visibility on .task-line brings paint containment with it,
           which clips a pseudo-element to the row's own box.
           Everything is anchored on the "#content > .day-header ~" prefix,
           which no other view can match: the day and tasks cards render rows in
           a .day-card, and the month view renders a calendar. */
        #content > .day-header {
            padding-left: var(--space-2);
        }
        #content > .day-header::before {
            content: '';
            position: absolute;
            left: 0;
            top: var(--space-5);
            bottom: 0;
            width: 3px;
            background: var(--day-line);
        }
        #content > .day-header ~ .task-line,
        #content > .day-header ~ .day-band {
            border-left: 3px solid var(--day-line);
            padding-left: var(--space-2);
        }
        #content > .day-header ~ .task-line {
            margin: 0;
            padding-top: calc(var(--space-1) / 2);
            padding-bottom: calc(var(--space-1) / 2);
        }
        #content > .day-header ~ .day-band {
            margin-top: 0;
            padding-top: var(--space-3);
        }
        .day-section-name {
            font-weight: bold;
            font-size: var(--font-sm);
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        /* Count chip (shape and colours declared with .task-count above):
           pushed to the right of the section head. */
        .day-section-count {
            margin-left: auto;
        }
        /* Overdue panels: red-tinted name and a red count chip so the backlog at
           the bottom stays visually distinct from the day's active work. The
           band older than a year is left neutral -- it is kept, not planned,
           and a screen of red headings says nothing about which of them is
           worth answering first. */
        .day-section-overdue-repeat .day-section-name,
        .day-section-overdue-recent .day-section-name,
        .day-section-overdue-earlier .day-section-name {
            color: var(--accent-red);
        }
        .day-section-overdue-repeat .day-section-count,
        .day-section-overdue-recent .day-section-count,
        .day-section-overdue-earlier .day-section-count {
            color: var(--vscode-editor-background);
            background: var(--accent-red);
        }
        /* Tasks-card priority panels: the count chip repeats the priority chip
           palette of the rows below it (A red, B amber, C blue), so the group
           colour and the per-row cookie read as the same signal. The
           unprioritised backlog keeps the neutral theme badge. */
        .day-section-pa .day-section-count {
            color: var(--vscode-editor-background);
            background: var(--accent-red);
        }
        .day-section-pb .day-section-count {
            color: var(--vscode-editor-background);
            background: var(--accent-yellow);
        }
        .day-section-pc .day-section-count {
            color: var(--vscode-editor-background);
            background: var(--accent-blue);
        }
        /* The group menu of an overdue band: one glyph at the end of the head,
           and a dropdown that repeats the tag menu's panel. It stays the muted
           colour of the head until hovered -- what is behind it rewrites every
           note of the band, and a control that loud would be read as the point
           of the section rather than as something available in it. */
        .group-menu {
            position: relative;
            display: flex;
            align-items: center;
            /* Its own control, on a head that folds: the pointer says the press
               lands here and not on the fold. */
            cursor: default;
        }
        .group-menu-btn {
            background: none;
            border: none;
            padding: 0 var(--space-1);
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-md);
            line-height: 1;
            color: var(--vscode-descriptionForeground);
        }
        .group-menu-btn:hover {
            color: var(--vscode-foreground);
        }
        .group-menu-list {
            position: absolute;
            right: 0;
            top: 100%;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: var(--radius-md);
            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
            overflow: hidden;
            z-index: 10;
            display: none;
            min-width: 160px;
        }
        .group-menu.open .group-menu-list {
            display: block;
        }
        /* Same row shell as .tag-menu-item, without the checkmark column: these
           rows are actions, not a current choice. */
        .group-menu-item {
            display: block;
            width: 100%;
            padding: var(--space-1) var(--space-3);
            cursor: pointer;
            background: none;
            border: none;
            font-family: inherit;
            font-size: var(--font-md);
            text-align: left;
            white-space: nowrap;
            color: var(--vscode-foreground);
        }
        .group-menu-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .day-section-body {
            margin-top: var(--space-1);
        }
        .day-empty {
            padding: var(--space-4) 0;
            color: var(--vscode-descriptionForeground);
        }
        /* ============ compact header ============
           markdown-org.agendaHeaderMode: the class is set on <body> by the
           page (auto follows the panel height). The full header spends about a
           fifth of a short panel on chrome; this pulls the hero title onto the
           control row, drops the subtitle to inline text and tightens the
           padding, keeping every control exactly where it was. Nothing here
           changes the header's structure -- only its size -- so the sticky
           day-header offset keeps working: the header's ResizeObserver
           re-measures --agenda-header-h when the class flips. */
        body.compact-header .agenda-header {
            /* The header is a block in the full layout, so the hero and the nav
               block each own a line. Turning it into a flex row is what puts
               them side by side; "order" on a child of a block parent does
               nothing, which is how an earlier version only looked compact. */
            display: flex;
            align-items: center;
            /* No wrap here on purpose: wrapping would put the nav block back on
               its own line whenever the hero plus the nav's flex-basis exceed
               the panel width -- undoing the layout on exactly the narrow
               panels the mode is for. The wrapping happens one level down,
               inside the nav block, where it costs height but keeps the title
               on the control row. */
            flex-wrap: nowrap;
            gap: var(--space-2) var(--space-4);
            padding: var(--space-2) var(--space-5);
            margin-bottom: var(--space-2);
        }
        body.compact-header .nav-bar {
            /* Mode segment and controls share one row instead of stacking, and
               the block takes whatever width the hero leaves. "min-width: 0"
               lets it shrink below its content instead of forcing a wrap. The
               basis is what it wants, not what it demands: the parent does not
               wrap, so a narrower panel shrinks it instead. */
            flex: 1 1 20rem;
            min-width: 0;
            flex-direction: row;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--space-3);
            margin-bottom: 0;
        }
        body.compact-header .control-row {
            flex: 1 1 auto;
        }
        body.compact-header .agenda-hero {
            /* The hero rides along the control row rather than owning a line:
               it keeps its intrinsic width and wraps its own two parts. */
            flex: 0 1 auto;
            min-width: 0;
            display: flex;
            align-items: baseline;
            flex-wrap: wrap;
            gap: var(--space-2);
            margin-bottom: 0;
        }
        body.compact-header .hero-title {
            font-size: var(--font-lg);
            line-height: 1.3;
        }
        body.compact-header .hero-sub {
            margin-top: 0;
            font-size: var(--font-xs);
        }
        body.compact-header .day-header {
            padding-top: var(--space-3);
        }
    `;
