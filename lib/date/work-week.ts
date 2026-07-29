export type WorkWeekRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
  startIso: string;
  endIso: string;
};

const WORK_WEEK_START_DAY = 4;
const WORK_WEEK_START_HOUR = 15;
const WORK_WEEK_START_MINUTE = 0;

export function formatDateYYYYMMDD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${formatDateYYYYMMDD(date)}T${hours}:${minutes}:${seconds}`;
}

export function parseLocalDateTime(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

export function formatDateDDMMYYYY(date: Date | string) {
  const value = typeof date === "string" ? parseLocalDateTime(date) : date;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

export function formatDateTimeDDMMYYYYHHMM(date: Date | string) {
  const value = typeof date === "string" ? parseLocalDateTime(date) : date;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

export function formatWorkWeekDateRange(start: Date | string, end: Date | string) {
  return `${formatDateDDMMYYYY(start).slice(0, 5)} — ${formatDateDDMMYYYY(end).slice(0, 5)}`;
}

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function atStartOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function atEndOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function rangeFromStart(start: Date): WorkWeekRange {
  const end = addDays(start, 7);
  return {
    start,
    end,
    startDate: formatDateYYYYMMDD(start),
    endDate: formatDateYYYYMMDD(end),
    startDateTime: formatLocalDateTime(start),
    endDateTime: formatLocalDateTime(end),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function getWorkWeekRange(date = new Date()): WorkWeekRange {
  const start = new Date(date);
  start.setHours(WORK_WEEK_START_HOUR, WORK_WEEK_START_MINUTE, 0, 0);
  const daysSinceThursday = (start.getDay() - WORK_WEEK_START_DAY + 7) % 7;
  start.setDate(start.getDate() - daysSinceThursday);
  if (date < start) start.setDate(start.getDate() - 7);
  return rangeFromStart(start);
}

export function getWorkWeekForDate(date = new Date()) {
  return getWorkWeekRange(date);
}

export function getCurrentWorkWeek(now = new Date()) {
  return getWorkWeekRange(now);
}

export function normalizeWorkWeekStart(date = new Date()) {
  return getWorkWeekRange(date).start;
}

export function getPreviousWorkWeekRange(date = new Date()): WorkWeekRange {
  const current = getWorkWeekRange(date);
  return rangeFromStart(addDays(current.start, -7));
}

export function getNextWorkWeekRange(date = new Date()): WorkWeekRange {
  const current = getWorkWeekRange(date);
  return rangeFromStart(new Date(current.end));
}

export function getWorkWeekLabel(start: Date | string, end: Date | string) {
  return `${formatDateTimeDDMMYYYYHHMM(start)} — ${formatDateTimeDDMMYYYYHHMM(end)}`;
}

export function buildInclusiveDateTimeRange(from: string, to: string) {
  return {
    from: `${from}T00:00:00`,
    to: `${to}T23:59:59.999`,
  };
}

export function buildExclusiveDateTimeRange(from: string, to: string) {
  return {
    from: `${from}T00:00:00`,
    to: `${to}T00:00:00`,
  };
}
