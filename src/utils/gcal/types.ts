// Shared Google Calendar API resource shapes used by the calendar client and sync engine.

export interface GcalEventDateTime {
    date?: string; // all-day: YYYY-MM-DD
    dateTime?: string; // timed: local RFC3339 without offset (paired with timeZone)
    timeZone?: string;
}

export interface GcalEventResource {
    id?: string;
    // 'confirmed' is sent explicitly so that re-publishing a task whose event
    // was soft-deleted (DELETE leaves it status='cancelled' and keeps the id)
    // revives it: the insert 409s, then the patch sets status back to confirmed.
    status?: 'confirmed' | 'tentative' | 'cancelled';
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
