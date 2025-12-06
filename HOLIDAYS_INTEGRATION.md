# Интеграция праздников из markdown-org-extract

## Обзор

Month view в markdown-org-vscode теперь получает данные о праздниках из `markdown-org-extract` вместо хардкода.

## Изменения в markdown-org-extract

### Новый CLI аргумент

```bash
markdown-org-extract --holidays <YEAR>
```

Возвращает JSON массив с датами праздников для указанного года:

```json
[
  "2025-01-01",
  "2025-01-02",
  ...
  "2025-11-04"
]
```

### Доступные годы

- 2025: 14 праздничных дней
- 2026: 15 праздничных дней (включая переносы)

### Реализация

- `src/holidays.rs`: добавлен метод `get_holidays_for_year(year: i32) -> Vec<NaiveDate>`
- `src/cli.rs`: добавлен параметр `--holidays: Option<i32>`
- `src/main.rs`: обработка аргумента с ранним возвратом

## Изменения в markdown-org-vscode

### Получение праздников

`src/commands/agenda.ts`:
```typescript
const getHolidays = async (year: number): Promise<string[]> => {
    try {
        const result = await execCommand(extractorPath, ['--holidays', year.toString()]);
        return JSON.parse(result);
    } catch {
        return [];
    }
};
```

### Передача в AgendaPanel

```typescript
const year = currentDate ? parseInt(currentDate.split('-')[0]) : new Date().getFullYear();
const holidays = await getHolidays(year);
AgendaPanel.render(context, data, mode, currentDate, loadData, userInitiated, currentTag, holidays);
```

### Использование в WebView

`src/views/agendaPanel.ts`:
```javascript
const holidays = ${JSON.stringify(holidays)};

function isHoliday(date) {
    return holidays.includes(date);
}
```

## Тестирование

### Unit тесты

`src/test/monthView.test.ts` использует моки:

```typescript
const mockHolidays2025 = [
    '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', 
    '2025-01-05', '2025-01-06', '2025-01-07', '2025-01-08',
    '2025-02-23',
    '2025-03-08',
    '2025-05-01', '2025-05-09',
    '2025-06-12',
    '2025-11-04'
];
```

Моки соответствуют данным из markdown-org-extract для изоляции тестов.

## Преимущества

1. **Единый источник данных**: праздники хранятся в одном месте (markdown-org-extract)
2. **Легкое обновление**: достаточно обновить `holidays_ru.json` в markdown-org-extract
3. **Расширяемость**: можно добавить поддержку других стран/регионов
4. **Согласованность**: workdays и calendar используют одни данные

## Обновление данных о праздниках

1. Отредактировать `holidays_ru.json` в markdown-org-extract
2. Пересобрать: `cargo build --release`
3. Переустановить: `cargo install --path .`
4. VS Code extension автоматически получит новые данные

## Fallback

Если `markdown-org-extract --holidays` не работает, возвращается пустой массив `[]`, 
и календарь отображается без выделения праздников.
