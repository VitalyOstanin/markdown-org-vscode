# Markdown Org -- правила проекта

## Extractor и навигация по задачам

`markdown-org-extract` -- это инструмент широкого поиска: он сканирует
произвольные файлы и сводит задачи в единую agenda. Семантика расширения --
показать всё, что нашёл extractor, и позволить перейти к найденному.

Из этого следует:

- Не добавлять проверок вида `isPathInsideWorkspace` на пути, полученные
  от extractor (handler `openTask` в `src/views/agendaPanel.ts`). Если
  extractor вернул файл -- его обязательно надо суметь открыть, даже если
  он лежит вне `vscode.workspace.workspaceFolders` (симлинки, отдельный
  `markdown-org.workspaceDir`, агрегация из нескольких каталогов).
- Проверка `isPathInsideWorkspace` остаётся уместной для пользовательских
  настроек, валидируемых до записи (`markdown-org.maintainFilePath` в
  `src/commands/moveHeading.ts`) -- это другой сценарий, там нужна защита
  от случайной записи в системные пути.
