/**
 * Pure-TS bracket-policy analyser. No `vscode` dependency so unit tests can
 * exercise it; the vscode-aware adapter that turns these results into
 * `vscode.Diagnostic` / `vscode.CodeAction` lives in `./timestampBrackets.ts`.
 */

type Policy = 'active' | 'inactive';

const KEYWORD_POLICY: Record<string, Policy> = {
    SCHEDULED: 'active',
    DEADLINE: 'active',
    CLOSED: 'inactive',
    CREATED: 'inactive'
};

// Lenient: accepts any bracket pair (including mixed) for any keyword.
// The strict TIMESTAMP_LINE_REGEX in src/orgPatterns.ts is the dual --
// it rejects the same lines this regex finds violations on.
const LENIENT_LINE_REGEX =
    /^(?<indent>\s*)`(?<type>SCHEDULED|DEADLINE|CLOSED|CREATED): (?<open>[<[])(?<inner>[^>\]]+)(?<close>[>\]])`$/;

export interface BracketViolation {
    /** Zero-based line number in the document. */
    line: number;
    /** Inclusive start column of the timestamp's opening bracket. */
    startCharacter: number;
    /** Exclusive end column (one past the closing bracket). */
    endCharacter: number;
    /** Diagnostic kind: a policy mismatch or a mixed pair. */
    kind: 'policy-mismatch' | 'mixed-pair';
    /** Keyword the line uses (SCHEDULED / DEADLINE / CLOSED / CREATED). */
    keyword: string;
    /** Required policy by ADR-0014. */
    requiredPolicy: Policy;
    /** Canonical opening bracket for the required policy. */
    requiredOpen: '<' | '[';
    /** Canonical closing bracket for the required policy. */
    requiredClose: '>' | ']';
    /** Actual opening bracket on the offending line. */
    actualOpen: string;
    /** Actual closing bracket on the offending line. */
    actualClose: string;
    /** Inner content between the brackets (date + weekday + time, untouched). */
    inner: string;
    /** Human-readable diagnostic message. */
    message: string;
}

/**
 * Analyse a sequence of lines and return every bracket-policy violation.
 * Inline timestamps and non-keyword lines are ignored -- inline `<...>`
 * and `[...]` are both allowed by ADR-0014.
 */
export function validateLines(lines: string[]): BracketViolation[] {
    const violations: BracketViolation[] = [];
    for (let line = 0; line < lines.length; line++) {
        const violation = validateLine(lines[line], line);
        if (violation) {
            violations.push(violation);
        }
    }
    return violations;
}

function validateLine(text: string, line: number): BracketViolation | null {
    const m = text.match(LENIENT_LINE_REGEX);
    if (!m?.groups) return null;

    const keyword = m.groups.type;
    const open = m.groups.open;
    const close = m.groups.close;
    const inner = m.groups.inner;

    const requiredPolicy = KEYWORD_POLICY[keyword];
    if (!requiredPolicy) return null;

    const requiredOpen: '<' | '[' = requiredPolicy === 'active' ? '<' : '[';
    const requiredClose: '>' | ']' = requiredPolicy === 'active' ? '>' : ']';

    const isPaired = (open === '<' && close === '>') || (open === '[' && close === ']');
    const matchesPolicy = open === requiredOpen && close === requiredClose;
    if (isPaired && matchesPolicy) {
        return null;
    }

    const startCharacter = text.indexOf(open);
    const endCharacter = startCharacter + 1 + inner.length + 1;
    const kind: BracketViolation['kind'] = isPaired ? 'policy-mismatch' : 'mixed-pair';

    const message = !isPaired
        ? `Mixed bracket pair "${open}...${close}". ${keyword} requires ${requiredOpen}...${requiredClose} (ADR-0014).`
        : `${keyword} requires ${requiredPolicy} bracket form "${requiredOpen}...${requiredClose}" (ADR-0014).`;

    return {
        line,
        startCharacter,
        endCharacter,
        kind,
        keyword,
        requiredPolicy,
        requiredOpen,
        requiredClose,
        actualOpen: open,
        actualClose: close,
        inner,
        message
    };
}
