/**
 * Decide which CSS class the heading-span of a task-line gets in the
 * agenda webview.
 *
 * Precedence (loudest wins):
 *   1. DEADLINE -- a missed deadline is the most important signal, so
 *      it overrides priority. Class: `deadline-heading`.
 *   2. Priority `[#A]` / `[#B]` / `[#C]` -- when there is no DEADLINE,
 *      the heading is tinted with the priority's hue (and bold weight,
 *      matching the marker exactly). Class: `heading-priority-{a|b|c}`.
 *   3. Otherwise -- no extra class, heading uses the default text color.
 *
 * The agenda webview embeds this function's source via `Function.prototype.toString()`,
 * so the unit tests in `agendaHeadingTint.test.ts` transitively cover
 * the runtime behaviour without spinning up an extension host.
 */
export interface HeadingTintInput {
    readonly priority?: string | null;
    readonly timestamp_type?: string | null;
}

export function resolveHeadingClass(task: HeadingTintInput): string {
    if (task.timestamp_type === 'DEADLINE') {
        return 'deadline-heading';
    }
    if (task.priority) {
        return 'heading-priority-' + task.priority.toLowerCase();
    }
    return '';
}
