import * as vscode from 'vscode';
import type { FileTag } from '../types';
import type { MergedTag } from './tagDictionary';
import { mergeTagDictionaries } from './tagDictionary';
import { readTagDeclarations } from './tagSources';
import { resolveAgendaDirectories } from './agendaDirectories';
import { logDiagnostic } from './logChannel';

/**
 * The tag dictionary as the current configuration describes it.
 *
 * Read afresh rather than cached. The files are small and few -- one per notes
 * directory -- and a cache would have to be invalidated by a file the extension
 * does not otherwise watch, by a settings change, and by a sync pulling a new
 * dictionary in. A tag list that lags behind the notes is worse than a read.
 */
export async function currentTagDictionary(): Promise<MergedTag[]> {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const directories = resolveAgendaDirectories(
        config.get<string[]>('workspaceDirs'),
        config.get<string>('workspaceDir'),
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    );
    return mergeTagDictionaries(
        await readTagDeclarations(directories, config.get<FileTag[]>('fileTags', []), logDiagnostic)
    );
}
