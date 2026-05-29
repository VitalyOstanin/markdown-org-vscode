import type { AgendaData, DayAgenda, Task, TaskStatus, TaskWithOffset } from '../types';

/**
 * Приводит произвольное значение к `TaskStatus | undefined`.
 *
 * Используется при разборе JSON-вывода extract: гарантирует, что unknown
 * variants (например, новые keyword'ы, добавленные в будущих версиях
 * extractor) не приводят к падению — они нормализуются к `undefined`
 * («статус отсутствует»). Это закрепляет обязательство consumer-side
 * graceful handling из ADR-0015 extract.
 */
export function normalizeTaskType(raw: string | undefined): TaskStatus | undefined {
    if (raw === 'TODO' || raw === 'DONE' || raw === 'CANCELLED' || raw === 'CANCELED') {
        return raw;
    }
    return undefined;
}

/** True for either cancelled spelling (`CANCELLED` / `CANCELED`). Centralises the
 *  two-spelling check so call sites never hard-code one form. */
export function isCancelled(status: string | undefined): boolean {
    return status === 'CANCELLED' || status === 'CANCELED';
}

/**
 * Нормализует `task_type` у одной задачи через `normalizeTaskType`, не мутируя
 * исходный объект (возвращает поверхностную копию с переписанным полем).
 */
function normalizeTask<T extends Task>(task: T): T {
    return { ...task, task_type: normalizeTaskType(task.task_type as string | undefined) };
}

/**
 * Применяет `normalizeTaskType` ко всем задачам в `AgendaData` (как к плоскому
 * списку `Task[]`, так и к вложенным bucket'ам `DayAgenda[]`).
 *
 * Вызывается ровно на границе разбора JSON-вывода extract (см.
 * `src/commands/agenda.ts`), чтобы типизированный контракт `Task.task_type`
 * соблюдался для всего downstream-кода, а неизвестные будущие keyword'ы
 * деградировали к `undefined`, а не пробрасывались как произвольные строки.
 */
export function normalizeAgendaTaskTypes(data: AgendaData): AgendaData {
    // Дискриминатор по форме первого элемента: `DayAgenda` всегда несёт `date`,
    // плоский `Task` — нет. Пустой массив идёт по ветке `Task[]`; это безопасно,
    // т.к. для обоих режимов (`--agenda` без дней и `--tasks` без задач) результат
    // отображения пустого списка — снова `[]`, наблюдаемо идентично.
    if (data.length > 0 && 'date' in data[0]) {
        return (data as DayAgenda[]).map((day) => ({
            ...day,
            overdue: (day.overdue ?? []).map<TaskWithOffset>(normalizeTask),
            scheduled_timed: (day.scheduled_timed ?? []).map<TaskWithOffset>(normalizeTask),
            scheduled_no_time: (day.scheduled_no_time ?? []).map<TaskWithOffset>(normalizeTask),
            upcoming: (day.upcoming ?? []).map<TaskWithOffset>(normalizeTask)
        }));
    }
    return (data as Task[]).map(normalizeTask);
}
