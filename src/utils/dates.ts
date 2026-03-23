import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addMonths,
  eachDayOfInterval,
  format,
  addWeeks,
  addDays,
  parseISO,
  isValid,
  isSameMonth,
} from 'date-fns';

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatDisplayDate(date: Date): string {
  return format(date, 'EEE, MMM d');
}

export function formatShortDay(date: Date): string {
  return format(date, 'EEE');
}

export function formatDayNum(date: Date): string {
  return format(date, 'd');
}

export function formatWeekRange(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export function getMonthCalendarDays(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export { addWeeks, addDays, addMonths, parseISO, isValid, format, isSameMonth };
