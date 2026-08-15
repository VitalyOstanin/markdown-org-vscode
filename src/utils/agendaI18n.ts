/**
 * User-visible strings of the agenda webview, and the rule that picks the
 * language for them.
 *
 * VS Code's own `vscode.l10n` bundles follow the editor's *display language*,
 * which is a different axis from the locale the agenda formats its dates with
 * (`markdown-org.dateLocale`). A user who reads Russian dates in an
 * English-language VS Code would still get an English agenda, which is exactly
 * the mismatch this module removes: `markdown-org.uiLanguage` selects the UI
 * language explicitly, and its default (`auto`) follows the date locale first,
 * the editor display language second.
 *
 * The dictionary is injected into the webview as a JSON literal, so it must
 * stay plain data (no functions). Strings with a `{0}` placeholder are filled
 * by `formatString`; counted nouns list their plural forms in the order
 * `pluralIndex` returns.
 */

/** Languages the agenda ships strings for. */
export type UiLanguage = 'en' | 'ru';

export const UI_LANGUAGES: UiLanguage[] = ['en', 'ru'];

/** Per-mode labels, keyed by the mode ids the panel already uses. */
export interface ModeStrings {
    day: string;
    week: string;
    month: string;
    tasks: string;
}

export interface AgendaStrings {
    /** Mode segment labels (also used for the panel tab title). */
    modes: ModeStrings;
    /** Tooltip on a mode button; `{0}` is the mode label. */
    switchToView: string;
    /**
     * Prev/Next tooltips per navigation unit. Kept as complete phrases rather
     * than a "Previous {0}" template: in Russian the adjective agrees with the
     * noun's gender ("Предыдущий день" but "Предыдущая неделя").
     */
    navPrev: { day: string; week: string; month: string };
    navNext: { day: string; week: string; month: string };
    /** Label of the Today button, and its tooltip. */
    navToday: string;
    navTodayTitle: string;
    /** Badge next to the hero date when the anchor is today. */
    todayBadge: string;
    /** Tooltip on a clickable week day-header. */
    openDayView: string;
    /**
     * Week-view clipping chips: what the counts in a day header mean. `{0}` is
     * the number of that day's tasks currently out of view on that side.
     */
    clip: { above: string; below: string };
    /** File-tag dropdown: caption, collapsed button (`{0}` = tag), row titles. */
    tagCaption: string;
    tagButton: string;
    /** Display name of the implicit "no filter" tag (stored as `ALL`). */
    tagAll: string;
    tagAllTitle: string;
    /** `{0}` is the tag name. */
    tagFilterTitle: string;
    /**
     * Tooltip of a directory chip, the row that appears once several
     * directories are scanned. `{0}` is the directory's name. The chip turns
     * that directory off and on, which is the level applied before the tag
     * filter -- what is read, not which of it is shown.
     */
    collectionChipTitle: string;
    /**
     * Header-layout button: the collapsed label (`{0}` = the current mode's
     * name), the tooltip (`{0}` = current mode, `{1}` = what one click gives),
     * and the three mode names.
     */
    headerModeButton: string;
    headerModeTitle: string;
    headerModes: { auto: string; full: string; compact: string };
    /**
     * Day-card section titles. The overdue backlog carries one heading per
     * band -- see `DaySectionKey` in agendaDaySummary.ts.
     */
    sections: {
        scheduled: string;
        allday: string;
        overdueRepeat: string;
        overdueRecent: string;
        overdueEarlier: string;
        overdueLong: string;
    };
    /** Tasks-card priority group titles. */
    groups: { a: string; b: string; c: string; none: string };
    /**
     * Folding a section away and bringing it back: the tooltip and accessible
     * name of the control on its head. `{0}` is the section's own title, so the
     * control says which section it answers for -- a screen of identical "Hide
     * this section" is no help on a card that stacks six of them.
     */
    fold: { collapse: string; expand: string };
    /**
     * Acting on a whole overdue band at once: the menu behind the mark at the
     * end of a band's heading, and what the move reports afterwards.
     *
     * The reports are read on the extension side (a toast and the status bar
     * are host UI) and the menu in the page, but both live here so the feature
     * speaks one language -- see the note on `git` below.
     */
    group: {
        /** Tooltip on the mark that opens the menu; `{0}` is the band's name. */
        menuTitle: string;
        /** Menu item labels. */
        moveToToday: string;
        dropPlanning: string;
        cancel: string;
        /** Menu item tooltips: what each does to every entry of the band. */
        moveToTodayHint: string;
        dropPlanningHint: string;
        cancelHint: string;
        /** What the action did; `{0}` is a counted noun from `summary.tasks`. */
        moved: string;
        dropped: string;
        cancelled: string;
        /** Appended when part of the band was left alone; `{0}` counts those. */
        refused: string;
        /** Nothing in the band could be acted on. */
        nothing: string;
        /** The undo offer, and what taking it did; `{0}` counts the files. */
        undo: string;
        undone: string;
        /** Appended when some files had moved on and were left as they are. */
        undoPartial: string;
        /** Every file had moved on: there was nothing left to put back. */
        undoNothing: string;
    };
    /** Summary bar: the counted noun plus the two qualifier words. */
    summary: { tasks: string[]; overdue: string; done: string; priorityA: string };
    /**
     * Count-chip tooltips, shared by the month cell and the card section head
     * (the two chips are the same component): counted noun, the overdue suffix
     * (`{0}`) used by the month cell, and the section wording (`{0}` = the
     * counted noun).
     */
    countChip: { tasks: string[]; overdue: string; inSection: string };
    /** Empty-state lines of the two cards. */
    empty: { day: string; tasks: string };
    tooltips: {
        cancelled: string;
        deadline: string;
        deadlineAt: string;
        scheduled: string;
        scheduledAt: string;
        repeating: string;
        repeatingNext: string;
        repeatingOn: string;
        attentionDone: string;
        attentionCancelled: string;
        attentionDanger: string;
        attentionNormal: string;
        priority: string;
        priorityHighest: string;
        priorityLowest: string;
        /**
         * The coloured dot a row carries while several directories are scanned
         * (`markdown-org.workspaceDirs`). `{0}` is the directory's name.
         */
        collection: string;
    };
    /**
     * Git status of the agenda's source files: the header chip, the list it
     * expands to, and the prompts the two actions raise.
     *
     * The last block is read on the extension side rather than in the page
     * (an `InputBox` and a modal are host UI), but it lives here so the whole
     * feature speaks one language -- the one `markdown-org.uiLanguage` picked,
     * not the editor's display language.
     */
    git: {
        /** Dropdown caption. */
        caption: string;
        /** Word next to the checkmark when nothing is pending. */
        clean: string;
        cleanTitle: string;
        /** Parts of the chip tooltip; `{0}` is a counted noun from `files`. */
        uncommittedTitle: string;
        unpushedTitle: string;
        /**
         * Files whose state could not be read at all, either
         * because they are outside git or because the repository holding them
         * is one VS Code declined to open. "Clean" would be a claim about them
         * that nothing checked.
         */
        outsideTitle: string;
        /**
         * Paths a merge left unresolved. Counted over the whole repository,
         * not over the view: what they block is the commit button, and that
         * button is refused for the repository.
         */
        conflictedTitle: string;
        /** Joins the parts above, in the order `gitCounters` lists them. */
        titleSeparator: string;
        /** Group headings; `{0}` is a counted noun from `files`. */
        uncommittedGroup: string;
        conflictedGroup: string;
        /** Row under the conflict group: where they are resolved instead. */
        conflictedHint: string;
        unpushedGroup: string;
        /**
         * Single-repository variant of the unpushed heading: `{0}` files,
         * `{1}` commits, `{2}` branch, `{3}` upstream.
         */
        unpushedGroupDetailed: string;
        cleanGroup: string;
        outsideGroup: string;
        /**
         * Last row of the commit list; `{0}` is the number left out. A bare
         * number, not a counted noun: the group heading right above already
         * says "in N commits", and repeating the word there reads as a second
         * subject ("and 29 commits more").
         */
        moreCommits: string;
        /** Counted nouns, in the order `pluralIndex` returns. */
        files: string[];
        commits: string[];
        /** Action buttons; `{0}` is the count each acts on. */
        commitButton: string;
        commitButtonTitle: string;
        pushButton: string;
        pushButtonTitle: string;
        /** Row tooltips; `{0}` is the path. */
        openFileTitle: string;
        realPathTitle: string;
        /** Commit prompt: title, placeholder, and the pre-filled message (`{0}` = date). */
        commitPrompt: string;
        commitPlaceholder: string;
        commitDefault: string;
        /** Refusal when the message is blank. */
        commitEmptyMessage: string;
        /**
         * Refusal when the repository is mid-merge; `{0}` is its name. Reached
         * from a panel whose status is a moment stale -- the button is already
         * gone once the next status arrives.
         */
        commitConflicts: string;
        /**
         * Consent for a commit that carries more than this view: `{0}` the
         * repositories, `{1}` a counted noun from `files`. Raised because the
         * commit writes the whole index and the index is not ours alone --
         * see the module comment of `src/commands/gitActions.ts`.
         */
        commitForeignStaged: string;
        commitForeignConfirm: string;
        /** Progress notifications while the two operations run. */
        commitProgress: string;
        pushProgress: string;
        /**
         * Push refused by the remote because it holds commits we do not:
         * `{0}` branch, `{1}` upstream. Says what to do instead of quoting
         * git -- "non-fast-forward" names the rule, not the way out.
         */
        pushRejected: string;
        /**
         * Any other failure of the two operations; `{0}` is git's own wording,
         * quoted rather than interpreted. The sentence around it is translated
         * so the message does not arrive half in the UI language and half in
         * English.
         */
        commitFailed: string;
        pushFailed: string;
        /** Push from a detached HEAD: there is no branch to send anywhere. */
        pushDetachedHead: string;
        /**
         * Push with no upstream: `{0}` repository, `{1}` branch, `{2}` the
         * upstream to create. The repository is named because such a branch is
         * absent from the counter on the push button -- the question would
         * otherwise be about a repository the panel never showed.
         */
        setUpstreamPrompt: string;
        setUpstreamConfirm: string;
        /** Status-bar confirmation; `{0}` is a counted noun from `files`. */
        committed: string;
        /**
         * The same for push, counted in `commits`: what travels is commits,
         * and a repository count would report "1" for a branch ten commits
         * ahead.
         */
        pushed: string;
        /**
         * Push that created an upstream; `{0}` names the branches as
         * `repository/branch`, joined by `titleSeparator`. Not counted in
         * commits: a branch with no upstream has no `ahead` to count, which is
         * exactly why this outcome used to pass in silence.
         */
        pushedUpstream: string;
    };
    /** Panel tab title; `{0}` is the mode label. */
    tabTitle: string;
}

const EN: AgendaStrings = {
    modes: { day: 'Day', week: 'Week', month: 'Month', tasks: 'Tasks' },
    switchToView: 'Switch to {0} view',
    navPrev: { day: 'Previous Day', week: 'Previous Week', month: 'Previous Month' },
    navNext: { day: 'Next Day', week: 'Next Week', month: 'Next Month' },
    navToday: 'Today',
    navTodayTitle: 'Jump to today',
    todayBadge: 'TODAY',
    openDayView: 'Open this day in Day view',
    clip: { above: 'Hidden above the view: {0}', below: 'Hidden below the view: {0}' },
    tagCaption: 'File tag',
    tagButton: 'Tag: {0}',
    tagAll: 'ALL',
    tagAllTitle: 'Show tasks from every file',
    tagFilterTitle: 'Filter to files tagged {0}',
    collectionChipTitle: 'Show or hide the tasks of {0}',
    headerModeButton: 'Header: {0}',
    headerModeTitle: 'Agenda header: {0} (click for {1})',
    headerModes: { auto: 'Auto', full: 'Full', compact: 'Compact' },
    sections: {
        scheduled: 'At a set time',
        allday: 'All-day & upcoming',
        overdueRepeat: 'Missed repeats',
        overdueRecent: 'Overdue this week',
        overdueEarlier: 'Overdue earlier',
        overdueLong: 'Overdue long ago'
    },
    groups: { a: 'Priority A', b: 'Priority B', c: 'Priority C', none: 'No priority' },
    fold: { collapse: 'Hide the “{0}” section', expand: 'Show the “{0}” section' },
    group: {
        menuTitle: 'Act on every entry of “{0}” at once, in one move that can be put back',
        moveToToday: 'Move to today',
        dropPlanning: 'Drop the date',
        cancel: 'Mark cancelled',
        moveToTodayHint:
            'Date every entry of the band today. A missed repeat is caught up to its next occurrence instead, keeping its repeater.',
        dropPlanningHint:
            'Take the planning date off every entry of the band. The tasks stay, and leave the agenda until they are dated again.',
        cancelHint: 'Mark every entry of the band cancelled, writing the keyword into the note it came from.',
        moved: 'Moved {0} to today',
        dropped: 'Dropped the date from {0}',
        cancelled: 'Cancelled {0}',
        refused: '({0} left as they were)',
        nothing: 'Nothing in this group could be changed',
        undo: 'Undo',
        undone: 'Put back {0}',
        undoPartial: 'Some notes had changed and were left as they are.',
        undoNothing: 'The notes have changed since; nothing was put back'
    },
    summary: { tasks: ['task', 'tasks'], overdue: 'overdue', done: 'done', priorityA: 'priority A' },
    countChip: { tasks: ['task', 'tasks'], overdue: '{0} overdue', inSection: '{0} in this section' },
    empty: { day: 'Nothing scheduled for this day.', tasks: 'No tasks to show.' },
    tooltips: {
        cancelled: 'Cancelled',
        deadline: 'Has a deadline',
        deadlineAt: 'Deadline: {0}',
        scheduled: 'Scheduled at a set time',
        scheduledAt: 'Scheduled: {0}',
        repeating: 'Repeating task',
        repeatingNext: 'Repeating{0} — next {1}',
        repeatingOn: 'Repeating{0} — dated {1}',
        attentionDone: 'Done',
        attentionCancelled: 'Cancelled',
        attentionDanger: 'Deadline or overdue — needs action',
        attentionNormal: 'On schedule',
        priority: 'Priority {0}',
        priorityHighest: 'Priority {0} (highest)',
        priorityLowest: 'Priority {0} (lowest)',
        collection: 'From {0}'
    },
    git: {
        caption: 'Source files',
        clean: 'clean',
        cleanTitle: 'Every agenda source file is committed and pushed',
        uncommittedTitle: '{0} not committed',
        unpushedTitle: '{0} not pushed',
        outsideTitle: '{0} outside git, or in a repository VS Code has not opened',
        conflictedTitle: '{0} with unresolved conflicts',
        titleSeparator: ', ',
        uncommittedGroup: 'Not committed: {0}',
        conflictedGroup: 'Conflicts: {0}',
        conflictedHint: 'Resolve them in Source Control, then commit from here',
        unpushedGroup: 'Not pushed: {0}',
        unpushedGroupDetailed: 'Not pushed: {0} in {1} ({2} → {3})',
        cleanGroup: 'Clean: {0}',
        outsideGroup: 'Outside git: {0}',
        moreCommits: 'and {0} more',
        files: ['file', 'files'],
        commits: ['commit', 'commits'],
        commitButton: 'Commit {0}',
        commitButtonTitle: 'Stage and commit the changed source files of this view',
        pushButton: 'Push {0}',
        pushButtonTitle: 'Push the current branch to its upstream',
        openFileTitle: 'Open {0}',
        realPathTitle: 'Real path: {0}',
        commitPrompt: 'Commit message',
        commitPlaceholder: 'What changed in these files',
        commitDefault: 'agenda: {0}',
        commitEmptyMessage: 'Commit cancelled: the message is empty',
        commitConflicts: 'Commit cancelled: "{0}" has unresolved conflicts. Resolve them in Source Control first.',
        commitForeignStaged: '"{0}" has {1} staged outside this view. The commit will include them. Continue?',
        commitForeignConfirm: 'Commit anyway',
        commitProgress: 'Committing the agenda source files…',
        pushProgress: 'Pushing the agenda repositories…',
        pushRejected:
            'Push rejected: "{1}" has commits "{0}" does not. Fetch and merge (or rebase) them, then push again.',
        commitFailed: 'Commit failed: {0}',
        pushFailed: 'Push failed: {0}',
        pushDetachedHead: 'Push cancelled: HEAD is not on a branch',
        setUpstreamPrompt: '"{0}": branch "{1}" has no upstream. Push it and set "{2}"?',
        setUpstreamConfirm: 'Push',
        committed: 'Committed {0}',
        pushed: 'Pushed {0}',
        pushedUpstream: 'Pushed to a new upstream: {0}'
    },
    tabTitle: 'Agenda: {0}'
};

const RU: AgendaStrings = {
    modes: { day: 'День', week: 'Неделя', month: 'Месяц', tasks: 'Задачи' },
    switchToView: 'Переключиться на вид «{0}»',
    navPrev: { day: 'Предыдущий день', week: 'Предыдущая неделя', month: 'Предыдущий месяц' },
    navNext: { day: 'Следующий день', week: 'Следующая неделя', month: 'Следующий месяц' },
    navToday: 'Сегодня',
    navTodayTitle: 'Перейти к сегодняшнему дню',
    todayBadge: 'СЕГОДНЯ',
    openDayView: 'Открыть этот день в режиме дня',
    clip: { above: 'Скрыто выше видимой области: {0}', below: 'Скрыто ниже видимой области: {0}' },
    tagCaption: 'Метка файла',
    tagButton: 'Метка: {0}',
    tagAll: 'ВСЕ',
    tagAllTitle: 'Показывать задачи из всех файлов',
    tagFilterTitle: 'Только файлы с меткой {0}',
    collectionChipTitle: 'Показать или скрыть задачи каталога {0}',
    headerModeButton: 'Шапка: {0}',
    headerModeTitle: 'Шапка агенды: {0} (нажмите, чтобы включить «{1}»)',
    headerModes: { auto: 'Авто', full: 'Полная', compact: 'Компактная' },
    sections: {
        scheduled: 'Ко времени',
        allday: 'Весь день и предстоящие',
        overdueRepeat: 'Пропущенные повторы',
        overdueRecent: 'Просрочено на этой неделе',
        overdueEarlier: 'Просрочено раньше',
        overdueLong: 'Просрочено давно'
    },
    groups: { a: 'Приоритет A', b: 'Приоритет B', c: 'Приоритет C', none: 'Без приоритета' },
    fold: { collapse: 'Скрыть раздел «{0}»', expand: 'Показать раздел «{0}»' },
    group: {
        menuTitle: 'Применить действие ко всем задачам раздела «{0}» сразу, одним изменением с возможностью отката',
        moveToToday: 'Перенести на сегодня',
        dropPlanning: 'Убрать дату',
        cancel: 'Отметить отменённым',
        moveToTodayHint:
            'Поставить всем задачам раздела сегодняшнюю дату. Пропущенный повтор вместо этого догоняет следующее вхождение и сохраняет повторитель.',
        dropPlanningHint:
            'Убрать дату планирования у всех задач раздела. Задачи остаются и уходят из агенды, пока им снова не назначат дату.',
        cancelHint: 'Отметить все задачи раздела отменёнными, записав ключевое слово в исходную заметку.',
        moved: 'Перенесено на сегодня: {0}',
        dropped: 'Дата убрана: {0}',
        cancelled: 'Отменено: {0}',
        refused: '(оставлено без изменений: {0})',
        nothing: 'В этом разделе нечего было изменить',
        undo: 'Отменить',
        undone: 'Возвращено: {0}',
        undoPartial: 'Часть заметок изменилась и оставлена как есть.',
        undoNothing: 'Заметки успели измениться, возвращать нечего'
    },
    summary: {
        tasks: ['задача', 'задачи', 'задач'],
        overdue: 'просрочено',
        done: 'выполнено',
        priorityA: 'с приоритетом A'
    },
    countChip: {
        tasks: ['задача', 'задачи', 'задач'],
        overdue: 'из них просрочено: {0}',
        inSection: '{0} в этом разделе'
    },
    empty: { day: 'На этот день ничего не запланировано.', tasks: 'Задач нет.' },
    tooltips: {
        cancelled: 'Отменено',
        deadline: 'Есть крайний срок',
        deadlineAt: 'Крайний срок: {0}',
        scheduled: 'Запланировано на определённое время',
        scheduledAt: 'Запланировано: {0}',
        repeating: 'Повторяющаяся задача',
        repeatingNext: 'Повторяется{0} — следующее {1}',
        repeatingOn: 'Повторяется{0} — дата {1}',
        attentionDone: 'Выполнено',
        attentionCancelled: 'Отменено',
        attentionDanger: 'Крайний срок или просрочка — требует действия',
        attentionNormal: 'По плану',
        priority: 'Приоритет {0}',
        priorityHighest: 'Приоритет {0} (высший)',
        priorityLowest: 'Приоритет {0} (низший)',
        collection: 'Из каталога {0}'
    },
    git: {
        caption: 'Файлы-источники',
        clean: 'чисто',
        cleanTitle: 'Все файлы-источники агенды закоммичены и отправлены',
        uncommittedTitle: 'не закоммичено: {0}',
        unpushedTitle: 'не отправлено: {0}',
        outsideTitle: 'вне git или в репозитории, который VS Code не открыл: {0}',
        conflictedTitle: 'с неразрешёнными конфликтами: {0}',
        titleSeparator: ', ',
        uncommittedGroup: 'Без коммита: {0}',
        conflictedGroup: 'Конфликты: {0}',
        conflictedHint: 'Разрешите их в Source Control, затем коммитьте отсюда',
        unpushedGroup: 'Без пуша: {0}',
        unpushedGroupDetailed: 'Без пуша: {0} в {1} ({2} → {3})',
        cleanGroup: 'Чисто: {0}',
        outsideGroup: 'Вне git: {0}',
        moreCommits: 'и ещё {0}',
        files: ['файл', 'файла', 'файлов'],
        commits: ['коммит', 'коммита', 'коммитов'],
        commitButton: 'Закоммитить {0}',
        commitButtonTitle: 'Добавить в индекс и закоммитить изменённые файлы-источники этого показа',
        pushButton: 'Отправить {0}',
        pushButtonTitle: 'Отправить текущую ветку в upstream',
        openFileTitle: 'Открыть {0}',
        realPathTitle: 'Реальный путь: {0}',
        commitPrompt: 'Сообщение коммита',
        commitPlaceholder: 'Что изменилось в этих файлах',
        commitDefault: 'agenda: {0}',
        commitEmptyMessage: 'Коммит отменён: сообщение пустое',
        commitConflicts: 'Коммит отменён: в «{0}» есть неразрешённые конфликты. Сначала разрешите их в Source Control.',
        commitForeignStaged: 'В «{0}» в индексе {1} вне этого вида. Коммит заберёт и их. Продолжить?',
        commitForeignConfirm: 'Закоммитить всё',
        commitProgress: 'Коммит файлов-источников агенды…',
        pushProgress: 'Отправка репозиториев агенды…',
        pushRejected:
            'Отправка отклонена: в «{1}» есть коммиты, которых нет в «{0}». Получите их (merge или rebase) и отправьте снова.',
        commitFailed: 'Коммит не выполнен: {0}',
        pushFailed: 'Отправка не выполнена: {0}',
        pushDetachedHead: 'Отправка отменена: HEAD не на ветке',
        setUpstreamPrompt: 'В «{0}» у ветки «{1}» нет upstream. Отправить и установить «{2}»?',
        setUpstreamConfirm: 'Отправить',
        committed: 'Закоммичено: {0}',
        pushed: 'Отправлено: {0}',
        pushedUpstream: 'Отправлено в новый upstream: {0}'
    },
    tabTitle: 'Агенда: {0}'
};

export const AGENDA_STRINGS: Record<UiLanguage, AgendaStrings> = { en: EN, ru: RU };

/**
 * Which plural form of a counted noun to use for `n`.
 *
 * English has two forms (one / many). Russian has three, selected by the last
 * digit with the 11-14 exception: 1 задача, 2 задачи, 5 задач, 11 задач,
 * 21 задача. Unknown languages fall back to the English rule.
 *
 * Inlined into the webview via `.toString()`, so it must stay self-contained.
 */
export function pluralIndex(n: number, lang: string): number {
    const count = Math.abs(Math.trunc(n));
    if (lang !== 'ru') {
        return count === 1 ? 0 : 1;
    }
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return 0;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 1;
    }
    return 2;
}

/**
 * Substitute `{0}`, `{1}`, ... in a template with the given values. Missing
 * values leave their placeholder untouched rather than printing "undefined".
 *
 * Inlined into the webview via `.toString()`, so it must stay self-contained.
 */
export function formatString(template: string, ...values: string[]): string {
    return template.replaceAll(/\{(\d+)\}/g, (match, digits) => {
        const value = values[Number(digits)];
        return value ?? match;
    });
}

/**
 * Pick the agenda UI language.
 *
 * `setting` is `markdown-org.uiLanguage`: an explicit language wins outright.
 * `auto` follows the date locale first (so the buttons speak the language the
 * dates already do), then the editor display language, then English.
 */
export function resolveUiLanguage(setting: string, dateLocale: string, displayLanguage: string): UiLanguage {
    // `split` always yields at least one element, so the `??` is unreachable;
    // it stands in for an assertion the compiler cannot make on its own.
    const normalize = (value: string): string => (value || '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
    const explicit = normalize(setting);
    if (explicit && explicit !== 'auto') {
        return (UI_LANGUAGES as string[]).includes(explicit) ? (explicit as UiLanguage) : 'en';
    }
    for (const candidate of [normalize(dateLocale), normalize(displayLanguage)]) {
        if ((UI_LANGUAGES as string[]).includes(candidate)) {
            return candidate as UiLanguage;
        }
    }
    return 'en';
}
