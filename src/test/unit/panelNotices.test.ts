import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * Every action started from the agenda panel answers in the panel's language
 * (ADR-0019), so no module behind such an action may spell a notice out.
 *
 * This used to be read off one file by name -- `groupActions.ts`, the module
 * that had the defect. The rule is about a class: the panel has since grown a
 * quick-pick that starts the occurrence commands, and those were written with
 * English literals beside a Russian panel without anything failing. So the
 * modules are found rather than listed: what the panel imports from
 * `src/commands/`, plus what it runs by command id, resolved through the
 * registration in `extension.ts`.
 *
 * Read off the sources rather than driven: these modules import `vscode`, and
 * what has to hold is not what a run produces but that the wording is not
 * written here at all.
 */
suite('the notices of an action started from the panel', () => {
    const src = path.resolve(__dirname, '..', '..', '..', 'src');
    const panel = fs.readFileSync(path.join(src, 'views', 'agendaPanel.ts'), 'utf8');
    const extension = fs.readFileSync(path.join(src, 'extension.ts'), 'utf8');
    /**
     * The manifest is what makes an identifier a command: the panel also names
     * `markdown-org.*` keys for `setContext`, and those run nothing.
     */
    const declaredCommands = new Set(
        (
            JSON.parse(fs.readFileSync(path.join(src, '..', 'package.json'), 'utf8')) as {
                contributes: { commands: { command: string }[] };
            }
        ).contributes.commands.map((entry) => entry.command)
    );

    /**
     * Commands the panel runs that only redraw it, and whose failures are
     * therefore diagnostics of the panel itself. ADR-0019 leaves those in
     * English: they report that the agenda could not be built, not the outcome
     * of something the reader asked for.
     */
    const REDRAWS_ONLY = new Set([
        'markdown-org.showAgendaDay',
        'markdown-org.setTag',
        'markdown-org.cycleAgendaHeaderMode'
    ]);

    /** The modules the panel calls into directly. */
    function importedCommandModules(): string[] {
        return [...panel.matchAll(/from '\.\.\/commands\/([A-Za-z]+)';/g)]
            .map((match) => `commands/${match[1]}.ts`)
            .sort();
    }

    /** The module that implements a command, through its registration. */
    function moduleOfCommand(command: string): string | null {
        const registration = new RegExp(
            `registerOrgCommand\\([^,]+,\\s*'${command.replaceAll('.', String.raw`\.`)}',[\\s\\S]*?=>\\s*([A-Za-z]+)\\(`
        ).exec(extension);
        const handler = registration?.[1];
        if (handler === undefined) {
            return null;
        }
        const imported = new RegExp(`import\\s*\\{[^}]*\\b${handler}\\b[^}]*\\}\\s*from\\s*'\\.\\/([^']+)';`).exec(
            extension
        );
        return imported?.[1] === undefined ? null : `${imported[1]}.ts`;
    }

    /** Every module an action of the panel ends up in. */
    function modulesBehindPanelActions(): string[] {
        const byCommand = [...panel.matchAll(/'(markdown-org\.[A-Za-z]+)'/g)]
            .map((match) => match[1] ?? '')
            .filter((command) => declaredCommands.has(command))
            .filter((command) => !REDRAWS_ONLY.has(command))
            .map((command) => {
                const module = moduleOfCommand(command);
                assert.ok(
                    module !== null,
                    `${command} is started from the panel and registered nowhere this test can follow: ` +
                        'name it in REDRAWS_ONLY if it only redraws, or keep its registration readable'
                );
                return module;
            });
        return [...new Set([...importedCommandModules(), ...byCommand])].sort();
    }

    test('the panel reaches more than one module, and each is checked', () => {
        // Guards the finding itself: the rule was held by naming a single file,
        // and a second module reached the panel without being covered.
        const modules = modulesBehindPanelActions();
        assert.ok(
            modules.length >= 3,
            `only ${modules.length} module(s) found behind the panel: ${modules.join(', ')}`
        );
        assert.ok(modules.includes('commands/occurrence.ts'), 'the occurrence commands are no longer among them');
    });

    test('no notice behind a panel action is spelled out where it is raised', () => {
        const spelledOut: string[] = [];
        for (const module of modulesBehindPanelActions()) {
            const source = fs.readFileSync(path.join(src, module), 'utf8');
            for (const match of source.matchAll(
                /(?:notify(?:Error|Status|Info|Warn)|show(?:Information|Warning|Error)Message)\(\s*[`'"]/g
            )) {
                spelledOut.push(`${module}: ${match[0].trim()}`);
            }
        }
        assert.deepEqual(spelledOut, [], 'a notice written in place instead of read from the dictionary (ADR-0019)');
    });

    test('the failure of a group action is announced through the dictionary', () => {
        const source = fs.readFileSync(path.join(src, 'commands', 'groupActions.ts'), 'utf8');
        assert.ok(
            source.includes('strings.group.failed'),
            'the write failure does not read its wording from the strings'
        );
    });
});
