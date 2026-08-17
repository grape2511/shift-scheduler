import { useApp } from '../store/AppContext';
import { v4 as uuid } from 'uuid';
import { insertNotification } from '../lib/database';
import { sendSlackNotification } from '../utils/slack';
import { evalSelfLeave } from '../utils/leaveGuard';
import type { Shift } from '../types';

/**
 * Returns a function that removes the current agent from a shift, enforcing the
 * shared leave guard (headcount + weekly minimum) and, on an allowed leave,
 * surfacing the change to the admin (Slack + Activity) so a drop in an agent's
 * weekly coverage is never silent — regardless of which surface it came from.
 *
 * Returns true if the agent was removed, false if the guard blocked it (the
 * blocking message is shown via alert()).
 */
export function useSelfLeave() {
  const { state, dispatch } = useApp();

  return (shift: Shift): boolean => {
    const agentId = state.currentUser.id;
    const { blockedMessage, weeklyDayCount, weeklyAdjustedMin } = evalSelfLeave(
      shift,
      agentId,
      state.shifts,
      state.timeOffs,
    );
    if (blockedMessage) {
      alert(blockedMessage);
      return false;
    }

    dispatch({ type: 'UNASSIGN_AGENT', payload: { shiftId: shift.id, agentId } });

    const admin = state.users.find(u => u.role === 'admin');
    if (admin) {
      const notif = {
        id: uuid(),
        userId: admin.id,
        message: `${state.currentUser.name} left "${shift.name}" on ${shift.date} — now ${weeklyDayCount}/${weeklyAdjustedMin} shifts that week`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'change' as const,
      };
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif });
      insertNotification(notif);
    }
    const adminSlackUrl = state.users.find(u => u.role === 'admin' && u.slackWebhookUrl)?.slackWebhookUrl;
    if (adminSlackUrl) {
      sendSlackNotification(adminSlackUrl,
        `🚪 *Shift left*: ${state.currentUser.name} removed themselves from "${shift.name}" (${shift.date}) — now ${weeklyDayCount}/${weeklyAdjustedMin} shifts that week`
      );
    }
    return true;
  };
}
