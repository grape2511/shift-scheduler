import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Bell, Check, Clock, UserPlus, AlertCircle, ArrowRightLeft, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { SwapRequest } from '../types';

interface NotificationPanelProps {
  onClose: () => void;
  onTabChange?: (tab: string) => void;
}

export function NotificationPanel({ onClose, onTabChange }: NotificationPanelProps) {
  const { state, dispatch, getUserNotifications, getAgentById } = useApp();
  const notifications = getUserNotifications();
  const [activeSwap, setActiveSwap] = useState<SwapRequest | null>(null);

  const iconMap: Record<string, typeof Bell> = {
    assignment: UserPlus,
    change: AlertCircle,
    info: Bell,
    'swap-request': ArrowRightLeft,
  };

  const handleNotificationClick = (notifId: string, message: string, swapRequestId?: string) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notifId });
    if (swapRequestId) {
      const swap = (state.swapRequests || []).find(r => r.id === swapRequestId && r.status === 'pending');
      if (swap) {
        setActiveSwap(swap);
        return;
      }
    }
    // Navigate to time-off tab for time-off requests
    if (message.includes('requesting') && message.includes('off on') && onTabChange) {
      onTabChange('time-off-approval');
      onClose();
    }
  };

  const handleAccept = () => {
    if (!activeSwap) return;
    dispatch({ type: 'ACCEPT_SWAP_REQUEST', payload: activeSwap.id });
    setActiveSwap(null);
  };

  const handleDecline = () => {
    if (!activeSwap) return;
    dispatch({ type: 'DECLINE_SWAP_REQUEST', payload: activeSwap.id });
    setActiveSwap(null);
  };

  // Swap detail modal
  if (activeSwap) {
    const fromAgent = getAgentById(activeSwap.fromAgentId);
    const fromShift = state.shifts.find(s => s.id === activeSwap.fromShiftId);
    const toShift = state.shifts.find(s => s.id === activeSwap.toShiftId);

    return (
      <div className="w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-orange-500" />
            Swap Request
          </h3>
          <button
            onClick={() => setActiveSwap(null)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Who's asking */}
          <div className="flex items-center gap-2">
            {fromAgent && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: fromAgent.color }}
              >
                {fromAgent.name[0]}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{fromAgent?.name}</p>
              <p className="text-xs text-gray-500">wants to swap shifts with you</p>
            </div>
          </div>

          {activeSwap.reason && (
            <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
              Reason: {activeSwap.reason}
            </p>
          )}

          {/* The trade */}
          <div className="space-y-2">
            {/* They give you */}
            <div className="bg-green-50 rounded-lg border border-green-200 p-3">
              <label className="block text-[10px] font-semibold text-green-500 uppercase mb-1">You get</label>
              {fromShift ? (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fromShift.color }} />
                  <span className="text-sm font-medium text-gray-800">{fromShift.name}</span>
                  <span className="text-xs text-gray-500">{fromShift.date} · {fromShift.startTime}–{fromShift.endTime}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-400">Shift not found</span>
              )}
            </div>

            <div className="flex justify-center">
              <ArrowRightLeft className="w-4 h-4 text-gray-400" />
            </div>

            {/* You give up */}
            <div className="bg-red-50 rounded-lg border border-red-200 p-3">
              <label className="block text-[10px] font-semibold text-red-400 uppercase mb-1">You give up</label>
              {toShift ? (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: toShift.color }} />
                  <span className="text-sm font-medium text-gray-800">{toShift.name}</span>
                  <span className="text-xs text-gray-500">{toShift.date} · {toShift.startTime}–{toShift.endTime}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-400">Shift not found</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDecline}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Decline
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Accept Swap
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[28rem] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
        {notifications.some(n => !n.read) && (
          <button
            onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            <Check className="w-3 h-3" /> Mark all read
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            No notifications yet
          </div>
        ) : (
          notifications.slice(0, 20).map(notif => {
            const Icon = iconMap[notif.type] || Bell;
            const isSwapRequest = notif.type === 'swap-request' && notif.swapRequestId;
            const swapStillPending = isSwapRequest &&
              (state.swapRequests || []).some(r => r.id === notif.swapRequestId && r.status === 'pending');

            return (
              <button
                key={notif.id}
                onClick={() => handleNotificationClick(notif.id, notif.message, notif.swapRequestId)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  !notif.read ? 'bg-indigo-50/50' : ''
                }`}
              >
                <div className={`mt-0.5 p-1.5 rounded-lg ${
                  isSwapRequest ? 'bg-orange-100 text-orange-600' :
                  !notif.read ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!notif.read ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {format(parseISO(notif.timestamp), 'MMM d, HH:mm')}
                    </span>
                    {swapStillPending && (
                      <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                        Click to respond
                      </span>
                    )}
                  </div>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
