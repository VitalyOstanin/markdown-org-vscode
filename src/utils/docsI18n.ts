import type { UiLanguage } from './agendaI18n';

/**
 * What the help panel says in its own chrome.
 *
 * The pages themselves are markdown files, one directory per language; this is
 * the handful of words around them -- the tab title, the search box and what
 * the hits are called. They follow `markdown-org.uiLanguage`, as the agenda's
 * own strings do, rather than the editor's display language.
 */
export interface DocsStrings {
    title: string;
    contents: string;
    searchPlaceholder: string;
    hitsTitle: string;
    noHits: string;
}

export const DOCS_STRINGS: Record<UiLanguage, DocsStrings> = {
    en: {
        title: 'Markdown Org: Help',
        contents: 'Contents',
        searchPlaceholder: 'Search the help',
        hitsTitle: 'Found',
        noHits: 'Nothing in the help says that.'
    },
    ru: {
        title: 'Markdown Org: справка',
        contents: 'Содержание',
        searchPlaceholder: 'Поиск по справке',
        hitsTitle: 'Найдено',
        noHits: 'В справке об этом ничего нет.'
    }
};
