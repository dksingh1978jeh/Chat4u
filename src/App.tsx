import React, { useEffect, useState, useCallback } from 'react';
import {
  MessageSquare,
  CircleDot,
  Users,
  Phone,
  Settings,
  ShieldAlert,
  Bell,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { apiRequest } from './lib/api.ts';
import { t } from './lib/i18n.ts';
import { SplashScreen } from './components/SplashScreen.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Avatar } from './components/Avatar.tsx';
import { ChatsTab } from './components/ChatsTab.tsx';
import { ChatRoom } from './components/ChatRoom.tsx';
import { UpdatesTab } from './components/UpdatesTab.tsx';
import { CommunitiesTab } from './components/CommunitiesTab.tsx';
import { CallsTab } from './components/CallsTab.tsx';
import { SettingsTab } from './components/SettingsTab.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { CallOverlay, type ActiveCallSession } from './components/CallOverlay.tsx';
import type { ConversationSummary, NavTab } from './types/index.ts';

function SmartConnectShell() {
  const {
    user,
    profile,
    loading,
    language,
    notifications,
    unreadNotifications,
    markAllNotificationsRead,
    subscribeWs,
  } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 950);
    return () => window.clearTimeout(timer);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setConvsLoading(true);
    try {
      const data = await apiRequest<{ conversations: ConversationSummary[] }>(
        '/api/conversations'
      );
      setConversations(data.conversations);
      setSelectedConv((prev) =>
        prev ? data.conversations.find((c) => c.id === prev.id) || prev : null
      );
    } catch {
      // ignore transient
    } finally {
      setConvsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadConversations();
    } else {
      setConversations([]);
      setSelectedConv(null);
    }
  }, [user, loadConversations]);

  // Listen to WebSocket events for conversation list & incoming calls
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeWs((event, payload) => {
      if (
        event === 'message:new' ||
        event === 'message:deleted' ||
        event === 'message:read' ||
        event === 'group:created'
      ) {
        loadConversations();
      } else if (event === 'call:incoming') {
        setActiveCall({
          callId: Number(payload.callId),
          direction: 'incoming',
          callType: payload.callType || 'audio',
          peerUserIds: [Number(payload.callerId)],
          conversationId: payload.conversationId ? Number(payload.conversationId) : null,
          displayName: payload.callerName || 'Incoming Call',
          avatarUrl: payload.callerAvatar || null,
          status: 'ringing',
        });
      }
    });
    return unsub;
  }, [user, subscribeWs, loadConversations]);

  const handleOpenDirectWithUser = async (targetUserId: number) => {
    const res = await apiRequest<{ conversationId: number }>(
      '/api/conversations/direct',
      {
        method: 'POST',
        body: JSON.stringify({ userId: targetUserId }),
      }
    );
    await loadConversations();
    const listData = await apiRequest<{ conversations: ConversationSummary[] }>(
      '/api/conversations'
    );
    const found = listData.conversations.find((c) => c.id === res.conversationId);
    if (found) {
      setSelectedConv(found);
      setActiveTab('chats');
    }
  };

  const handleOpenGroupConversation = async (conversationId: number) => {
    const listData = await apiRequest<{ conversations: ConversationSummary[] }>(
      '/api/conversations'
    );
    setConversations(listData.conversations);
    const found = listData.conversations.find((c) => c.id === conversationId);
    if (found) {
      setSelectedConv(found);
      setActiveTab('chats');
    }
  };

  const handleStartCall = async (
    type: 'audio' | 'video' | 'group_video',
    targetUserIds: number[],
    convId: number | null,
    displayName: string,
    avatarUrl: string | null
  ) => {
    const res = await apiRequest<{ call: { id: number } }>('/api/calls', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: convId,
        calleeId: targetUserIds[0] || null,
        calleeIds: targetUserIds,
        callType: type,
      }),
    });
    setActiveCall({
      callId: res.call.id,
      direction: 'outgoing',
      callType: type,
      peerUserIds: targetUserIds,
      conversationId: convId,
      displayName,
      avatarUrl,
      status: 'ringing',
    });
  };

  if (showSplash || loading) {
    return <SplashScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'chats', label: t(language, 'chats'), icon: <MessageSquare className="w-5 h-5" /> },
    { id: 'updates', label: t(language, 'updates'), icon: <CircleDot className="w-5 h-5" /> },
    {
      id: 'communities',
      label: t(language, 'communities'),
      icon: <Users className="w-5 h-5" />,
    },
    { id: 'calls', label: t(language, 'calls'), icon: <Phone className="w-5 h-5" /> },
    {
      id: 'settings',
      label: t(language, 'settings'),
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  const totalUnreadChats = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);

  return (
    <div className="h-dvh w-full flex flex-col md:flex-row bg-slate-100 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex flex-col items-center justify-between w-16 py-4 bg-slate-50 dark:bg-[#202C33] border-r border-slate-200 dark:border-slate-800 shrink-0 z-20">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/src/assets/images/smartconnect_brand_mark_1794902759940.jpg"
            alt="SmartConnect"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover shadow-xs mb-2"
          />
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => setActiveTab(item.id)}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === item.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#2A3942]'
              }`}
            >
              {item.icon}
              {item.id === 'chats' && totalUnreadChats > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalUnreadChats}
                </span>
              )}
            </button>
          ))}

          {user.role === 'admin' && (
            <button
              type="button"
              title={t(language, 'admin')}
              onClick={() => setActiveTab('admin')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === 'admin'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#2A3942]'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            title="Notifications"
            onClick={() => {
              setShowNotifs((s) => !s);
              if (!showNotifs) markAllNotificationsRead();
            }}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#2A3942]"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
          <button type="button" onClick={() => setActiveTab('settings')}>
            <Avatar
              src={profile?.avatarUrl}
              name={profile?.fullName || 'Me'}
              size="sm"
              online
            />
          </button>
        </div>
      </aside>

      {/* Mobile Top App Bar (hidden when inside active ChatRoom on mobile) */}
      {!(activeTab === 'chats' && selectedConv) && (
        <header className="md:hidden h-13 px-4 bg-white dark:bg-[#202C33] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <img
              src="/src/assets/images/smartconnect_brand_mark_1794902759940.jpg"
              alt="SmartConnect"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover"
            />
            <span className="font-bold text-base tracking-tight">SmartConnect</span>
          </div>
          <div className="flex items-center gap-1.5">
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300"
              >
                <ShieldAlert className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowNotifs((s) => !s);
                if (!showNotifs) markAllNotificationsRead();
              }}
              className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {activeTab === 'chats' && (
          <>
            <div
              className={`${
                selectedConv ? 'hidden md:flex' : 'flex'
              } w-full md:w-[360px] lg:w-[400px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex-col h-full`}
            >
              <ChatsTab
                conversations={conversations}
                selectedConvId={selectedConv?.id || null}
                loading={convsLoading}
                onSelectConversation={(conv) => setSelectedConv(conv)}
                onRefresh={loadConversations}
                onOpenDirectWithUser={handleOpenDirectWithUser}
              />
            </div>

            <div
              className={`${
                selectedConv ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 h-full flex-col`}
            >
              {selectedConv ? (
                <ChatRoom
                  key={selectedConv.id}
                  conversation={selectedConv}
                  allConversations={conversations}
                  onBack={() => setSelectedConv(null)}
                  onRefreshConversations={loadConversations}
                  onStartCall={handleStartCall}
                  onOpenChatByUserId={handleOpenDirectWithUser}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-[#222E35]">
                  <img
                    src="/src/assets/images/smartconnect_brand_mark_1794902759940.jpg"
                    alt="SmartConnect"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl shadow-md mb-4 opacity-90"
                  />
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    SmartConnect Web &amp; Mobile
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2">
                    Select a conversation on the left or click New Chat to message
                    anyone in real time with end-to-end encryption.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'updates' && (
          <div className="flex-1 h-full overflow-hidden">
            <UpdatesTab />
          </div>
        )}

        {activeTab === 'communities' && (
          <div className="flex-1 h-full overflow-hidden">
            <CommunitiesTab onOpenGroupConversation={handleOpenGroupConversation} />
          </div>
        )}

        {activeTab === 'calls' && (
          <div className="flex-1 h-full overflow-hidden">
            <CallsTab onStartCall={handleStartCall} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 h-full overflow-hidden">
            <SettingsTab
              onOpenAdmin={() => setActiveTab('admin')}
              conversations={conversations}
              onRefreshConversations={loadConversations}
            />
          </div>
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <div className="flex-1 h-full overflow-hidden">
            <AdminDashboard onBack={() => setActiveTab('chats')} />
          </div>
        )}
      </main>

      {/* Mobile Bottom 5-Tab Navigation Bar (hidden inside active chat room on mobile) */}
      {!(activeTab === 'chats' && selectedConv) && (
        <nav className="md:hidden h-16 bg-white/95 dark:bg-[#202C33]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center shrink-0 z-30">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 transition-colors ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {item.id === 'chats' && totalUnreadChats > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {totalUnreadChats}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Notifications Drawer */}
      {showNotifs && (
        <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white dark:bg-[#111B21] border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold">Notifications</h3>
            <button type="button" onClick={() => setShowNotifs(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600">{n.title}</span>
                    <span className="text-slate-400">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Global WebRTC Call Overlay */}
      {activeCall && (
        <CallOverlay call={activeCall} onClose={() => setActiveCall(null)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SmartConnectShell />
    </AuthProvider>
  );
}
