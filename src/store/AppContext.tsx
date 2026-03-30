import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import type { User, Shift, TimeOff, Notification, SwapRequest, ClockRecord } from '../types';
import { AGENT_COLORS, getNextColor } from '../utils/colors';
import { addDays, addWeeks, formatDate } from '../utils/dates';
import { getHolidaysForDate as getPublicHolidays, type PublicHoliday } from '../utils/holidays';
import * as db from '../lib/database';
import { sendSlackNotification } from '../utils/slack';

interface AppState {
  currentUser: User;
  users: User[];
  shifts: Shift[];
  timeOffs: TimeOff[];
  notifications: Notification[];
  swapRequests: SwapRequest[];
  clockRecords: ClockRecord[];
}

type Action =
  | { type: 'SET_CURRENT_USER'; payload: User }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: { id: string; updates: Partial<User> } }
  | { type: 'REMOVE_USER'; payload: string }
  | { type: 'ADD_SHIFT'; payload: Shift }
  | { type: 'UPDATE_SHIFT'; payload: Shift }
  | { type: 'DELETE_SHIFT'; payload: string }
  | { type: 'DELETE_SHIFT_ALL_RECURRING'; payload: string }
  | { type: 'DELETE_SHIFT_FUTURE'; payload: { shiftId: string; fromDate: string } }
  | { type: 'DELETE_SHIFT_PAST'; payload: { shiftId: string; toDate: string } }
  | { type: 'ASSIGN_AGENT'; payload: { shiftId: string; agentId: string } }
  | { type: 'UNASSIGN_AGENT'; payload: { shiftId: string; agentId: string } }
  | { type: 'ADD_TIME_OFF'; payload: TimeOff }
  | { type: 'REMOVE_TIME_OFF'; payload: string }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'DUPLICATE_WEEK'; payload: { sourceWeekStart: string; targetWeekStart: string } }
  | { type: 'CREATE_SWAP_REQUEST'; payload: SwapRequest }
  | { type: 'ACCEPT_SWAP_REQUEST'; payload: string }
  | { type: 'DECLINE_SWAP_REQUEST'; payload: string }
  | { type: 'ADD_WEEKEND_ROTATION'; payload: { shift: Shift; rotationAgents: string[] } }
  | { type: 'UPDATE_SHIFT_ALL_RECURRING'; payload: Shift }
  | { type: 'UPDATE_SHIFT_FUTURE'; payload: Shift }
  | { type: 'CLOCK_IN'; payload: ClockRecord }
  | { type: 'CLOCK_OUT'; payload: { shiftId: string; userId: string; clockOut: string } }
  | { type: 'LOAD_STATE'; payload: AppState };

const defaultAdmin: User = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@team.com',
  role: 'admin',
  color: '#6366f1',
};

const defaultAgents: User[] = [
  { id: 'agent-1', name: 'Sarah Chen', email: 'sarah@team.com', role: 'agent', color: '#8b5cf6', country: 'US' },
  { id: 'agent-2', name: 'Alex Rivera', email: 'alex@team.com', role: 'agent', color: '#ec4899', country: 'NL' },
  { id: 'agent-3', name: 'Jordan Kim', email: 'jordan@team.com', role: 'agent', color: '#22c55e', country: 'GB' },
  { id: 'agent-4', name: 'Taylor Müller', email: 'taylor@team.com', role: 'agent', color: '#f97316', country: 'DE' },
];

const initialState: AppState = {
  currentUser: defaultAdmin,
  users: [defaultAdmin, ...defaultAgents],
  shifts: [],
  timeOffs: [],
  notifications: [],
  swapRequests: [],
  clockRecords: [],
};

function createNotification(userId: string, message: string, type: Notification['type']): Notification {
  return {
    id: uuid(),
    userId,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    type,
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload };

    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };

    case 'UPDATE_USER': {
      const updatedUsers = state.users.map(u =>
        u.id === action.payload.id ? { ...u, ...action.payload.updates } : u
      );
      const updatedCurrentUser = state.currentUser.id === action.payload.id
        ? { ...state.currentUser, ...action.payload.updates }
        : state.currentUser;
      return { ...state, users: updatedUsers, currentUser: updatedCurrentUser };
    }

    case 'REMOVE_USER':
      return {
        ...state,
        users: state.users.filter(u => u.id !== action.payload),
        shifts: state.shifts.map(s => ({
          ...s,
          assignedAgentIds: s.assignedAgentIds.filter(id => id !== action.payload),
        })),
      };

    case 'ADD_SHIFT': {
      const shift = action.payload;
      // Use noon to avoid DST midnight edge cases
      const baseDate = new Date(shift.date + 'T12:00:00');

      if (shift.recurring !== 'none') {
        const groupId = uuid();
        shift.recurringGroupId = groupId;

        if (shift.recurring === 'weekdays' || shift.recurring === 'weekends') {
          const isWeekdays = shift.recurring === 'weekdays';
          // Check if the start date itself matches the pattern
          const startDay = baseDate.getDay();
          const startIsWeekend = startDay === 0 || startDay === 6;
          const startMatches = isWeekdays ? !startIsWeekend : startIsWeekend;

          const newShifts: typeof shift[] = [];
          if (startMatches) {
            newShifts.push(shift);
          }

          // Generate for 52 weeks (364 days)
          for (let i = 1; i <= 364; i++) {
            const d = addDays(baseDate, i);
            const day = d.getDay();
            const isWeekend = day === 0 || day === 6;
            if (isWeekdays ? !isWeekend : isWeekend) {
              newShifts.push({
                ...shift,
                id: uuid(),
                date: formatDate(d),
                recurringGroupId: groupId,
              });
            }
          }

          const notifications: Notification[] = [];
          if (shift.assignedAgentIds.length > 0) {
            shift.assignedAgentIds.forEach(agentId => {
              notifications.push(createNotification(agentId, `You've been assigned to "${shift.name}" ${isWeekdays ? 'weekdays' : 'weekends'} starting ${shift.date}`, 'assignment'));
            });
          }
          return {
            ...state,
            shifts: [...state.shifts, ...newShifts],
            notifications: [...state.notifications, ...notifications],
          };
        }

        const isDaily = shift.recurring === 'daily' || shift.recurring === 'forever-daily';
        const isForever = shift.recurring === 'forever-daily' || shift.recurring === 'forever-weekly';
        const count = isForever ? (isDaily ? 364 : 51) : (isDaily ? 6 : 3);
        const newShifts = [shift];
        for (let i = 1; i <= count; i++) {
          const newDate = isDaily
            ? formatDate(addDays(baseDate, i))
            : formatDate(addWeeks(baseDate, i));
          newShifts.push({
            ...shift,
            id: uuid(),
            date: newDate,
            recurringGroupId: groupId,
          });
        }

        const notifications: Notification[] = [];
        if (shift.assignedAgentIds.length > 0) {
          shift.assignedAgentIds.forEach(agentId => {
            notifications.push(createNotification(agentId, `You've been assigned to "${shift.name}" starting ${shift.date}`, 'assignment'));
          });
        }
        return {
          ...state,
          shifts: [...state.shifts, ...newShifts],
          notifications: [...state.notifications, ...notifications],
        };
      }

      const newShifts = [shift];

      // Send notifications for pre-assigned agents
      const notifications: Notification[] = [];
      if (shift.assignedAgentIds.length > 0) {
        shift.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `You've been assigned to "${shift.name}" starting ${shift.date}`, 'assignment'));
        });
      }

      return {
        ...state,
        shifts: [...state.shifts, ...newShifts],
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'ADD_WEEKEND_ROTATION': {
      const { shift, rotationAgents } = action.payload;
      const groupId = uuid();
      const baseDate = new Date(shift.date + 'T12:00:00');
      const newShifts: Shift[] = [];
      const notifications: Notification[] = [];

      // Find the next Saturday from the start date
      let startSat = new Date(baseDate);
      while (startSat.getDay() !== 6) {
        startSat.setDate(startSat.getDate() + 1);
      }

      // Generate 26 weeks of alternating Sat/Sun shifts
      for (let week = 0; week < 26; week++) {
        const satDate = new Date(startSat);
        satDate.setDate(satDate.getDate() + week * 7);
        const sunDate = new Date(satDate);
        sunDate.setDate(sunDate.getDate() + 1);

        // Agents alternate: even-indexed agents get Sat on even weeks, Sun on odd weeks
        const satAgents = rotationAgents.filter((_, i) => (i + week) % 2 === 0);
        const sunAgents = rotationAgents.filter((_, i) => (i + week) % 2 === 1);

        // Saturday shift
        const satShift: Shift = {
          ...shift,
          id: uuid(),
          date: formatDate(satDate),
          assignedAgentIds: satAgents,
          recurringGroupId: groupId,
        };
        newShifts.push(satShift);

        // Sunday shift
        const sunShift: Shift = {
          ...shift,
          id: uuid(),
          date: formatDate(sunDate),
          assignedAgentIds: sunAgents,
          recurringGroupId: groupId,
        };
        newShifts.push(sunShift);
      }

      // Notify all rotation agents
      rotationAgents.forEach(agentId => {
        notifications.push(createNotification(
          agentId,
          `You've been added to weekend rotation for "${shift.name}" — alternating Sat/Sun for 26 weeks`,
          'assignment'
        ));
      });

      return {
        ...state,
        shifts: [...state.shifts, ...newShifts],
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'UPDATE_SHIFT': {
      const notifications: Notification[] = [];
      const oldShift = state.shifts.find(s => s.id === action.payload.id);
      if (oldShift) {
        oldShift.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `Shift "${action.payload.name}" on ${action.payload.date} has been updated`, 'change'));
        });
      }
      return {
        ...state,
        shifts: state.shifts.map(s => s.id === action.payload.id ? action.payload : s),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'UPDATE_SHIFT_ALL_RECURRING': {
      const updated = action.payload;
      const oldShift = state.shifts.find(s => s.id === updated.id);
      if (!oldShift?.recurringGroupId) return state;
      const groupId = oldShift.recurringGroupId;
      const notifications: Notification[] = [];
      const newShifts = state.shifts.map(s => {
        if (s.recurringGroupId !== groupId) return s;
        notifications.push(...s.assignedAgentIds.map(agentId =>
          createNotification(agentId, `Shift "${updated.name}" on ${s.date} has been updated`, 'change')
        ));
        return { ...s, name: updated.name, startTime: updated.startTime, endTime: updated.endTime, timezone: updated.timezone, color: updated.color, requiredAgents: updated.requiredAgents, assignedAgentIds: updated.assignedAgentIds };
      });
      return { ...state, shifts: newShifts, notifications: [...state.notifications, ...notifications] };
    }

    case 'UPDATE_SHIFT_FUTURE': {
      const updated = action.payload;
      const oldShift = state.shifts.find(s => s.id === updated.id);
      if (!oldShift?.recurringGroupId) return state;
      const groupId = oldShift.recurringGroupId;
      const fromDate = updated.date;
      const notifications: Notification[] = [];
      const newShifts = state.shifts.map(s => {
        if (s.recurringGroupId !== groupId || s.date < fromDate) return s;
        notifications.push(...s.assignedAgentIds.map(agentId =>
          createNotification(agentId, `Shift "${updated.name}" on ${s.date} has been updated`, 'change')
        ));
        return { ...s, name: updated.name, startTime: updated.startTime, endTime: updated.endTime, timezone: updated.timezone, color: updated.color, requiredAgents: updated.requiredAgents, assignedAgentIds: updated.assignedAgentIds };
      });
      return { ...state, shifts: newShifts, notifications: [...state.notifications, ...notifications] };
    }

    case 'DELETE_SHIFT': {
      const shift = state.shifts.find(s => s.id === action.payload);
      const notifications: Notification[] = [];
      if (shift) {
        shift.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `Shift "${shift.name}" on ${shift.date} has been cancelled`, 'change'));
        });
      }
      return {
        ...state,
        shifts: state.shifts.filter(s => s.id !== action.payload),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'DELETE_SHIFT_ALL_RECURRING': {
      const shift = state.shifts.find(s => s.id === action.payload);
      if (!shift?.recurringGroupId) return state;
      const groupId = shift.recurringGroupId;
      const toDelete = state.shifts.filter(s => s.recurringGroupId === groupId);
      const notifications: Notification[] = [];
      toDelete.forEach(s => {
        s.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `Shift "${s.name}" on ${s.date} has been cancelled`, 'change'));
        });
      });
      return {
        ...state,
        shifts: state.shifts.filter(s => s.recurringGroupId !== groupId),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'DELETE_SHIFT_FUTURE': {
      const shift = state.shifts.find(s => s.id === action.payload.shiftId);
      if (!shift?.recurringGroupId) return state;
      const groupId = shift.recurringGroupId;
      const fromDate = action.payload.fromDate;
      const toDelete = state.shifts.filter(s => s.recurringGroupId === groupId && s.date >= fromDate);
      const toDeleteIds = new Set(toDelete.map(s => s.id));
      const notifications: Notification[] = [];
      toDelete.forEach(s => {
        s.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `Shift "${s.name}" on ${s.date} has been cancelled`, 'change'));
        });
      });
      return {
        ...state,
        shifts: state.shifts.filter(s => !toDeleteIds.has(s.id)),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'DELETE_SHIFT_PAST': {
      const shift = state.shifts.find(s => s.id === action.payload.shiftId);
      if (!shift?.recurringGroupId) return state;
      const groupId = shift.recurringGroupId;
      const toDate = action.payload.toDate;
      const toDelete = state.shifts.filter(s => s.recurringGroupId === groupId && s.date <= toDate);
      const toDeleteIds = new Set(toDelete.map(s => s.id));
      const notifications: Notification[] = [];
      toDelete.forEach(s => {
        s.assignedAgentIds.forEach(agentId => {
          notifications.push(createNotification(agentId, `Shift "${s.name}" on ${s.date} has been cancelled`, 'change'));
        });
      });
      return {
        ...state,
        shifts: state.shifts.filter(s => !toDeleteIds.has(s.id)),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'ASSIGN_AGENT': {
      const { shiftId, agentId } = action.payload;
      const shift = state.shifts.find(s => s.id === shiftId);
      const notification = shift
        ? createNotification(agentId, `You've been assigned to "${shift.name}" on ${shift.date}`, 'assignment')
        : null;
      return {
        ...state,
        shifts: state.shifts.map(s =>
          s.id === shiftId && !s.assignedAgentIds.includes(agentId)
            ? { ...s, assignedAgentIds: [...s.assignedAgentIds, agentId] }
            : s
        ),
        notifications: notification ? [...state.notifications, notification] : state.notifications,
      };
    }

    case 'UNASSIGN_AGENT': {
      const { shiftId, agentId } = action.payload;
      return {
        ...state,
        shifts: state.shifts.map(s =>
          s.id === shiftId
            ? { ...s, assignedAgentIds: s.assignedAgentIds.filter(id => id !== agentId) }
            : s
        ),
      };
    }

    case 'ADD_TIME_OFF':
      return { ...state, timeOffs: [...state.timeOffs, action.payload] };

    case 'REMOVE_TIME_OFF':
      return { ...state, timeOffs: state.timeOffs.filter(t => t.id !== action.payload) };

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };

    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(n =>
          n.id === action.payload ? { ...n, read: true } : n
        ),
      };

    case 'MARK_ALL_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map(n =>
          n.userId === state.currentUser.id ? { ...n, read: true } : n
        ),
      };

    case 'DUPLICATE_WEEK': {
      const { sourceWeekStart, targetWeekStart } = action.payload;
      const sourceStart = new Date(sourceWeekStart);
      const targetStart = new Date(targetWeekStart);
      const diffMs = targetStart.getTime() - sourceStart.getTime();

      const sourceShifts = state.shifts.filter(s => {
        const shiftDate = new Date(s.date);
        const daysDiff = Math.floor((shiftDate.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff < 7;
      });

      const newShifts = sourceShifts.map(s => ({
        ...s,
        id: uuid(),
        date: formatDate(new Date(new Date(s.date).getTime() + diffMs)),
        recurringGroupId: undefined,
        recurring: 'none' as const,
      }));

      return { ...state, shifts: [...state.shifts, ...newShifts] };
    }

    case 'CREATE_SWAP_REQUEST': {
      const swap = action.payload;
      const fromShift = state.shifts.find(s => s.id === swap.fromShiftId);
      const toShift = state.shifts.find(s => s.id === swap.toShiftId);
      const fromAgent = state.users.find(u => u.id === swap.fromAgentId);
      const notification = fromShift && toShift && fromAgent
        ? {
            ...createNotification(
              swap.toAgentId,
              `${fromAgent.name} wants to swap: give you "${fromShift.name}" (${fromShift.date}) for your "${toShift.name}" (${toShift.date})${swap.reason ? ` — "${swap.reason}"` : ''}`,
              'swap-request'
            ),
            swapRequestId: swap.id,
          }
        : null;
      return {
        ...state,
        swapRequests: [...(state.swapRequests || []), swap],
        notifications: notification ? [...state.notifications, notification] : state.notifications,
      };
    }

    case 'ACCEPT_SWAP_REQUEST': {
      const swap = (state.swapRequests || []).find(r => r.id === action.payload);
      if (!swap) return state;
      const fromShift = state.shifts.find(s => s.id === swap.fromShiftId);
      const toShift = state.shifts.find(s => s.id === swap.toShiftId);
      const toAgent = state.users.find(u => u.id === swap.toAgentId);
      const notifications: Notification[] = [];
      if (fromShift && toShift && toAgent) {
        notifications.push(createNotification(
          swap.fromAgentId,
          `${toAgent.name} accepted your swap! You now have "${toShift.name}" (${toShift.date}) and they have "${fromShift.name}" (${fromShift.date})`,
          'assignment'
        ));
      }
      return {
        ...state,
        swapRequests: (state.swapRequests || []).map(r =>
          r.id === action.payload ? { ...r, status: 'accepted' as const } : r
        ),
        shifts: state.shifts.map(s => {
          if (s.id === swap.fromShiftId) {
            return {
              ...s,
              assignedAgentIds: s.assignedAgentIds
                .filter(id => id !== swap.fromAgentId)
                .concat(swap.toAgentId),
            };
          }
          if (s.id === swap.toShiftId) {
            return {
              ...s,
              assignedAgentIds: s.assignedAgentIds
                .filter(id => id !== swap.toAgentId)
                .concat(swap.fromAgentId),
            };
          }
          return s;
        }),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'DECLINE_SWAP_REQUEST': {
      const swap = (state.swapRequests || []).find(r => r.id === action.payload);
      if (!swap) return state;
      const fromShift = state.shifts.find(s => s.id === swap.fromShiftId);
      const toAgent = state.users.find(u => u.id === swap.toAgentId);
      const notifications: Notification[] = [];
      if (fromShift && toAgent) {
        notifications.push(createNotification(
          swap.fromAgentId,
          `${toAgent.name} declined your swap request for "${fromShift.name}" on ${fromShift.date}`,
          'change'
        ));
      }
      return {
        ...state,
        swapRequests: (state.swapRequests || []).map(r =>
          r.id === action.payload ? { ...r, status: 'declined' as const } : r
        ),
        notifications: [...state.notifications, ...notifications],
      };
    }

    case 'CLOCK_IN':
      return { ...state, clockRecords: [...state.clockRecords, action.payload] };

    case 'CLOCK_OUT':
      return {
        ...state,
        clockRecords: state.clockRecords.map(r =>
          r.shiftId === action.payload.shiftId && r.userId === action.payload.userId
            ? { ...r, clockOut: action.payload.clockOut }
            : r
        ),
      };

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  agents: User[];
  getAgentById: (id: string) => User | undefined;
  getShiftsForDate: (date: string) => Shift[];
  getShiftsForAgent: (agentId: string) => Shift[];
  getTimeOffsForDate: (date: string) => TimeOff[];
  getUnreadNotificationCount: () => number;
  getUserNotifications: () => Notification[];
  hasConflict: (agentId: string, date: string) => boolean;
  addAgent: (name: string, email: string, country?: string) => void;
  getPendingSwapRequests: () => SwapRequest[];
  getSwapRequestsForShift: (shiftId: string) => SwapRequest[];
  getPublicHolidaysForDate: (date: string) => { agent: User; holidays: PublicHoliday[] }[];
  getClockRecord: (shiftId: string, userId: string) => ClockRecord | undefined;
  getMonthlyHours: (agentId: string, year: number, month: number) => number;
  getEnabledHolidayCountries: () => string[];
  getPtoBalance: (agentId: string, year?: number) => { used: number; total: number; remaining: number; sickUsed: number; sickTotal: number; sickRemaining: number };
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children, currentUser }: { children: ReactNode; currentUser: User }) {
  const initState: AppState = { ...initialState, currentUser };
  const [state, dispatch] = useReducer(reducer, initState);
  const prevStateRef = useRef(state);

  // Load data from Supabase on mount
  const refreshData = useCallback(async () => {
    try {
      const [users, shifts, timeOffs, notifications, swapRequests, clockRecords] = await Promise.all([
        db.fetchAllProfiles(),
        db.fetchAllShifts(),
        db.fetchAllTimeOffs(),
        db.fetchNotifications(currentUser.id),
        db.fetchAllSwapRequests(),
        db.fetchAllClockRecords().catch(() => [] as ClockRecord[]),
      ]);
      // Use the freshly fetched profile for currentUser so admin settings persist
      const freshCurrentUser = users.find(u => u.id === currentUser.id) || currentUser;
      dispatch({
        type: 'LOAD_STATE',
        payload: { currentUser: freshCurrentUser, users, shifts, timeOffs, notifications, swapRequests, clockRecords },
      });
    } catch (e) {
      console.error('refreshData failed:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshData();
    // Refresh every 30s for multi-user sync
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Sync changes to Supabase
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev === state) return;

    // Sync shifts
    const newShifts = state.shifts.filter(s => !prev.shifts.some(ps => ps.id === s.id));
    const deletedShiftIds = prev.shifts.filter(s => !state.shifts.some(ns => ns.id === s.id)).map(s => s.id);
    const updatedShifts = state.shifts.filter(s => {
      const ps = prev.shifts.find(ps => ps.id === s.id);
      return ps && JSON.stringify(ps) !== JSON.stringify(s);
    });

    if (newShifts.length > 0) db.insertShifts(newShifts);
    if (deletedShiftIds.length > 0) db.deleteShifts(deletedShiftIds);
    updatedShifts.forEach(s => db.updateShift(s));

    // Slack notifications
    const slackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
    if (slackUrl) {
      const getAgentName = (id: string) => state.users.find(u => u.id === id)?.name || 'Unknown';

      if (newShifts.length > 0) {
        if (newShifts.length > 5) {
          sendSlackNotification(slackUrl, `📅 *${newShifts.length} shifts created*: "${newShifts[0].name}" starting ${newShifts[0].date}`);
        } else {
          newShifts.forEach(s => sendSlackNotification(slackUrl,
            `📅 *New shift*: "${s.name}" on ${s.date} (${s.startTime}–${s.endTime})${s.assignedAgentIds.length > 0 ? ` — Assigned: ${s.assignedAgentIds.map(getAgentName).join(', ')}` : ''}`
          ));
        }
      }

      if (deletedShiftIds.length > 0) {
        const deletedShifts = prev.shifts.filter(s => deletedShiftIds.includes(s.id));
        if (deletedShifts.length > 5) {
          sendSlackNotification(slackUrl, `❌ *${deletedShifts.length} shifts cancelled*: "${deletedShifts[0].name}"`);
        } else {
          deletedShifts.forEach(s => sendSlackNotification(slackUrl,
            `❌ *Shift cancelled*: "${s.name}" on ${s.date} (${s.startTime}–${s.endTime})`
          ));
        }
      }

      updatedShifts.forEach(s => {
        const old = prev.shifts.find(ps => ps.id === s.id);
        if (!old) return;
        const newAgents = s.assignedAgentIds.filter(id => !old.assignedAgentIds.includes(id));
        const removedAgents = old.assignedAgentIds.filter(id => !s.assignedAgentIds.includes(id));
        if (newAgents.length > 0) {
          sendSlackNotification(slackUrl, `👤 *${newAgents.map(getAgentName).join(', ')}* assigned to "${s.name}" on ${s.date}`);
        }
        if (removedAgents.length > 0) {
          sendSlackNotification(slackUrl, `🚫 *${removedAgents.map(getAgentName).join(', ')}* removed from "${s.name}" on ${s.date}`);
        }
        if (old.startTime !== s.startTime || old.endTime !== s.endTime || old.name !== s.name) {
          sendSlackNotification(slackUrl, `✏️ *Shift updated*: "${s.name}" on ${s.date} (${s.startTime}–${s.endTime})`);
        }
      });
    }

    // Sync time offs
    const newTimeOffs = state.timeOffs.filter(t => !prev.timeOffs.some(pt => pt.id === t.id));
    const deletedTimeOffIds = prev.timeOffs.filter(t => !state.timeOffs.some(nt => nt.id === t.id)).map(t => t.id);
    newTimeOffs.forEach(t => db.insertTimeOff(t));
    deletedTimeOffIds.forEach(id => db.deleteTimeOff(id));

    // Sync notifications
    const newNotifs = state.notifications.filter(n => !prev.notifications.some(pn => pn.id === n.id));
    const updatedNotifs = state.notifications.filter(n => {
      const pn = prev.notifications.find(pn => pn.id === n.id);
      return pn && pn.read !== n.read;
    });
    newNotifs.forEach(n => db.insertNotification(n));
    updatedNotifs.forEach(n => { if (n.read) db.markNotificationRead(n.id); });

    // Sync swap requests
    const newSwaps = (state.swapRequests || []).filter(r => !(prev.swapRequests || []).some(pr => pr.id === r.id));
    const updatedSwaps = (state.swapRequests || []).filter(r => {
      const pr = (prev.swapRequests || []).find(pr => pr.id === r.id);
      return pr && pr.status !== r.status;
    });
    newSwaps.forEach(r => db.insertSwapRequest(r));
    updatedSwaps.forEach(r => db.updateSwapRequestStatus(r.id, r.status as 'accepted' | 'declined'));

    // Sync clock records
    const newClockRecords = state.clockRecords.filter(r => !prev.clockRecords.some(pr => pr.id === r.id));
    const updatedClockRecords = state.clockRecords.filter(r => {
      const pr = prev.clockRecords.find(pr => pr.id === r.id);
      return pr && JSON.stringify(pr) !== JSON.stringify(r);
    });
    newClockRecords.forEach(r => db.upsertClockRecord(r));
    updatedClockRecords.forEach(r => db.upsertClockRecord(r));

    // Sync user updates
    const updatedUsers = state.users.filter(u => {
      const pu = prev.users.find(pu => pu.id === u.id);
      return pu && JSON.stringify(pu) !== JSON.stringify(u);
    });
    updatedUsers.forEach(u => db.updateProfile(u.id, {
      country: u.country,
      color: u.color,
      name: u.name,
      role: u.role,
      timezone: u.timezone,
      enabledHolidayCountries: u.enabledHolidayCountries,
      ptoAllowance: u.ptoAllowance,
      sickDaysAllowance: u.sickDaysAllowance,
    }));
  }, [state]);

  const agents = state.users.filter(u => u.role === 'agent' || u.role === 'team-lead');

  const getAgentById = (id: string) => state.users.find(u => u.id === id);

  const getShiftsForDate = (date: string) =>
    state.shifts.filter(s => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const getShiftsForAgent = (agentId: string) =>
    state.shifts.filter(s => s.assignedAgentIds.includes(agentId)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const getTimeOffsForDate = (date: string) =>
    state.timeOffs.filter(t => t.date === date);

  const getUnreadNotificationCount = () =>
    state.notifications.filter(n => n.userId === state.currentUser.id && !n.read).length;

  const getUserNotifications = () =>
    state.notifications
      .filter(n => n.userId === state.currentUser.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const hasConflict = (agentId: string, date: string) => {
    if (state.timeOffs.some(t => t.userId === agentId && t.date === date)) return true;
    const agent = state.users.find(u => u.id === agentId);
    if (agent?.country) {
      return getPublicHolidays(agent.country, date).length > 0;
    }
    return false;
  };

  const addAgent = (name: string, email: string, country?: string) => {
    const usedColors = agents.map(a => a.color);
    dispatch({
      type: 'ADD_USER',
      payload: {
        id: uuid(),
        name,
        email,
        role: 'agent',
        color: getNextColor(usedColors, AGENT_COLORS),
        country,
      },
    });
  };

  const getPublicHolidaysForDate = (date: string) => {
    const results: { agent: User; holidays: PublicHoliday[] }[] = [];
    const seenCountries = new Set<string>();

    // Show holidays for enabled countries (admin setting)
    const enabledCountries = getEnabledHolidayCountries();
    for (const countryCode of enabledCountries) {
      const holidays = getPublicHolidays(countryCode, date);
      if (holidays.length > 0) {
        seenCountries.add(countryCode);
        // Use a pseudo-user to represent the country
        results.push({
          agent: { id: `country-${countryCode}`, name: countryCode, email: '', role: 'agent', color: '#a855f7', country: countryCode },
          holidays,
        });
      }
    }

    // Also show per-agent holidays if their country isn't already covered
    for (const agent of agents) {
      if (!agent.country || seenCountries.has(agent.country)) continue;
      const holidays = getPublicHolidays(agent.country, date);
      if (holidays.length > 0) {
        results.push({ agent, holidays });
      }
    }

    // For current user, also include their own country
    if (state.currentUser.country) {
      const alreadyShown = results.some(r => r.agent.country === state.currentUser.country);
      if (!alreadyShown) {
        const holidays = getPublicHolidays(state.currentUser.country, date);
        if (holidays.length > 0) {
          results.push({ agent: state.currentUser, holidays });
        }
      }
    }

    return results;
  };

  const getClockRecord = (shiftId: string, userId: string) =>
    state.clockRecords.find(r => r.shiftId === shiftId && r.userId === userId);

  const getMonthlyHours = (agentId: string, year: number, month: number) => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const agentShifts = state.shifts.filter(
      s => s.assignedAgentIds.includes(agentId) && s.date.startsWith(monthStr)
    );
    let totalMinutes = 0;
    for (const shift of agentShifts) {
      const clockRecord = getClockRecord(shift.id, agentId);
      if (clockRecord?.clockIn && clockRecord?.clockOut) {
        // Use actual clocked hours
        const diff = new Date(clockRecord.clockOut).getTime() - new Date(clockRecord.clockIn).getTime();
        totalMinutes += diff / 60000;
      } else {
        // Use scheduled shift hours
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60; // overnight shift
        totalMinutes += mins;
      }
    }
    return Math.round((totalMinutes / 60) * 10) / 10; // 1 decimal
  };

  const getPtoBalance = (agentId: string, year?: number) => {
    const y = year ?? new Date().getFullYear();
    const yearPrefix = `${y}-`;
    const agentTimeOffs = state.timeOffs.filter(
      t => t.userId === agentId && t.date.startsWith(yearPrefix)
    );
    const sickUsed = agentTimeOffs.filter(t => t.category === 'sick').length;
    const used = agentTimeOffs.filter(t => t.category !== 'sick').length;
    const agent = state.users.find(u => u.id === agentId);
    const total = agent?.ptoAllowance ?? 21;
    const sickTotal = agent?.sickDaysAllowance ?? 7;
    return { used, total, remaining: total - used, sickUsed, sickTotal, sickRemaining: sickTotal - sickUsed };
  };

  const getEnabledHolidayCountries = (): string[] => {
    // Find admin users and get their enabled holiday countries
    const admin = state.users.find(u => u.role === 'admin' && u.enabledHolidayCountries && u.enabledHolidayCountries.length > 0);
    return admin?.enabledHolidayCountries || [];
  };

  const getPendingSwapRequests = () =>
    (state.swapRequests || []).filter(r => r.status === 'pending' && r.toAgentId === state.currentUser.id);

  const getSwapRequestsForShift = (shiftId: string) =>
    (state.swapRequests || []).filter(r => (r.fromShiftId === shiftId || r.toShiftId === shiftId) && r.status === 'pending');

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      agents,
      getAgentById,
      getShiftsForDate,
      getShiftsForAgent,
      getTimeOffsForDate,
      getUnreadNotificationCount,
      getUserNotifications,
      hasConflict,
      addAgent,
      getPendingSwapRequests,
      getSwapRequestsForShift,
      getPublicHolidaysForDate,
      getClockRecord,
      getMonthlyHours,
      getEnabledHolidayCountries,
      getPtoBalance,
      refreshData,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
