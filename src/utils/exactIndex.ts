/**
 * Element `index` of `values`, or an error naming what was looked up.
 *
 * For lookups an invariant next to the call already bounds -- a weekday 0..6
 * into a seven-entry table, a status into the list the status came from --
 * where `noUncheckedIndexedAccess` types the read as possibly absent and a
 * fallback value would quietly stand in for a table that lost an entry.
 */
export function at<T>(values: readonly T[], index: number, what = 'element'): T {
    const value = values[index];
    if (value === undefined) {
        throw new Error(`no ${what} at index ${index} of ${values.length}`);
    }
    return value;
}
