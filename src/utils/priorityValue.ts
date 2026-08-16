/**
 * What counts as a priority, and how a value typed by hand is read.
 *
 * The accepted set mirrors markdown-org-extract's `Priority::parse`: a single
 * uppercase letter `A`..`Z`, or a decimal `0`..`64`. Anything else is text as
 * far as both projects are concerned, so the picker refuses it here rather
 * than writing a cookie the agenda would not show.
 */

/** Numeric priorities mirror org-mode's `[#0]..[#64]` range. */
export const PRIORITY_NUMERIC_MIN = 0;
export const PRIORITY_NUMERIC_MAX = 64;

/** Letters offered by the picker before it falls back to free input. */
export const PRIORITY_LETTERS: readonly string[] = ['A', 'B', 'C'];

/**
 * `input` as a priority value, or `undefined` when it is not one.
 *
 * Surrounding blanks and a `[#...]` wrapping are accepted -- someone reading
 * the cookie off a heading types what they see -- as is a lowercase letter.
 * A number keeps no leading zero: `[#01]` is text to the extractor, so
 * returning `01` here would write a cookie that shows up nowhere.
 */
export function parsePriorityValue(input: string): string | undefined {
    const bare = input.trim().replace(/^\[#/, '').replace(/\]$/, '').trim();
    if (bare === '') {
        return undefined;
    }

    if (/^[A-Za-z]$/.test(bare)) {
        return bare.toUpperCase();
    }

    if (!/^\d{1,2}$/.test(bare)) {
        return undefined;
    }
    const value = Number(bare);
    if (value < PRIORITY_NUMERIC_MIN || value > PRIORITY_NUMERIC_MAX) {
        return undefined;
    }
    return String(value);
}
