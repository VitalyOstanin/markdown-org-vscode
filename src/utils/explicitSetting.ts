/**
 * The value a user actually set for a configuration key, as opposed to the
 * value `get()` reports.
 *
 * `get()` folds the package.json default into its answer, so a setting nobody
 * touched is indistinguishable from one explicitly set to that default. That
 * distinction matters for `markdown-org.dateLocale`: it declares a default of
 * `en-US`, and `uiLanguage: auto` consults it before falling back to the editor
 * display language. Reading it through `get()` meant the first step always
 * matched, the editor-language step was dead, and a Russian VS Code with
 * untouched settings still showed an English agenda -- the opposite of what the
 * setting's own description promises.
 *
 * Takes the result of `WorkspaceConfiguration.inspect` (kept as a structural
 * type so this stays unit-testable without the vscode module) and returns the
 * most specific value the user set, or `undefined` when they set none.
 */
export interface InspectedSetting<T> {
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

export function explicitSettingValue<T>(inspected: InspectedSetting<T> | undefined): T | undefined {
    if (!inspected) {
        return undefined;
    }
    // Most specific scope first, matching how VS Code resolves the effective
    // value.
    if (inspected.workspaceFolderValue !== undefined) {
        return inspected.workspaceFolderValue;
    }
    if (inspected.workspaceValue !== undefined) {
        return inspected.workspaceValue;
    }
    return inspected.globalValue;
}
