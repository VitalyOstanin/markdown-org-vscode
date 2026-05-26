import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';

/**
 * Command-contribution contract (#21): each command declares its palette
 * grouping via the `category` field rather than baking a `"Markdown Org: "`
 * prefix into every `title`. VS Code renders the palette entry as
 * `<category>: <title>`, so the visible label is unchanged while the prefix
 * stops being duplicated 19 times. This is a static manifest invariant, so it
 * lives as a pure unit test (no vscode host needed).
 */
interface CommandContribution {
    command: string;
    title?: string;
    category?: string;
}

function loadCommands(): CommandContribution[] {
    // out/test/unit -> out/test -> out -> <root>/package.json
    const file = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        contributes?: { commands?: CommandContribution[] };
    };
    return pkg.contributes?.commands ?? [];
}

suite('Commands: package.json category contract (#21)', () => {
    const commands = loadCommands();

    test('there are contributed commands to check', () => {
        assert.ok(commands.length > 0, 'expected contributes.commands to be non-empty');
    });

    test('every command sets category "Markdown Org"', () => {
        const offenders = commands
            .filter((cmd) => cmd.category !== 'Markdown Org')
            .map((cmd) => `${cmd.command}: category=${JSON.stringify(cmd.category)}`);
        assert.strictEqual(
            offenders.length,
            0,
            `every command must group under category "Markdown Org":\n${offenders.join('\n')}`
        );
    });

    test('no title still carries the inline "Markdown Org:" prefix', () => {
        const offenders = commands
            .filter((cmd) => cmd.title?.startsWith('Markdown Org:'))
            .map((cmd) => `${cmd.command}: ${cmd.title}`);
        assert.strictEqual(
            offenders.length,
            0,
            `category replaces the title prefix; these titles still duplicate it:\n${offenders.join('\n')}`
        );
    });

    test('every command still has a non-empty title (the action verb)', () => {
        const offenders = commands.filter((cmd) => !cmd.title || cmd.title.trim() === '').map((cmd) => cmd.command);
        assert.strictEqual(offenders.length, 0, `commands missing a title:\n${offenders.join('\n')}`);
    });
});
