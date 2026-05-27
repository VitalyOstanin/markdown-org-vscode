// Shared Google Calendar API resource shapes used by the calendar client and sync engine.

export interface GcalEventDateTime {
    date?: string; // all-day: YYYY-MM-DD
    dateTime?: string; // timed: local RFC3339 without offset (paired with timeZone)
    timeZone?: string;
}

export interface GcalEventResource {
    id?: string;
    summary: string;
    description?: string;
    start: GcalEventDateTime;
    end: GcalEventDateTime;
    extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarSummary {
    id: string;
    summary: string;
    accessRole: string;
}
