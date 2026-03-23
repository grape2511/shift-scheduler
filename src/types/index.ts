export type Role = 'admin' | 'agent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  country?: string;
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

export type ViewMode = 'month' | 'week' | 'day';
