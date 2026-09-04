import * as vscode from 'vscode';
import { DAY_NAMES_SHORT_EN, DAY_NAMES_SHORT_RU } from '../utils/dayNames';
import { findNearestHeading, getWeekdayLocale, requireActiveEditor, toIsoDate } from '../utils';
import { applyEditOrReport } from '../utils/applyEdit';
import { buildExecError } from '../utils/execError';
import { EXTRACTOR_MAX_BUFFER_BYTES, EXTRACTOR_TIMEOUT_MS, extractor } from '../utils/extractor';
import { exec } from '../utils/exec';
import { formatError } from '../utils/formatError';
import { formatString } from '../utils/agendaI18n';
import { isMicrophoneMuted } from '../utils/microphone';
import { notifyError, notifyInfo, notifyWarn } from '../utils/notify';
import { placeNewEntry } from '../utils/entryPlacement';
import { documentLines, endOfLine, planPhraseInsert } from '../utils/phraseInsert';
import type { PhraseEditField, PhraseEditRefusal } from '../utils/phraseEdit';
import { planPhraseEdit } from '../utils/phraseEdit';
import type { PhraseEntryOptions, PhraseFields } from '../utils/phraseEntry';
import { describePhraseFields, parsePhraseFields, phraseEntryLines } from '../utils/phraseEntry';
import { HEADING_REGEX } from '../orgPatterns';
import { currentUiStrings } from '../utils/uiStrings';

/**
 * Writing a task by saying it.
 *
 * The nine things a task is made of are known at once by whoever is adding it,
 * and typing them out is nine edits: a heading, a keyword, a priority cookie,
 * a planning line with a date, an hour and a repeater inside a timestamp. One
 * sentence names them all, and the rules that read it live in the extractor —
 * beside the grammar of the timestamps they produce, so the editor and the
 * phone understand a phrase the same way.
 *
 * Every phrase said so far is handed over on each call rather than the fields
 * they produced: the extractor is what folds a phrase into what the earlier
 * ones left, and a second implementation of that folding here would sooner or
 * later disagree with it about which field a phrase named.
 */

/** Both grammars, whatever language the editor speaks; see `phrasePrompt`. */
const PHRASE_LOCALES = 'ru,en';

/** `parse-phrase` against the phrases said so far. */
function runParsePhrase(command: string, phrases: readonly string[], today: string): Promise<PhraseFields> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Command timeout after ${EXTRACTOR_TIMEOUT_MS / 1000} seconds`));
        }, EXTRACTOR_TIMEOUT_MS);

        exec.execFile(
            command,
            ['parse-phrase', '--locale', PHRASE_LOCALES, '--current-date', today, ...phrases],
            { encoding: 'utf-8', maxBuffer: EXTRACTOR_MAX_BUFFER_BYTES },
            (error, stdout, stderr) => {
                clearTimeout(timeout);
                if (error) {
                    reject(buildExecError(error, stderr, 'Unknown error'));
                } else {
                    try {
                        resolve(parsePhraseFields(stdout));
                    } catch (parseError) {
                        reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
                    }
                }
            }
        );
    });
}

/**
 * Ask for a task in words and write it into the note the cursor stands in.
 *
 * The box reopens after every phrase with what has been understood in its
 * title, which is what stands in for the phone's form: the fields are seen
 * before they are written, so a sentence read wrong is corrected by saying
 * more rather than by editing the file afterwards. Enter on an empty box
 * writes; Escape leaves the file untouched.
 */
export async function insertTaskFromPhrase() {
    const { strings } = currentUiStrings();
    const prompts = strings.phrasePrompt;

    // The phrase is read by the extractor, which is a binary this command
    // runs; an untrusted workspace is where the extension runs no binary at
    // all (README, "Workspace Trust").
    if (!vscode.workspace.isTrusted) {
        notifyWarn(prompts.untrusted);
        return;
    }

    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        // `requireActiveEditor` reports "no editor" itself, but says nothing
        // when the open file is not markdown -- which for this command is the
        // likelier mistake and the one worth naming.
        if (vscode.window.activeTextEditor) {
            notifyError(prompts.noEditor);
        }
        return;
    }

    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        return;
    }

    const weekdays = getWeekdayLocale() === 'en' ? DAY_NAMES_SHORT_EN : DAY_NAMES_SHORT_RU;
    const headingLine = await findNearestHeading(editor);
    const document = editor.document;
    // Read once for the title of the box, which shows the entry as it would
    // be written; where it actually lands is worked out again after the box
    // closes, against the document as it stands then.
    const placement = placeNewEntry(documentLines(document.getText()), headingLine, editor.selection.active.line);
    // Fixed once, when the command opens: a chain of phrases read against a
    // day that changed halfway through -- over midnight, or with the box left
    // open -- would answer "tomorrow" with two different days. The mark under
    // the heading carries this same moment, to the minute.
    const opened = new Date();
    const options: PhraseEntryOptions = {
        hashes: placement.hashes,
        indent: placement.indent,
        weekdays,
        written: opened
    };
    const today = toIsoDate(opened);

    const phrases: string[] = [];
    let fields: PhraseFields | undefined;

    for (;;) {
        // Asked again before every box rather than once: the phrase is meant
        // to be spoken, a muted input hears nothing while looking as though it
        // listens, and someone who unmutes after the first reminder should not
        // keep reading it.
        const base = fields ? prompts.promptMore : prompts.prompt;
        const muted = await isMicrophoneMuted();
        const said = await vscode.window.showInputBox({
            title: fields ? describePhraseFields(fields, options) : prompts.title,
            prompt: muted ? formatString(prompts.muted, base) : base,
            placeHolder: fields ? prompts.placeholderMore : prompts.placeholder
        });
        if (said === undefined) {
            return;
        }
        if (said.trim() === '') {
            break;
        }
        phrases.push(said);
        try {
            fields = await runParsePhrase(extractorPath, phrases, today);
        } catch (error) {
            notifyError(formatString(prompts.failed, formatError(error)));
            // The phrase that could not be read is dropped rather than kept in
            // the chain: every later call would hand it over again and fail
            // the same way, and the box would have nothing left to do.
            phrases.pop();
        }
    }

    if (!fields || fields.heading.trim() === '') {
        // A chain that named a date and nothing else is a timestamp with no
        // task on it. Refused rather than written as an empty heading, which
        // the agenda would then show as a nameless row.
        notifyInfo(prompts.empty);
        return;
    }

    // The file may have moved while the box was open -- another edit, a save
    // that reformatted it, the cursor carried elsewhere -- so the placement is
    // worked out again rather than taken from the snapshot above. The entry
    // itself is built from the level and the indent of where it now lands.
    const currentHeading = await findNearestHeading(editor);
    const plan = planPhraseInsert({
        text: editor.document.getText(),
        headingLine: currentHeading,
        cursorLine: editor.selection.active.line,
        entry: ({ hashes, indent }) => phraseEntryLines(fields, { ...options, hashes, indent })
    });
    const written = await applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.insert(new vscode.Position(plan.line, 0), plan.text);
        },
        'the task'
    );
    if (written) {
        notifyInfo(formatString(prompts.written, fields.heading));
    }
}

/**
 * Change the entry the cursor stands in by saying what to change.
 *
 * The same rules and the same box as writing one, aimed at an entry that
 * exists: "перенеси на пятницу в 16:00 и сделай срочной" is one sentence
 * against three commands and two dialogs of choice. The entry is the one every
 * other editing command works on — the deepest heading the cursor stands in.
 *
 * One phrase rather than a chain: the edit is written straight away, and what
 * takes it back is the editor's own undo rather than a second phrase.
 */
export async function editTaskFromPhrase() {
    const { strings } = currentUiStrings();
    const prompts = strings.phraseEditPrompt;

    // Same gate as writing one: the phrase reaches the entry through the
    // extractor, and untrusted workspaces run no binary.
    if (!vscode.workspace.isTrusted) {
        notifyWarn(prompts.untrusted);
        return;
    }

    const editor = requireActiveEditor({ markdownOnly: true });
    if (!editor) {
        // `requireActiveEditor` reports "no editor" itself, but says nothing
        // when the open file is not markdown -- which for this command is the
        // likelier mistake and the one worth naming.
        if (vscode.window.activeTextEditor) {
            notifyError(prompts.noEditor);
        }
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        notifyError(prompts.noHeading);
        return;
    }

    const extractorPath = await extractor.resolveExtractorPath();
    if (!extractorPath) {
        return;
    }

    const shown = documentLines(editor.document.getText());
    const muted = await isMicrophoneMuted();
    const said = await vscode.window.showInputBox({
        title: formatString(prompts.title, (shown[headingLine] ?? '').trim()),
        prompt: muted ? formatString(prompts.muted, prompts.prompt) : prompts.prompt,
        placeHolder: prompts.placeholder
    });
    if (said === undefined || said.trim() === '') {
        return;
    }

    let fields: PhraseFields;
    try {
        fields = await runParsePhrase(extractorPath, [said], toIsoDate(new Date()));
    } catch (error) {
        notifyError(formatString(prompts.failed, formatError(error)));
        return;
    }

    // A word no rule knows would become part of the heading if this were a new
    // entry. Here there is no heading to put it in, and applying the half that
    // was understood would change a field the person did not mean to name.
    const leftover = fields.heading.trim();
    if (leftover !== '') {
        notifyError(formatString(prompts.leftover, leftover));
        return;
    }

    // Read again after the box: the entry the phrase is about is the one on
    // screen now, not the one snapshotted before the phrase was said and
    // before the extractor ran. The heading is located again for the same
    // reason -- an edit above it moves every line under it.
    const currentHeading = await findNearestHeading(editor);
    if (currentHeading === null) {
        notifyError(prompts.noHeading);
        return;
    }
    const text = editor.document.getText();
    const eol = endOfLine(text);
    const lines = documentLines(text);

    const weekdays = getWeekdayLocale() === 'en' ? DAY_NAMES_SHORT_EN : DAY_NAMES_SHORT_RU;
    const plan = planPhraseEdit({ lines, heading: currentHeading, fields, weekdays });
    if (plan.refusal) {
        notifyInfo(refusalMessage(plan.refusal, prompts));
        return;
    }
    if (plan.changed.length === 0) {
        notifyInfo(prompts.unchanged);
        return;
    }

    const section = sectionEnd(lines, currentHeading);
    // Only the entry's own lines are replaced: the rest of the file is
    // untouched, so an edit shows up in the diff as the entry it changed.
    const tail = lines.length - 1 - section;
    const rewritten = plan.lines.slice(currentHeading, plan.lines.length - tail).join(eol);
    const written = await applyEditOrReport(
        editor,
        (editBuilder) => {
            editBuilder.replace(
                new vscode.Range(
                    new vscode.Position(currentHeading, 0),
                    new vscode.Position(section, (lines[section] ?? '').length)
                ),
                rewritten
            );
        },
        'the entry'
    );
    if (written) {
        notifyInfo(formatString(prompts.changed, plan.changed.map((field) => nameOf(field, prompts)).join(', ')));
    }
}

/** The last line of the entry's own section: everything up to the next heading. */
function sectionEnd(lines: readonly string[], heading: number): number {
    for (let index = heading + 1; index < lines.length; index += 1) {
        if (HEADING_REGEX.test(lines[index] ?? '')) {
            return index - 1;
        }
    }
    return lines.length - 1;
}

type EditPrompts = ReturnType<typeof currentUiStrings>['strings']['phraseEditPrompt'];

function refusalMessage(refusal: PhraseEditRefusal, prompts: EditPrompts): string {
    switch (refusal) {
        case 'not-a-heading':
            return prompts.noHeading;
        case 'nothing-said':
            return prompts.nothingSaid;
        case 'no-date-to-put-it-on':
            return prompts.noDate;
    }
}

function nameOf(field: PhraseEditField, prompts: EditPrompts): string {
    return prompts.fields[field];
}
