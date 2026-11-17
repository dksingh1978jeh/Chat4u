import React, { useState, useEffect } from 'react';
import {
  Search,
  MessageSquarePlus,
  Radio,
  Lock,
  Archive,
  BellOff,
  Star,
  UserPlus,
  X,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { Avatar } from './Avatar.tsx';
import type { ConversationSummary } from '../types/index.ts';

interface ChatsTabProps {
  conversations: ConversationSummary[];
  selectedConvId: number | null;
  loading: boolean;
  onSelectConversation: (conv: ConversationSummary) => void;
  onRefresh: () => void;
  onOpenDirectWithUser: (userId: number) => void;
}

export const ChatsTab: React.FC<ChatsTabProps> = ({
  conversations,
  selectedConvId,
  loading,
  onSelectConversation,
  onRefresh,
  onOpenDirectWithUser,
}) => {
  const { language, onlineUserIds } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived' | 'starred'>('all');
  const [search, setSearch] = useState('');

  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [foundUsers, setFoundUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSelected, setBroadcastSelected] = useState<number[]>([]);
  const [broadcastText, setBroadcastText] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const [starredList, setStarredList] = useState<any[]>([]);

  const [lockedPromptConv, setLockedPromptConv] = useState<ConversationSummary | null>(
    null
  );
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    if (filter === 'starred') {
      apiRequest<{ starred: any[] }>('/api/conversations/starred')
        .then((d) => setStarredList(d.starred))
        .catch(() => {});
    }
  }, [filter]);

  useEffect(() => {
    if (!showNewChat && !showBroadcast) return;
    setSearchingUsers(true);
    const timer = window.setTimeout(async () => {
      try {
        const d = await apiRequest<{ users: any[] }>(
          `/api/users/search?q=${encodeURIComponent(userSearchQuery)}`
        );
        setFoundUsers(d.users);
      } catch {
        setFoundUsers([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [showNewChat, showBroadcast, userSearchQuery]);

  const handleConversationClick = (conv: ConversationSummary) => {
    if (conv.isLocked) {
      setLockedPromptConv(conv);
      setUnlockPin('');
      setUnlockError(null);
    } else {
      onSelectConversation(conv);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockedPromptConv) return;
    try {
      await apiRequest(`/api/conversations/${lockedPromptConv.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ pin: unlockPin }),
      });
      const target = lockedPromptConv;
      setLockedPromptConv(null);
      onSelectConversation(target);
    } catch (err: any) {
      setUnlockError(err.message || 'Incorrect PIN');
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastSelected.length === 0 || !broadcastText.trim()) return;
    setSendingBroadcast(true);
    try {
      await apiRequest('/api/conversations/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          recipientIds: broadcastSelected,
          content: broadcastText.trim(),
        }),
      });
      setShowBroadcast(false);
      setBroadcastSelected([]);
      setBroadcastText('');
      onRefresh();
    } finally {
      setSendingBroadcast(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (filter === 'archived' && !c.isArchived) return false;
    if (filter !== 'archived' && c.isArchived) return false;
    if (filter === 'unread' && c.unreadCount === 0) return false;
    if (!search.trim()) return true;
    const name =
      c.type === 'group' ? c.group?.name || '' : c.peers[0]?.fullName || '';
    const msg = c.lastMessage?.content || '';
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      msg.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111B21]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t(language, 'chats')}
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={t(language, 'broadcast')}
            onClick={() => setShowBroadcast(true)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#202C33]"
          >
            <Radio className="w-5 h-5" />
          </button>
          <button
            type="button"
            title={t(language, 'newChat')}
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(language, 'searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Filter Segmented Tabs */}
      <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
        {(['all', 'unread', 'archived', 'starred'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              filter === tab
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#202C33] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2A3942]'
            }`}
          >
            {t(language, tab)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
        {filter === 'starred' ? (
          starredList.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <Star className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No starred messages yet.
            </div>
          ) : (
            starredList.map((item) => (
              <div key={item.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-emerald-600">
                    {item.senderName}
                  </span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  {item.content}
                </p>
              </div>
            ))
          )
        ) : loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t(language, 'noChatsTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(language, 'noChatsSub')}
            </p>
            <button
              type="button"
              onClick={() => setShowNewChat(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t(language, 'newChat')}</span>
            </button>
          </div>
        ) : (
          filtered.map((conv) => {
            const isGroup = conv.type === 'group';
            const peer = !isGroup ? conv.peers[0] : null;
            const name = isGroup
              ? conv.group?.name || 'Group'
              : peer?.fullName || 'SmartConnect User';
            const avatar = isGroup
              ? conv.group?.avatarUrl || null
              : peer?.avatarUrl || null;
            const isOnline = peer ? onlineUserIds.has(peer.userId) : false;
            const isSelected = conv.id === selectedConvId;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => handleConversationClick(conv)}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-emerald-50/90 dark:bg-[#2A3942]'
                    : 'hover:bg-slate-50 dark:hover:bg-[#202C33]'
                }`}
              >
                <Avatar
                  src={avatar}
                  name={name}
                  online={!isGroup && isOnline}
                  isGroup={isGroup}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      {name}
                      {conv.isLocked && <Lock className="w-3 h-3 text-amber-500" />}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {conv.lastMessage
                        ? new Date(conv.lastMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                      {conv.lastMessage?.deliveryStatus === 'read' && (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      )}
                      <span className="truncate">
                        {conv.isLocked
                          ? 'Locked chat · Tap to unlock'
                          : conv.lastMessage?.content || 'No messages yet'}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.isMuted && <BellOff className="w-3.5 h-3.5 text-slate-400" />}
                      {conv.isArchived && (
                        <Archive className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* New Chat / Global User Search Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Find Registered Users</h3>
              <button type="button" onClick={() => setShowNewChat(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                autoFocus
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by name, @username, mobile, or email..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {searchingUsers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                </div>
              ) : foundUsers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No other registered users matched your search.
                </p>
              ) : (
                foundUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202C33] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={u.avatarUrl}
                        name={u.fullName}
                        size="sm"
                        online={onlineUserIds.has(u.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          @{u.username} {u.mobileNumber ? `· ${u.mobileNumber}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!u.isContact && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest('/api/users/contacts', {
                              method: 'POST',
                              body: JSON.stringify({ contactUserId: u.id }),
                            });
                            setFoundUsers((prev) =>
                              prev.map((x) =>
                                x.id === u.id ? { ...x, isContact: true } : x
                              )
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          Save
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewChat(false);
                          onOpenDirectWithUser(u.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                      >
                        Chat
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcast && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSendBroadcast}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">New Broadcast Message</h3>
              <button type="button" onClick={() => setShowBroadcast(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
              {foundUsers.map((u) => {
                const checked = broadcastSelected.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#202C33] cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setBroadcastSelected((prev) =>
                          checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      className="accent-emerald-600"
                    />
                    <span>{u.fullName}</span>
                    <span className="text-xs text-slate-400">@{u.username}</span>
                  </label>
                );
              })}
            </div>
            <textarea
              rows={3}
              required
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              placeholder="Write broadcast announcement..."
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            />
            <button
              type="submit"
              disabled={sendingBroadcast || broadcastSelected.length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {sendingBroadcast
                ? 'Sending...'
                : `Send to ${broadcastSelected.length} Recipients`}
            </button>
          </form>
        </div>
      )}

      {/* Unlock Chat PIN Modal */}
      {lockedPromptConv && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockSubmit}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-xs w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" /> Unlock Chat
              </h3>
              <button type="button" onClick={() => setLockedPromptConv(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {unlockError && <p className="text-xs text-rose-500">{unlockError}</p>}
            <input
              type="password"
              required
              autoFocus
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value)}
              placeholder="Enter chat PIN"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm font-mono"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
            >
              Unlock
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
