export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export const COUNTRIES = [
  { code: 'NL', name: 'Netherlands' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'FI', name: 'Finland' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IL', name: 'Israel' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'RO', name: 'Romania' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'CA', name: 'Canada' },
] as const;

export type CountryCode = typeof COUNTRIES[number]['code'];

// Easter calculation (Anonymous Gregorian algorithm)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function getHolidaysForCountry(code: string, year: number): PublicHoliday[] {
  const easter = getEasterDate(year);
  const goodFriday = addDaysToDate(easter, -2);
  const easterMonday = addDaysToDate(easter, 1);
  const ascension = addDaysToDate(easter, 39);
  const whitMonday = addDaysToDate(easter, 50);

  switch (code) {
    case 'NL':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-04-27`, name: "King's Day" },
        { date: `${year}-05-05`, name: 'Liberation Day' },
        { date: fmt(ascension), name: 'Ascension Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Christmas Day' },
      ];
    case 'US':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: getNthWeekday(year, 0, 1, 3), name: 'MLK Day' },
        { date: getNthWeekday(year, 1, 1, 3), name: "Presidents' Day" },
        { date: getLastWeekday(year, 4, 1), name: 'Memorial Day' },
        { date: `${year}-06-19`, name: 'Juneteenth' },
        { date: `${year}-07-04`, name: 'Independence Day' },
        { date: getNthWeekday(year, 8, 1, 1), name: 'Labor Day' },
        { date: getNthWeekday(year, 10, 4, 4), name: 'Thanksgiving' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    case 'DE':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: fmt(ascension), name: 'Ascension Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-10-03`, name: 'German Unity Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: "St. Stephen's Day" },
      ];
    case 'GB':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: getNthWeekday(year, 4, 1, 1), name: 'Early May Bank Holiday' },
        { date: getLastWeekday(year, 4, 1), name: 'Spring Bank Holiday' },
        { date: getLastWeekday(year, 7, 1), name: 'Summer Bank Holiday' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Boxing Day' },
      ];
    case 'FR':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-05-08`, name: 'Victory in Europe Day' },
        { date: fmt(ascension), name: 'Ascension Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-07-14`, name: 'Bastille Day' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-11-11`, name: 'Armistice Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    case 'IL':
      return [
        { date: `${year}-04-13`, name: 'Passover (1st day)' },
        { date: `${year}-04-19`, name: 'Passover (7th day)' },
        { date: `${year}-05-01`, name: 'Independence Day' },
        { date: `${year}-06-02`, name: 'Shavuot' },
        { date: `${year}-09-23`, name: 'Rosh Hashana' },
        { date: `${year}-09-24`, name: 'Rosh Hashana (2nd day)' },
        { date: `${year}-10-02`, name: 'Yom Kippur' },
        { date: `${year}-10-07`, name: 'Sukkot' },
        { date: `${year}-10-14`, name: 'Simchat Torah' },
      ];
    case 'ES':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-06`, name: 'Epiphany' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-10-12`, name: 'National Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-12-06`, name: 'Constitution Day' },
        { date: `${year}-12-08`, name: 'Immaculate Conception' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    case 'IT':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-06`, name: 'Epiphany' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-04-25`, name: 'Liberation Day' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-06-02`, name: 'Republic Day' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-12-08`, name: 'Immaculate Conception' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: "St. Stephen's Day" },
      ];
    case 'PL':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-06`, name: 'Epiphany' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-05-03`, name: 'Constitution Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-11-11`, name: 'Independence Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Christmas Day' },
      ];
    case 'BR':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(addDaysToDate(easter, -47)), name: 'Carnival' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: `${year}-04-21`, name: 'Tiradentes Day' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-09-07`, name: 'Independence Day' },
        { date: `${year}-10-12`, name: 'Our Lady Aparecida' },
        { date: `${year}-11-02`, name: "All Souls' Day" },
        { date: `${year}-11-15`, name: 'Republic Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    case 'IN':
      return [
        { date: `${year}-01-26`, name: 'Republic Day' },
        { date: `${year}-03-14`, name: 'Holi' },
        { date: `${year}-04-14`, name: 'Ambedkar Jayanti' },
        { date: `${year}-05-01`, name: 'May Day' },
        { date: `${year}-08-15`, name: 'Independence Day' },
        { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
        { date: `${year}-10-20`, name: 'Diwali' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    case 'AU':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-26`, name: 'Australia Day' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-04-25`, name: 'Anzac Day' },
        { date: getNthWeekday(year, 5, 1, 2), name: "Queen's Birthday" },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Boxing Day' },
      ];
    case 'JP':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-13`, name: 'Coming of Age Day' },
        { date: `${year}-02-11`, name: 'National Foundation Day' },
        { date: `${year}-02-23`, name: "Emperor's Birthday" },
        { date: `${year}-03-20`, name: 'Vernal Equinox Day' },
        { date: `${year}-04-29`, name: 'Showa Day' },
        { date: `${year}-05-03`, name: 'Constitution Memorial Day' },
        { date: `${year}-05-04`, name: 'Greenery Day' },
        { date: `${year}-05-05`, name: "Children's Day" },
        { date: `${year}-07-21`, name: 'Marine Day' },
        { date: `${year}-09-15`, name: 'Respect for the Aged Day' },
        { date: `${year}-09-23`, name: 'Autumnal Equinox Day' },
        { date: `${year}-11-03`, name: 'Culture Day' },
        { date: `${year}-11-23`, name: 'Labour Thanksgiving Day' },
      ];
    case 'CA':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: getNthWeekday(year, 1, 1, 3), name: 'Family Day' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: `${year}-07-01`, name: 'Canada Day' },
        { date: getNthWeekday(year, 8, 1, 1), name: 'Labour Day' },
        { date: getNthWeekday(year, 9, 1, 2), name: 'Thanksgiving' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Boxing Day' },
      ];
    case 'FI':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-06`, name: 'Epiphany' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'May Day' },
        { date: fmt(ascension), name: 'Ascension Day' },
        { date: getNthWeekday(year, 5, 6, 3), name: 'Midsummer Eve' },
        { date: `${year}-12-06`, name: 'Independence Day' },
        { date: `${year}-12-24`, name: 'Christmas Eve' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: "St. Stephen's Day" },
      ];
    case 'GR':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-06`, name: 'Epiphany' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-03-25`, name: 'Independence Day' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-10-28`, name: 'Ohi Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Day of Christmas' },
      ];
    case 'HU':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-03-15`, name: 'National Day' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-08-20`, name: "St. Stephen's Day" },
        { date: `${year}-10-23`, name: 'Republic Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Day of Christmas' },
      ];
    case 'RO':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: `${year}-01-02`, name: "Day After New Year" },
        { date: `${year}-01-24`, name: 'Union Day' },
        { date: fmt(easterMonday), name: 'Easter Monday' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-06-01`, name: "Children's Day" },
        { date: fmt(whitMonday), name: 'Whit Monday' },
        { date: `${year}-08-15`, name: 'Assumption Day' },
        { date: `${year}-11-30`, name: "St. Andrew's Day" },
        { date: `${year}-12-01`, name: 'National Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-26`, name: 'Second Day of Christmas' },
      ];
    case 'PH':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: `${year}-04-09`, name: 'Araw ng Kagitingan' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-06-12`, name: 'Independence Day' },
        { date: `${year}-08-21`, name: 'Ninoy Aquino Day' },
        { date: getNthWeekday(year, 7, 1, 4), name: 'National Heroes Day' },
        { date: `${year}-11-01`, name: "All Saints' Day" },
        { date: `${year}-11-30`, name: 'Bonifacio Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
        { date: `${year}-12-30`, name: 'Rizal Day' },
      ];
    case 'VE':
      return [
        { date: `${year}-01-01`, name: "New Year's Day" },
        { date: fmt(addDaysToDate(easter, -48)), name: 'Carnival Monday' },
        { date: fmt(addDaysToDate(easter, -47)), name: 'Carnival Tuesday' },
        { date: fmt(goodFriday), name: 'Good Friday' },
        { date: `${year}-04-19`, name: 'Declaration of Independence' },
        { date: `${year}-05-01`, name: 'Labour Day' },
        { date: `${year}-06-24`, name: 'Battle of Carabobo' },
        { date: `${year}-07-05`, name: 'Independence Day' },
        { date: `${year}-07-24`, name: 'Bolivar Day' },
        { date: `${year}-10-12`, name: 'Indigenous Resistance Day' },
        { date: `${year}-12-25`, name: 'Christmas Day' },
      ];
    default:
      return [];
  }
}

// Get the Nth weekday of a month (e.g., 3rd Monday of January)
// weekday: 0=Sun, 1=Mon, ..., 6=Sat
function getNthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(year, month, 1);
  let day = 1 + ((weekday - first.getDay() + 7) % 7);
  day += (n - 1) * 7;
  return fmt(new Date(year, month, day));
}

// Get the last weekday of a month
function getLastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(year, month + 1, 0);
  let day = last.getDate() - ((last.getDay() - weekday + 7) % 7);
  return fmt(new Date(year, month, day));
}

// Cache for performance
const cache = new Map<string, PublicHoliday[]>();

export function getHolidays(country: string, year: number): PublicHoliday[] {
  const key = `${country}-${year}`;
  if (cache.has(key)) return cache.get(key)!;
  const holidays = getHolidaysForCountry(country, year);
  cache.set(key, holidays);
  return holidays;
}

export function getHolidaysForDate(country: string, date: string): PublicHoliday[] {
  const year = parseInt(date.slice(0, 4));
  return getHolidays(country, year).filter(h => h.date === date);
}

export function isPublicHoliday(country: string, date: string): boolean {
  return getHolidaysForDate(country, date).length > 0;
}

export function getCountryName(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.name || code;
}
