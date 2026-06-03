export type Role = 'admin' | 'team-lead' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  country?: string;
  timezone?: string;
  enabledHolidayCountries?: string[]; // admin only: which countries' holidays to show on calendar
  ptoAllowance?: number; // annual paid days off
  sickDaysAllowance?: number; // annual sick days (default 7)
  holidaysDeductPto?: boolean; // whether religious/public holidays count against PTO (default true)
  label?: string; // deprecated, kept for backwards compat
  labels?: string[]; // multiple labels from predefined list
  slackWebhookUrl?: string;
  slackNotifications?: Record<string, boolean>;
  active?: boolean; // default true
}

export interface Shift {
  id: string;
  name: string;
  date: string; // ISO date string YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
  assignedAgentIds: string[];
  recurring: 'none' | 'daily' | 'weekly' | 'forever-daily' | 'forever-weekly' | 'weekdays' | 'weekends' | 'weekend-rotation';
  recurringGroupId?: string;
  requiredAgents: number;
  color: string;
  notes?: string;
}

export type TimeOffCategory = 'personal' | 'sick' | 'vacation' | 'family' | 'religious' | 'other';

export const TIME_OFF_CATEGORIES: { value: TimeOffCategory; label: string; color: string }[] = [
  { value: 'vacation', label: 'Vacation', color: 'text-blue-700 bg-blue-50' },
  { value: 'sick', label: 'Sick Day', color: 'text-red-700 bg-red-50' },
  { value: 'personal', label: 'Personal', color: 'text-purple-700 bg-purple-50' },
  { value: 'family', label: 'Family / Emergency', color: 'text-amber-700 bg-amber-50' },
  { value: 'religious', label: 'Religious / Public Holiday', color: 'text-teal-700 bg-teal-50' },
  { value: 'other', label: 'Other', color: 'text-gray-700 bg-gray-100' },
];

export type TimeOffStatus = 'pending' | 'approved' | 'rejected';

export interface TimeOff {
  id: string;
  userId: string;
  date: string; // ISO date string YYYY-MM-DD
  reason?: string;
  category?: TimeOffCategory;
  status?: TimeOffStatus; // default 'approved' for backwards compat
  halfDay?: boolean; // true = half day (counts as 0.5)
  createdAt?: string; // ISO timestamp of when the request was submitted
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'assignment' | 'change' | 'info' | 'swap-request';
  swapRequestId?: string;
}

export interface SwapRequest {
  id: string;
  fromShiftId: string;
  toShiftId: string;
  fromAgentId: string;
  toAgentId: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: string;
}

export interface ClockRecord {
  id: string;
  shiftId: string;
  userId: string;
  clockIn: string | null;  // ISO timestamp
  clockOut: string | null; // ISO timestamp
}

export type ViewMode = 'month' | 'week' | 'day';
