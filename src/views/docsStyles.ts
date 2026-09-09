/**
 * The help panel's stylesheet.
 *
 * Everything is expressed in the editor's own theme variables, so the page
 * follows a theme change without being rebuilt, and the layout is the one a
 * documentation page wants: contents that stay put on the left, text of a
 * readable measure on the right.
 */
export const DOCS_STYLES = `
    :root {
        --docs-gap: 24px;
    }
    body {
        margin: 0;
        display: flex;
        align-items: flex-start;
        gap: var(--docs-gap);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        line-height: 1.5;
    }
    #contents {
        position: sticky;
        top: 0;
        max-height: 100vh;
        overflow-y: auto;
        flex: 0 0 260px;
        padding: 16px 8px 24px 16px;
        border-right: 1px solid var(--vscode-panel-border, transparent);
        box-sizing: border-box;
    }
    #contents h2 {
        font-size: 1em;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.7;
        margin: 16px 0 8px;
    }
    #contents ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    #contents li.section {
        margin-bottom: 8px;
    }
    #contents li.section > a {
        font-weight: 600;
    }
    #contents ul ul {
        padding-left: 12px;
    }
    #contents ul ul a {
        opacity: 0.85;
        font-size: 0.95em;
    }
    a,
    a.jump {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
        cursor: pointer;
    }
    a:hover {
        text-decoration: underline;
    }
    #search {
        width: 100%;
        box-sizing: border-box;
        padding: 4px 6px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 2px;
        font-family: inherit;
        font-size: inherit;
    }
    #hits {
        margin-top: 12px;
        border-bottom: 1px solid var(--vscode-panel-border, transparent);
        padding-bottom: 12px;
    }
    #hits li {
        margin-bottom: 8px;
    }
    .hit-line {
        opacity: 0.75;
        font-size: 0.9em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    main {
        flex: 1 1 auto;
        max-width: 62em;
        padding: 16px 24px 64px 0;
        min-width: 0;
    }
    section + section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid var(--vscode-panel-border, transparent);
    }
    h1 {
        font-size: 1.6em;
        margin: 0 0 12px;
    }
    h2 {
        font-size: 1.2em;
        margin: 24px 0 8px;
    }
    h3 {
        font-size: 1.05em;
        margin: 16px 0 8px;
    }
    p,
    ul,
    ol {
        margin: 8px 0;
    }
    code {
        font-family: var(--vscode-editor-font-family);
        font-size: 0.92em;
        background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.18));
        border-radius: 3px;
        padding: 0 3px;
    }
    pre {
        background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12));
        border-radius: 4px;
        padding: 10px 12px;
        overflow-x: auto;
    }
    pre code {
        background: none;
        padding: 0;
    }
    /* A table of settings is wide; it scrolls inside its own box rather than
       pushing the page sideways. */
    table {
        display: block;
        overflow-x: auto;
        border-collapse: collapse;
        margin: 12px 0;
        max-width: 100%;
    }
    th,
    td {
        border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
        padding: 4px 8px;
        text-align: left;
        vertical-align: top;
    }
    th {
        background: var(--vscode-editorWidget-background, rgba(127, 127, 127, 0.12));
    }
`;
