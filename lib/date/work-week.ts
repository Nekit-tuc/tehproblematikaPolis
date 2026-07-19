export type WorkWeekRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
};

export function formatDateYYYYMMDD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateDDMMYYYY(date: Date | string) {
  const value = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
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
  };
}

export function getWorkWeekRange(date = new Date()): WorkWeekRange {
  const start = atStartOfDay(date);
  const daysSinceSaturday = (start.getDay() + 1) % 7;
  start.setDate(start.getDate() - daysSinceSaturday);
  return rangeFromStart(start);
}

export function getPreviousWorkWeekRange(date = new Date()): WorkWeekRange {
  const current = getWorkWeekRange(date);
  return rangeFromStart(addDays(current.start, -7));
}

export function getNextWorkWeekRange(date = new Date()): WorkWeekRange {
  const current = getWorkWeekRange(date);
  return rangeFromStart(new Date(current.end));
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
