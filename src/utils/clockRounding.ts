// Treat anything that isn't a finite positive number in (0, 60] as "no
// rounding". Defends against negative / NaN / oversized values that VS
// Code schema bounds (minimum/maximum in package.json) catch in the
// settings UI but not when users hand-edit settings.json.
export function isRoundingEnabled(roundMinutes: number | undefined): roundMinutes is number {
    return typeof roundMinutes === 'number' && Number.isFinite(roundMinutes) && roundMinutes > 0 && roundMinutes <= 60;
}

export function roundTime(date: Date, roundMinutes: number | undefined): Date {
    if (!isRoundingEnabled(roundMinutes)) {
        return date;
    }

    const result = new Date(date);
    const minutes = result.getMinutes();
    const rounded = Math.floor(minutes / roundMinutes) * roundMinutes;
    result.setMinutes(rounded);
    result.setSeconds(0);
    result.setMilliseconds(0);

    return result;
}

export function roundEndTime(startDate: Date, endDate: Date, roundMinutes: number | undefined): Date {
    if (!isRoundingEnabled(roundMinutes)) {
        return endDate;
    }

    const result = new Date(endDate);
    const minutes = result.getMinutes();
    const rounded = Math.ceil(minutes / roundMinutes) * roundMinutes;
    result.setMinutes(rounded);
    result.setSeconds(0);
    result.setMilliseconds(0);

    if (result <= startDate) {
        result.setMinutes(result.getMinutes() + roundMinutes);
    }

    return result;
}
