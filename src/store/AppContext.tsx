import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import type { User, Shift, TimeOff, Notification, SwapRequest, ClockRecord } from '../types';
import { AGENT_COLORS, getNextColor } from '../utils/colors';
import { addDays, addWeeks, formatDate } from '../utils/dates';
import { getHolidaysForDate as getPublicHolidays, type PublicHoliday } from '../utils/holidays';
import * as db from '../lib/database';
import { sendSlackNotification } from '../utils/slack';
import { isSwapExpired } from '../utils/swaps';

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
  | { type: 'UPDATE_TIME_OFF_STATUS'; payload: { id: string; status: string } }
  | { type: 'UPDATE_TIME_OFF'; payload: { id: string; updates: Partial<TimeOff> } }
  | { type: 'REMOVE_TIME_OFF'; payload: string }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'DUPLICATE_WEEK'; payload: { sourceWeekStart: string; targetWeekStart: string } }
  | { type: 'CREATE_SWAP_REQUEST'; payload: SwapRequest }
  | { type: 'ACCEPT_SWAP_REQUEST'; payload: string }
  | { type: 'DECLINE_SWAP_REQUEST'; payload: string }
  | { type: 'EXPIRE_SWAP_REQUESTS'; payload: { swapIds: string[]; notifIds: string[] } }
  | { type: 'ADD_WEEKEND_ROTATION'; payload: { shift: Shift; groupA: string[]; groupB: string[] } }
  | { type: 'UPDATE_SHIFT_ALL_RECURRING'; payload: Shift }
  | { type: 'UPDATE_SHIFT_FUTURE'; payload: Shift }
  | { type: 'CLOCK_IN'; payload: ClockRecord }
  | { type: 'CLOCK_OUT'; payload: { shiftId: string; userId: string; clockOut: string } }
  | { type: 'UPSERT_CLOCK_RECORD'; payload: ClockRecord }
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
    case 'LOAD_STATE': {
      // Preserve active clock-ins (clockIn set, no clockOut) that haven't saved to DB yet
      const activeClockIns = state.clockRecords.filter(r => r.clockIn && !r.clockOut);
      const loadedClockIds = new Set(action.payload.clockRecords.map(r => r.id));
      const missingActiveClockIns = activeClockIns.filter(r => !loadedClockIds.has(r.id));
      return {
        ...action.payload,
        shifts: action.payload.shifts.map(s => ({
          ...s,
          assignedAgentIds: [...new Set(s.assignedAgentIds)],
        })),
        clockRecords: [...action.payload.clockRecords, ...missingActiveClockIns],
      };
    }

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
      const { shift, groupA, groupB } = action.payload;
      // Deep copy arrays to prevent any reference issues
      const aAgents = Array.from(groupA);
      const bAgents = Array.from(groupB);
      const allAgents = [...aAgents, ...bAgents];
      const groupId = uuid();
      const baseDate = new Date(shift.date + 'T12:00:00');
      const newShifts: Shift[] = [];
      const notifications: Notification[] = [];

      // Find the next Saturday from the start date
      const startSat = new Date(baseDate);
      while (startSat.getDay() !== 6) {
        startSat.setDate(startSat.getDate() + 1);
      }
      const startSatTime = startSat.getTime();

      // Generate 26 weeks of alternating Sat/Sun shifts
      for (let week = 0; week < 26; week++) {
        const satMs = startSatTime + week * 7 * 86400000;
        const sunMs = satMs + 86400000;
        const satDateStr = formatDate(new Date(satMs));
        const sunDateStr = formatDate(new Date(sunMs));

        // Even weeks: Group A on Sat, Group B on Sun
        // Odd weeks: Group B on Sat, Group A on Sun
        const satAgentIds = week % 2 === 0 ? Array.from(aAgents) : Array.from(bAgents);
        const sunAgentIds = week % 2 === 0 ? Array.from(bAgents) : Array.from(aAgents);

        newShifts.push({
          id: uuid(),
          name: shift.name,
          date: satDateStr,
          startTime: shift.startTime,
          endTime: shift.endTime,
          timezone: shift.timezone,
          assignedAgentIds: satAgentIds,
          recurring: 'weekend-rotation' as const,
          recurringGroupId: groupId,
          requiredAgents: shift.requiredAgents,
          color: shift.color,
        });

        newShifts.push({
          id: uuid(),
          name: shift.name,
          date: sunDateStr,
          startTime: shift.startTime,
          endTime: shift.endTime,
          timezone: shift.timezone,
          assignedAgentIds: sunAgentIds,
          recurring: 'weekend-rotation' as const,
          recurringGroupId: groupId,
          requiredAgents: shift.requiredAgents,
          color: shift.color,
        });
      }

      // Apply consecutive days off to existing weekday shifts with the same name
      // Group A WORKS Sat (off Sun) → Group A agent off Friday (Fri+Sat off, works Sun)
      //   Wait — Group A works Sat, so they're OFF Sun. Adjacent to Sun = Monday.
      //   But Sat group is OFF on Sun, so their free day is Sun. Adjacent weekday = Mon.
      //   Actually: Group A works Sat. Group B works Sun.
      //   Group A is OFF Sun → Mon off gives Sun+Mon consecutive
      //   Group B is OFF Sat → Fri off gives Fri+Sat consecutive
      // Fri off = 1 agent from Sunday group (they're off Sat, so Fri+Sat consecutive)
      // Mon off = 1 agent from Saturday group (they're off Sun, so Sun+Mon consecutive)
      // Tue/Wed/Thu = remaining agents rotate off
      const updatedShifts = state.shifts.map(s => {
        if (s.name !== shift.name) return s;
        const sDate = new Date(s.date + 'T12:00:00');
        if (sDate < baseDate) return s;
        const dow = sDate.getDay();
        if (dow === 0 || dow === 6) return s; // skip weekends

        // Determine week parity relative to the first Saturday
        const weekNum = Math.floor((sDate.getTime() - startSatTime + 6 * 86400000) / (7 * 86400000));
        const isEvenWeek = weekNum % 2 === 0;
        const satGroup = isEvenWeek ? aAgents : bAgents; // works Saturday, off Sunday
        const sunGroup = isEvenWeek ? bAgents : aAgents; // works Sunday, off Saturday

        // Determine who is off this day
        let offAgent: string;
        if (dow === 5) {
          // Friday: 1st agent from Sunday group off (off Sat, so Fri+Sat consecutive)
          offAgent = sunGroup[0];
        } else if (dow === 1) {
          // Monday: 1st agent from Saturday group off (off Sun, so Sun+Mon consecutive)
          offAgent = satGroup[0];
        } else {
          // Tue(2)/Wed(3)/Thu(4): remaining agents take turns
          const remaining = allAgents.filter(a => a !== sunGroup[0] && a !== satGroup[0]);
          offAgent = remaining[(dow - 2) % remaining.length];
        }

        return { ...s, assignedAgentIds: allAgents.filter(a => a !== offAgent) };
      });

      // Notify all rotation agents
      [...groupA, ...groupB].forEach(agentId => {
        const inA = groupA.includes(agentId);
        notifications.push(createNotification(
          agentId,
          `You've been added to weekend rotation for "${shift.name}" — starting ${inA ? 'Saturday' : 'Sunday'}, alternating for 26 weeks`,
          'assignment'
        ));
      });

      return {
        ...state,
        shifts: [...updatedShifts, ...newShifts],
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
        return { ...s, name: updated.name, startTime: updated.startTime, endTime: updated.endTime, timezone: updated.timezone, color: updated.color, requiredAgents: updated.requiredAgents };
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
        return { ...s, name: updated.name, startTime: updated.startTime, endTime: updated.endTime, timezone: updated.timezone, color: updated.color, requiredAgents: updated.requiredAgents };
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

    case 'UPDATE_TIME_OFF_STATUS':
      return {
        ...state,
        timeOffs: state.timeOffs.map(t =>
          t.id === action.payload.id ? { ...t, status: action.payload.status as any } : t
        ),
      };

    case 'UPDATE_TIME_OFF':
      return {
        ...state,
        timeOffs: state.timeOffs.map(t =>
          t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
        ),
      };

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
            const ids = s.assignedAgentIds.filter(id => id !== swap.fromAgentId);
            if (!ids.includes(swap.toAgentId)) ids.push(swap.toAgentId);
            return { ...s, assignedAgentIds: ids };
          }
          if (s.id === swap.toShiftId) {
            const ids = s.assignedAgentIds.filter(id => id !== swap.toAgentId);
            if (!ids.includes(swap.fromAgentId)) ids.push(swap.fromAgentId);
            return { ...s, assignedAgentIds: ids };
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

    case 'EXPIRE_SWAP_REQUESTS': {
      const swapSet = new Set(action.payload.swapIds);
      const notifSet = new Set(action.payload.notifIds);
      return {
        ...state,
        swapRequests: (state.swapRequests || []).map(r =>
          swapSet.has(r.id) ? { ...r, status: 'declined' as const } : r
        ),
        notifications: state.notifications.map(n =>
          notifSet.has(n.id) ? { ...n, read: true } : n
        ),
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

    case 'UPSERT_CLOCK_RECORD': {
      const exists = state.clockRecords.some(r => r.id === action.payload.id);
      return {
        ...state,
        clockRecords: exists
          ? state.clockRecords.map(r => (r.id === action.payload.id ? action.payload : r))
          : [...state.clockRecords, action.payload],
      };
    }

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  agents: User[];
  activeAgents: User[];
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
  setAgentActive: (agentId: string, active: boolean, transferToAgentId?: string) => Promise<void>;
  mirrorAgentSchedule: (
    sourceAgentId: string,
    targetAgentId: string,
    refWeekStart: string,
    targetStartDate: string,
    weeks: number,
  ) => Promise<{ patterns: number; shiftsAssigned: number }>;
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
      lastLoadRef.current = Date.now();
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
    // Refresh every 2 minutes (reduced from 30s to avoid exhausting Supabase free tier)
    const interval = setInterval(refreshData, 120000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Auto-expire pending swap requests whose shifts have passed. Flips them to
  // 'declined' so they drop out of approval queues, and marks any linked
  // notifications read so the bell stops nagging. Writes to Supabase directly
  // because the diff-sync effect skips writes during the 500ms bulk-load
  // window that this effect typically fires inside.
  useEffect(() => {
    if (state.shifts.length === 0) return;
    const expired = (state.swapRequests || []).filter(
      r => r.status === 'pending' && isSwapExpired(r, state.shifts),
    );
    if (expired.length === 0) return;
    const expiredIds = new Set(expired.map(r => r.id));
    const notifsToMark = state.notifications.filter(
      n =>
        n.userId === state.currentUser.id &&
        !n.read &&
        n.swapRequestId &&
        expiredIds.has(n.swapRequestId),
    );
    expired.forEach(r => db.updateSwapRequestStatus(r.id, 'declined'));
    notifsToMark.forEach(n => db.markNotificationRead(n.id));
    dispatch({
      type: 'EXPIRE_SWAP_REQUESTS',
      payload: { swapIds: Array.from(expiredIds), notifIds: notifsToMark.map(n => n.id) },
    });
  }, [state.shifts, state.swapRequests, state.notifications, state.currentUser.id]);

  // Helper to check Slack notification preferences
  const getSlackPrefs = () => {
    const admin = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl);
    const prefs = admin?.slackNotifications || {};
    return {
      url: admin?.slackWebhookUrl,
      swaps: prefs.slackNotifySwaps ?? true,
      timeOff: prefs.slackNotifyTimeOff ?? true,
      timeOffApproval: prefs.slackNotifyTimeOffApproval ?? true,
      weeklyCoverage: prefs.slackNotifyWeeklyCoverage ?? true,
      missedClockIn: prefs.slackNotifyMissedClockIn ?? true,
    };
  };

  // Proactive weekly check: alert if any agent has < 5 shifts this week
  useEffect(() => {
    if (state.shifts.length === 0 || state.users.length === 0) return;
    if (state.currentUser.role !== 'admin') return;
    const slack = getSlackPrefs();
    if (!slack.url || !slack.weeklyCoverage) return;
    const slackUrl = slack.url;
    // Only run once per day across all sessions/reloads
    const today = new Date();
    const todayStr = formatDate(today);
    const lastCheck = localStorage.getItem('slack_weekly_check_date');
    if (lastCheck === todayStr) return;
    localStorage.setItem('slack_weekly_check_date', todayStr);

    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - ((thisWeekStart.getDay() + 6) % 7)); // Monday
    const nextWeekStart = addDays(thisWeekStart, 7);
    const MIN_SHIFTS = 5;
    const SHIFT_LABELS = ['USA Shift', 'EU Shift', 'Mid Shift'];
    const agents = state.users.filter(u => {
      if (u.role !== 'agent' || u.active === false) return false;
      const labels = u.labels || (u.label ? [u.label] : []);
      return labels.some(l => SHIFT_LABELS.includes(l));
    });

    // List agents below their weekly minimum (5 minus approved days off) for the
    // given week. For the look-ahead week, agents with zero shifts are skipped —
    // their schedule likely isn't built yet, so flagging them would be noise. We
    // only want the "scheduled but short" case (e.g. 4/5), which is the abuse
    // signal worth catching before the week starts.
    const underAssignedFor = (weekStart: Date, skipUnscheduled: boolean): string[] => {
      const weekDateSet = new Set(
        Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekStart, i)))
      );
      const under: string[] = [];
      agents.forEach(agent => {
        let weekShiftCount = 0;
        for (let i = 0; i < 7; i++) {
          const ds = formatDate(addDays(weekStart, i));
          if (state.shifts.some(sh => sh.date === ds && sh.assignedAgentIds.includes(agent.id))) {
            weekShiftCount++;
          }
        }
        if (skipUnscheduled && weekShiftCount === 0) return;
        const approvedDaysOff = state.timeOffs
          .filter(t => t.userId === agent.id && (t.status || 'approved') === 'approved' && weekDateSet.has(t.date))
          .reduce((sum, t) => sum + (t.halfDay ? 0.5 : 1), 0);
        const adjustedMin = Math.max(0, MIN_SHIFTS - approvedDaysOff);
        if (weekShiftCount < adjustedMin) {
          const offSuffix = approvedDaysOff > 0 ? `, ${approvedDaysOff} approved off` : '';
          under.push(`${agent.name} (${weekShiftCount}/${adjustedMin}${offSuffix})`);
        }
      });
      return under;
    };

    const thisUnder = underAssignedFor(thisWeekStart, false);
    const nextUnder = underAssignedFor(nextWeekStart, true);

    const sections: string[] = [];
    if (thisUnder.length > 0) {
      sections.push(`*This week* (of ${formatDate(thisWeekStart)}):\n${thisUnder.map(a => `• ${a}`).join('\n')}`);
    }
    if (nextUnder.length > 0) {
      sections.push(`*Next week* (of ${formatDate(nextWeekStart)}):\n${nextUnder.map(a => `• ${a}`).join('\n')}`);
    }

    if (sections.length > 0) {
      sendSlackNotification(slackUrl,
        `⚠️ *Weekly coverage alert* — agents below ${MIN_SHIFTS} shifts (approved days off subtracted):\n\n${sections.join('\n\n')}`
      );
    }
  }, [state.shifts, state.users, state.timeOffs]);

  // Missed clock-in check: alert when an assigned agent hasn't clocked in 15min after shift start
  useEffect(() => {
    if (state.shifts.length === 0 || state.users.length === 0) return;
    if (state.currentUser.role !== 'admin') return;
    const slack = getSlackPrefs();
    if (!slack.url || !slack.missedClockIn) return;
    const slackUrl = slack.url;

    const GRACE_MINUTES = 15;
    const LOOKBACK_MS = 6 * 3600_000;
    const now = Date.now();

    const alertedRaw = localStorage.getItem('slack_missed_clockin_alerts');
    const alerted = new Set<string>(alertedRaw ? JSON.parse(alertedRaw) : []);
    const alertedBefore = alerted.size;

    const alerts: string[] = [];

    state.shifts.forEach(shift => {
      if (!shift.assignedAgentIds.length) return;
      // Compute shift start in UTC based on shift.timezone
      const asUtc = new Date(`${shift.date}T${shift.startTime}:00Z`).getTime();
      const tzFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: shift.timezone })).getTime();
      const utcFormatted = new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
      const startUtcMs = asUtc - (tzFormatted - utcFormatted);

      const graceEnd = startUtcMs + GRACE_MINUTES * 60_000;
      if (graceEnd > now) return; // grace not yet elapsed
      if (startUtcMs < now - LOOKBACK_MS) return; // too old

      shift.assignedAgentIds.forEach(agentId => {
        const key = `${shift.id}:${agentId}`;
        if (alerted.has(key)) return;
        const clock = state.clockRecords.find(r => r.shiftId === shift.id && r.userId === agentId);
        if (clock?.clockIn) return; // they clocked in
        const agent = state.users.find(u => u.id === agentId);
        if (!agent || agent.active === false) return;
        const firstName = agent.name.split(' ')[0];
        alerts.push(`• ${firstName} — "${shift.name}" (${shift.date} ${shift.startTime} ${shift.timezone})`);
        alerted.add(key);
      });
    });

    if (alerts.length > 0) {
      sendSlackNotification(slackUrl,
        `⏰ *Missed clock-in* (${GRACE_MINUTES}min+ past start):\n${alerts.join('\n')}`
      );
    }
    if (alerted.size !== alertedBefore) {
      const trimmed = Array.from(alerted).slice(-1000);
      localStorage.setItem('slack_missed_clockin_alerts', JSON.stringify(trimmed));
    }
  }, [state.shifts, state.clockRecords, state.users]);

  // Track whether a bulk data load just happened (LOAD_STATE from DB refresh)
  const lastLoadRef = useRef(0);

  // Sync changes to Supabase
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (prev === state) return;

    // If this state change came from a bulk DB load, skip notifications
    const isBulkLoad = Date.now() - lastLoadRef.current < 500;

    // Sync shifts — only insert new and update existing. Deletes flow through explicit
    // handlers in ShiftCard / ShiftModal calling db.deleteShift(s) directly. A diff-based
    // delete here would mass-wipe whenever a refresh returned a smaller shift set.
    const newShifts = state.shifts.filter(s => !prev.shifts.some(ps => ps.id === s.id));
    const updatedShifts = state.shifts.filter(s => {
      const ps = prev.shifts.find(ps => ps.id === s.id);
      return ps && JSON.stringify(ps) !== JSON.stringify(s);
    });

    if (!isBulkLoad) {
      if (newShifts.length > 0) db.insertShifts(newShifts);
      updatedShifts.forEach(s => db.updateShift(s));
    }

    // Slack + admin notifications (skip on bulk data load from DB)
    const adminUser = !isBulkLoad ? state.users.find(u => u.role === 'admin') : undefined;
    const slack = getSlackPrefs();
    const slackUrl = slack.url;
    const notifyAdmin = (message: string, swapRequestId?: string) => {
      if (adminUser && adminUser.id !== state.currentUser.id) {
        const notif: Notification = { ...createNotification(adminUser.id, message, 'info'), swapRequestId };
        db.insertNotification(notif);
      }
    };
    // Admin notifications for shift assignment changes removed (too spammy).
    // notifyAdmin is still used for swap requests below.

    if (!isBulkLoad) {
      // Sync time offs — only insert new ones. Deletes must come from explicit user
      // handlers calling db.deleteTimeOff directly. Computing deletes from a set-diff
      // is dangerous: if a refresh returns a smaller set (network blip / backgrounded
      // tab past the 500ms guard), the diff would mass-delete legitimate records.
      const newTimeOffs = state.timeOffs.filter(t => !prev.timeOffs.some(pt => pt.id === t.id));
      newTimeOffs.forEach(t => db.insertTimeOff(t));

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
      newSwaps.forEach(r => {
        db.insertSwapRequest(r);
        if (adminUser) {
          const fromName = state.users.find(u => u.id === r.fromAgentId)?.name;
          const toName = state.users.find(u => u.id === r.toAgentId)?.name;
          const fromShift = state.shifts.find(s => s.id === r.fromShiftId);
          const toShift = state.shifts.find(s => s.id === r.toShiftId);
          notifyAdmin(`Swap request: ${fromName} wants to swap "${fromShift?.name}" (${fromShift?.date}) with ${toName}'s "${toShift?.name}" (${toShift?.date})`, r.id);
        }
      });
      updatedSwaps.forEach(r => {
        db.updateSwapRequestStatus(r.id, r.status as 'accepted' | 'declined');
        if (slackUrl && slack.swaps && r.status === 'accepted') {
          const getAgentName2 = (id: string) => state.users.find(u => u.id === id)?.name || 'Unknown';
          const fromShift = state.shifts.find(s => s.id === r.fromShiftId);
          const toShift = state.shifts.find(s => s.id === r.toShiftId);
          sendSlackNotification(slackUrl, `🔄 *Swap completed*: ${getAgentName2(r.fromAgentId)} ↔ ${getAgentName2(r.toAgentId)} — "${fromShift?.name}" (${fromShift?.date}) swapped with "${toShift?.name}" (${toShift?.date})`);
        }
      });

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
    }

    // Sync clock records — runs unconditionally (no isBulkLoad gate). Restricted to the
    // current user's own records so a refresh that pulls in other users' clock-ins
    // doesn't trigger spurious upserts. The 500ms bulk-load guard above was eating
    // legitimate user clicks that landed within the window after a refresh.
    const myId = state.currentUser.id;
    const newClockRecords = state.clockRecords.filter(r =>
      r.userId === myId && !prev.clockRecords.some(pr => pr.id === r.id)
    );
    const updatedClockRecords = state.clockRecords.filter(r => {
      if (r.userId !== myId) return false;
      const pr = prev.clockRecords.find(pr => pr.id === r.id);
      return pr && JSON.stringify(pr) !== JSON.stringify(r);
    });
    newClockRecords.forEach(r => db.upsertClockRecord(r));
    updatedClockRecords.forEach(r => db.upsertClockRecord(r));
  }, [state]);

  const agents = state.users;
  const activeAgents = state.users.filter(u => u.active !== false);

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
    // Only approved time offs block assignments
    if (state.timeOffs.some(t => t.userId === agentId && t.date === date && (t.status || 'approved') === 'approved')) return true;
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

  // Flip an agent active/inactive. Deactivation strips them from every
  // upcoming shift; when transferToAgentId is supplied the slot is handed
  // over to that replacement instead of being left empty. Past shifts are
  // left untouched so historical data stays intact.
  const setAgentActive = async (agentId: string, active: boolean, transferToAgentId?: string) => {
    dispatch({ type: 'UPDATE_USER', payload: { id: agentId, updates: { active } } });
    await db.updateProfile(agentId, { active } as any);
    if (active) return;
    const todayStr = formatDate(new Date());
    const futureShifts = state.shifts.filter(
      s => s.date >= todayStr && s.assignedAgentIds.includes(agentId),
    );
    for (const s of futureShifts) {
      const remaining = s.assignedAgentIds.filter(id => id !== agentId);
      const newAgentIds = transferToAgentId && !remaining.includes(transferToAgentId)
        ? [...remaining, transferToAgentId]
        : remaining;
      dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: s.id, agentId } });
      if (transferToAgentId && !s.assignedAgentIds.includes(transferToAgentId)) {
        dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: s.id, agentId: transferToAgentId } });
      }
      await db.updateShiftAssignment(s.id, newAgentIds);
    }
  };

  // Replicate one agent's weekly shift pattern onto another. Looks at every
  // shift the source was assigned to during the reference week and, for each
  // upcoming week, finds the matching shift (same name + day-of-week +
  // start time) and adds the target agent to it. Useful when onboarding a
  // replacement after a teammate has been terminated.
  const mirrorAgentSchedule = async (
    sourceAgentId: string,
    targetAgentId: string,
    refWeekStart: string,
    targetStartDate: string,
    weeks: number,
  ) => {
    const dayMs = 86400000;
    const refStartTime = new Date(`${refWeekStart}T00:00:00Z`).getTime();
    const refDates = new Set(
      Array.from({ length: 7 }, (_, i) =>
        new Date(refStartTime + i * dayMs).toISOString().slice(0, 10),
      ),
    );
    const sourceShifts = state.shifts.filter(
      s => refDates.has(s.date) && s.assignedAgentIds.includes(sourceAgentId),
    );
    type Pattern = { name: string; dow: number; startTime: string; refDate: string };
    const patterns: Pattern[] = sourceShifts.map(s => ({
      name: s.name,
      dow: (new Date(`${s.date}T00:00:00Z`).getUTCDay() + 6) % 7, // Mon=0..Sun=6
      startTime: s.startTime,
      refDate: s.date,
    }));
    const targetStartTime = new Date(`${targetStartDate}T00:00:00Z`).getTime();
    let assigned = 0;
    for (let w = 0; w < weeks; w++) {
      for (const p of patterns) {
        const date = new Date(targetStartTime + (w * 7 + p.dow) * dayMs)
          .toISOString()
          .slice(0, 10);
        const match = state.shifts.find(
          s => s.date === date && s.name === p.name && s.startTime === p.startTime,
        );
        if (!match || match.assignedAgentIds.includes(targetAgentId)) continue;
        const newAgentIds = [...match.assignedAgentIds, targetAgentId];
        dispatch({ type: 'ASSIGN_AGENT', payload: { shiftId: match.id, agentId: targetAgentId } });
        await db.updateShiftAssignment(match.id, newAgentIds);
        assigned++;
      }
    }
    return { patterns: patterns.length, shiftsAssigned: assigned };
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
      t => t.userId === agentId && t.date.startsWith(yearPrefix) && (t.status || 'approved') === 'approved'
    ).filter(t => {
      // PTO is always counted in business days (Mon-Fri) — skip weekends
      const day = new Date(t.date + 'T12:00:00').getDay();
      return day !== 0 && day !== 6;
    });
    const agent = state.users.find(u => u.id === agentId);
    const sickUsed = agentTimeOffs.filter(t => t.category === 'sick').reduce((sum, t) => sum + (t.halfDay ? 0.5 : 1), 0);
    const holidaysDeduct = agent?.holidaysDeductPto ?? true;
    const used = agentTimeOffs
      .filter(t => t.category !== 'sick')
      .filter(t => holidaysDeduct || t.category !== 'religious') // skip religious/public if not deducting
      .reduce((sum, t) => sum + (t.halfDay ? 0.5 : 1), 0);
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
    (state.swapRequests || []).filter(
      r =>
        r.status === 'pending' &&
        r.toAgentId === state.currentUser.id &&
        !isSwapExpired(r, state.shifts),
    );

  const getSwapRequestsForShift = (shiftId: string) =>
    (state.swapRequests || []).filter(
      r =>
        (r.fromShiftId === shiftId || r.toShiftId === shiftId) &&
        r.status === 'pending' &&
        !isSwapExpired(r, state.shifts),
    );

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      agents,
      activeAgents,
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
      setAgentActive,
      mirrorAgentSchedule,
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
