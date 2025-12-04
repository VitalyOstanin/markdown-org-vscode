# Markdown Org

VS Code extension for org-style task management in Markdown files.

## Сборка проекта

### Требования

- Node.js 18+
- npm
- VS Code

### Установка зависимостей

```bash
npm install
```

### Компиляция

```bash
npm run compile
```

Или в режиме watch для автоматической перекомпиляции:

```bash
npm run watch
```

## Разработка и отладка

### Запуск в режиме разработки

1. Открыть проект в VS Code
2. Нажать `F5` или `Run > Start Debugging`
3. Откроется новое окно VS Code с установленным расширением
4. Открыть любой `.md` файл и протестировать команды

### Отладка

- Точки останова работают в файлах `.ts` в папке `src/`
- Консоль отладки показывает вывод `console.log()`
- После изменений в коде нажать `Ctrl+Shift+F5` для перезапуска

### Структура проекта

```
src/
├── extension.ts           # Точка входа, регистрация команд
├── commands/
│   ├── taskStatus.ts      # TODO/DONE команды
│   └── agenda.ts          # Agenda/Tasks команды
└── views/
    └── agendaPanel.ts     # WebView для отображения
```

## Установка в VS Code

### Из исходников

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension markdown-org-0.0.1.vsix
```

### Для разработки

Создать симлинк в каталог расширений VS Code:

```bash
ln -s $(pwd) ~/.vscode/extensions/markdown-org
```

## Использование

### Команды

**Статусы задач:**
- `Markdown Org: Set TODO` - Пометить заголовок как TODO
- `Markdown Org: Set DONE` - Пометить заголовок как DONE
- `Markdown Org: Toggle Priority` - Переключить приоритет (нет → A → нет)

**Временные метки:**
- `Markdown Org: Insert CREATED Timestamp` - Вставить метку создания
- `Markdown Org: Insert SCHEDULED Timestamp` - Вставить метку планирования
- `Markdown Org: Insert DEADLINE Timestamp` - Вставить метку дедлайна
- `Markdown Org: Timestamp Up` - Увеличить дату/время под курсором
- `Markdown Org: Timestamp Down` - Уменьшить дату/время под курсором

**Просмотр задач:**
- `Markdown Org: Show Agenda (Day)` - Задачи на сегодня
- `Markdown Org: Show Agenda (Week)` - Задачи на неделю
- `Markdown Org: Show Tasks` - Все TODO задачи по приоритетам

### Горячие клавиши

**Статусы задач:**
- `Ctrl+K Ctrl+T` - Set TODO
- `Ctrl+K Ctrl+D` - Set DONE
- `Ctrl+K Ctrl+P` - Toggle Priority (нет → A → нет)

**Временные метки:**
- `Ctrl+K Ctrl+K Ctrl+C` - Insert CREATED timestamp
- `Ctrl+K Ctrl+K Ctrl+S` - Insert SCHEDULED timestamp
- `Ctrl+K Ctrl+K Ctrl+D` - Insert DEADLINE timestamp
- `Shift+Up` - Timestamp Up (увеличить дату/время)
- `Shift+Down` - Timestamp Down (уменьшить дату/время)

**Просмотр задач:**
- `Ctrl+K Ctrl+W` - Show Agenda (Week)

### Настройки

- `markdown-org.extractorPath` - Путь к markdown-extract (по умолчанию: `/home/vyt/devel/markdown-extract/target/release/markdown-extract`)
- `markdown-org.workspaceDir` - Каталог для сканирования (по умолчанию: корень workspace)

## Зависимости

Расширение использует внешнюю утилиту [markdown-extract](https://github.com/user/markdown-extract) для извлечения задач из markdown файлов.

Убедитесь, что утилита собрана и путь к ней указан в настройках.
