export type Role = 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  country?: string;
  timezone?: string;
  enabledHolidayCountries?: string[]; // admin only: which countries' holidays to show on calendar
}

export interface Shift {
  id: string;
  name: string;
  date: string; // ISO date string YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
  assignedAgentIds: string[];
  recurring: 'none' | 'daily' | 'weekly' | 'forever-daily' | 'forever-weekly' | 'weekdays' | 'weekends';
  recurringGroupId?: string;
  requiredAgents: number;
  color: string;
}

export interface TimeOff {
  id: string;
  userId: string;
  date: string; // ISO date string YYYY-MM-DD
  reason?: string;
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
