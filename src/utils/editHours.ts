import { format } from 'date-fns';
import type { Shift, User } from '../types';

// Agents flagged with canEditOwnHours (e.g. Anu on the Finance shift) may change
// the times of their own shifts from today onward. Admins use the full editor.
export function canEditOwnHours(user: User, shift: Shift): boolean {
  return user.role !== 'admin' && !!user.canEditOwnHours
    && shift.assignedAgentIds.includes(user.id)
    && shift.date >= format(new Date(), 'yyyy-MM-dd');
}
