/**
 * "3 files" / "3 файла" / "٣ files": a count and the noun that agrees with it.
 *
 * One place for both halves of the rule the panel already follows: the form
 * comes from the interface language, and the digits from the date locale. The
 * two used to be split -- the page ran its numbers through `formatNumber` while
 * the host wrote them as typed -- so pressing "Commit ٣" was answered with
 * "Committed 3 files", one action reported in two numbering systems.
 *
 * The locale is a parameter rather than a settings read so this stays testable
 * without a host; `currentDateLocale` (hostLocale.ts) is what the commands pass.
 */
import { pluralIndex } from './agendaI18n';
import type { UiLanguage } from './agendaI18n';
import { formatNumber } from './formatNumber';

export function countedNoun(n: number, forms: readonly string[], uiLang: UiLanguage, locale: string): string {
    return `${formatNumber(n, locale)} ${forms[pluralIndex(n, uiLang)] ?? ''}`.trim();
}
