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
    /**
     * Tooltips of the view-history buttons. `{0}` is the keyboard shortcut, so
     * the panel is where the chord is discoverable -- it is otherwise only
     * visible in the Command Palette, and only while the agenda has focus.
     */
    historyBack: string;
    historyForward: string;
    /** Badge next to the hero date when the anchor is today. */
    todayBadge: string;
    /** Tooltip on a clickable week day-header. */
    openDayView: string;
    /** File-tag dropdown: caption, collapsed button (`{0}` = tag), row titles. */
    tagCaption: string;
    tagButton: string;
    /** Display name of the implicit "no filter" tag (stored as `ALL`). */
    tagAll: string;
    tagAllTitle: string;
    /** `{0}` is the tag name. */
    tagFilterTitle: string;
    /**
     * Header-layout button: the collapsed label (`{0}` = the current mode's
     * name), the tooltip (`{0}` = current mode, `{1}` = what one click gives),
     * and the three mode names.
     */
    headerModeButton: string;
    headerModeTitle: string;
    headerModes: { auto: string; full: string; compact: string };
    /** Day-card section titles. */
    sections: { scheduled: string; allday: string; overdue: string };
    /** Tasks-card priority group titles. */
    groups: { a: string; b: string; c: string; none: string };
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
    historyBack: 'Back ({0})',
    historyForward: 'Forward ({0})',
    todayBadge: 'TODAY',
    openDayView: 'Open this day in Day view',
    tagCaption: 'File tag',
    tagButton: 'Tag: {0}',
    tagAll: 'ALL',
    tagAllTitle: 'Show tasks from every file',
    tagFilterTitle: 'Filter to files tagged {0}',
    headerModeButton: 'Header: {0}',
    headerModeTitle: 'Agenda header: {0} (click for {1})',
    headerModes: { auto: 'Auto', full: 'Full', compact: 'Compact' },
    sections: { scheduled: 'Scheduled today', allday: 'All-day & upcoming', overdue: 'Overdue' },
    groups: { a: 'Priority A', b: 'Priority B', c: 'Priority C', none: 'No priority' },
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
        priorityLowest: 'Priority {0} (lowest)'
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
    historyBack: 'Назад ({0})',
    historyForward: 'Вперёд ({0})',
    todayBadge: 'СЕГОДНЯ',
    openDayView: 'Открыть этот день в режиме дня',
    tagCaption: 'Метка файла',
    tagButton: 'Метка: {0}',
    tagAll: 'ВСЕ',
    tagAllTitle: 'Показывать задачи из всех файлов',
    tagFilterTitle: 'Только файлы с меткой {0}',
    headerModeButton: 'Шапка: {0}',
    headerModeTitle: 'Шапка агенды: {0} (нажмите, чтобы включить «{1}»)',
    headerModes: { auto: 'Авто', full: 'Полная', compact: 'Компактная' },
    sections: {
        scheduled: 'Запланировано на сегодня',
        allday: 'Без времени и предстоящие',
        overdue: 'Просрочено'
    },
    groups: { a: 'Приоритет A', b: 'Приоритет B', c: 'Приоритет C', none: 'Без приоритета' },
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
        priorityLowest: 'Приоритет {0} (низший)'
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
