import React, { useEffect, useState } from 'react';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { Avatar } from './Avatar.tsx';
import type { CallRecord } from '../types/index.ts';

interface CallsTabProps {
  onStartCall: (
    type: 'audio' | 'video' | 'group_video',
    targetUserIds: number[],
    convId: number | null,
    displayName: string,
    avatarUrl: string | null
  ) => void;
}

export const CallsTab: React.FC<CallsTabProps> = ({ onStartCall }) => {
  const { user, language } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCall, setShowNewCall] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);

  const loadCalls = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ calls: CallRecord[] }>('/api/calls');
      setCalls(data.calls);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const openDialer = async () => {
    setShowNewCall(true);
    const data = await apiRequest<{ users: any[] }>('/api/users/search?q=');
    setUsersList(data.users);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111B21] overflow-y-auto">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t(language, 'callsTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            WebRTC voice &amp; HD video calls
          </p>
        </div>
        <button
          type="button"
          onClick={openDialer}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Call</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 space-y-2 text-slate-500">
            <Phone className="w-9 h-9 mx-auto opacity-30" />
            <p className="text-sm">No recent calls yet</p>
          </div>
        ) : (
          calls.map((c) => {
            const isOutgoing = c.callerId === user?.id;
            const peer = isOutgoing ? c.callee : c.caller;
            const peerName = peer?.fullName || 'Group / Unknown';
            const peerId = peer?.userId;
            const isMissed = c.status === 'missed' || c.status === 'declined';

            return (
              <div
                key={c.id}
                className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#202C33]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={peer?.avatarUrl} name={peerName} size="md" />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        isMissed ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                    >
                      {peerName}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                      {isMissed ? (
                        <PhoneMissed className="w-3.5 h-3.5 text-rose-500" />
                      ) : isOutgoing ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      <span>
                        {new Date(c.startedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {c.durationSeconds > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            {Math.floor(c.durationSeconds / 60)}m {c.durationSeconds % 60}s
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {peerId && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onStartCall(
                          'audio',
                          [peerId],
                          c.conversationId,
                          peerName,
                          peer?.avatarUrl || null
                        )
                      }
                      className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onStartCall(
                          'video',
                          [peerId],
                          c.conversationId,
                          peerName,
                          peer?.avatarUrl || null
                        )
                      }
                      className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showNewCall && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Start Voice or Video Call</h3>
              <button type="button" onClick={() => setShowNewCall(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {usersList.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#202C33]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar src={u.avatarUrl} name={u.fullName} size="sm" />
                    <div>
                      <p className="text-sm font-medium">{u.fullName}</p>
                      <p className="text-xs text-slate-500">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCall(false);
                        onStartCall('audio', [u.id], null, u.fullName, u.avatarUrl);
                      }}
                      className="p-2 rounded-lg bg-emerald-600/10 text-emerald-600"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCall(false);
                        onStartCall('video', [u.id], null, u.fullName, u.avatarUrl);
                      }}
                      className="p-2 rounded-lg bg-emerald-600 text-white"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
