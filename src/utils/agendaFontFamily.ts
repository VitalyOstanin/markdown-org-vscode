/** Longest accepted value; a real font stack is far shorter. */
const MAX_FONT_STACK_LENGTH = 200;

/**
 * Characters a font stack legitimately needs: letters (any script), digits,
 * space, and the punctuation CSS uses to write family names and lists --
 * quotes, comma, hyphen, underscore, dot. Everything else (`;`, braces,
 * parentheses, `/`, `*`, `:`, `@`, backslash, angle brackets, control
 * characters) belongs to CSS syntax rather than to a family name.
 */
const FONT_STACK_PATTERN = /^[\p{L}\p{N} '",._-]+$/u;

/**
 * Validate `markdown-org.agendaFontFamily` before it is interpolated into the
 * agenda's nonce'd `<style>` block as the value of a custom property.
 *
 * The setting is plain user input and, unlike the executable paths this
 * extension guards behind workspace trust, it still applies in an untrusted
 * workspace -- a `.vscode/settings.json` shipped with a repository could
 * otherwise close the declaration and append rules of its own.
 *
 * Returns the trimmed value when it looks like a font stack, and `''`
 * otherwise; `''` also covers "not set", so the caller falls back to the
 * built-in default in both cases.
 */
export function sanitizeFontFamily(value: string | undefined | null): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed.length > MAX_FONT_STACK_LENGTH) {
        return '';
    }
    return FONT_STACK_PATTERN.test(trimmed) ? trimmed : '';
}

/**
 * Font stack used when the setting is empty or rejected.
 *
 * Matches the design-companion mockup, which renders in Adwaita Sans: its
 * `-apple-system, 'Segoe UI', system-ui, sans-serif` stack resolves via
 * fontconfig to Adwaita Sans for Latin *and* Cyrillic. Naming the face
 * explicitly is what makes it identical to the mockup and sidesteps the old
 * Electron fallback that picked a serif for Cyrillic when only generic
 * families were given. Falls back to Noto Sans / system-ui / sans-serif where
 * Adwaita Sans is absent.
 */
export const DEFAULT_AGENDA_FONT_STACK = "'Adwaita Sans', 'Noto Sans', system-ui, sans-serif";
