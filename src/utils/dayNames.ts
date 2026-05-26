/**
 * Localized weekday names, indexed by `Date.getDay()` (0 = Sunday .. 6 =
 * Saturday). Kept in their own vscode-free module so pure helpers
 * (`incrementTimestamp`, `getWeekdayName`) can import them without dragging in
 * the vscode-dependent `src/utils.ts`. `src/utils.ts` re-exports these names,
 * so existing `import { DAY_NAMES_* } from '../utils'` call sites are unchanged.
 */
export const DAY_NAMES_SHORT_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const DAY_NAMES_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const DAY_NAMES_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
