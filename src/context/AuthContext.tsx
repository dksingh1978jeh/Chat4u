import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiRequest, getAuthToken, setAuthToken } from '../lib/api.ts';
import { ensureUserE2EKeys } from '../lib/crypto.ts';
import { playNotificationSound } from '../lib/sounds.ts';
import type {
  UserAccount,
  UserProfile,
  Language,
  ThemeMode,
  AppNotification,
} from '../types/index.ts';

type WsListener = (event: string, payload: any) => void;

interface AuthContextValue {
  user: UserAccount | null;
  profile: UserProfile | null;
  loading: boolean;
  language: Language;
  theme: ThemeMode;
  onlineUserIds: Set<number>;
  notifications: AppNotification[];
  unreadNotifications: number;
  setSessionData: (token: string, user: UserAccount, profile: UserProfile) => void;
  refreshMe: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
  sendWs: (event: string, payload: unknown) => void;
  subscribeWs: (listener: WsListener) => () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [language, setLanguageState] = useState<Language>('en');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<WsListener>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  const applyThemeClass = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('sc_theme', mode);
  }, []);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('sc_theme') as ThemeMode) || 'light';
    applyThemeClass(savedTheme);
    const savedLang = (localStorage.getItem('sc_lang') as Language) || 'en';
    setLanguageState(savedLang);
  }, [applyThemeClass]);

  const subscribeWs = useCallback((listener: WsListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const sendWs = useCallback((event: string, payload: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const data = await apiRequest<{ notifications: AppNotification[] }>(
        '/api/users/notifications'
      );
      setNotifications(data.notifications);
      setUnreadNotifications(data.notifications.filter((n) => !n.isRead).length);
    } catch {
      // ignore transient errors
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiRequest('/api/users/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifications(0);
    } catch {
      // ignore
    }
  }, []);

  const initE2EForUser = useCallback(async (u: UserAccount) => {
    try {
      const { publicKeyJwk, needsUpload } = await ensureUserE2EKeys(
        u.id,
        u.e2ePublicKey
      );
      if (needsUpload) {
        await apiRequest('/api/auth/e2e-keys', {
          method: 'POST',
          body: JSON.stringify({ publicKey: publicKeyJwk }),
        });
      }
    } catch (err) {
      console.error('E2E key init failed:', err);
    }
  }, []);

  const connectWebSocket = useCallback(
    (token: string) => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const { event, payload } = JSON.parse(evt.data);
          if (event === 'ws:ready' && Array.isArray(payload?.onlineUserIds)) {
            setOnlineUserIds(new Set(payload.onlineUserIds.map(Number)));
          } else if (event === 'presence:update') {
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              if (payload.onlineStatus === 'online') next.add(Number(payload.userId));
              else next.delete(Number(payload.userId));
              return next;
            });
          } else if (event === 'notification:new') {
            setNotifications((prev) => [payload, ...prev]);
            setUnreadNotifications((c) => c + 1);
            playNotificationSound(profileRef.current?.notificationSound || 'chime');
            if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted' &&
              document.hidden
            ) {
              new Notification(payload.title || 'SmartConnect', {
                body: payload.body,
              });
            }
          } else if (event === 'session:revoked') {
            setAuthToken(null);
            setUser(null);
            setProfile(null);
          }

          for (const listener of listenersRef.current) {
            listener(event, payload);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = (ev) => {
        if (ev.code !== 4001 && getAuthToken()) {
          reconnectTimerRef.current = window.setTimeout(() => {
            const latestToken = getAuthToken();
            if (latestToken) connectWebSocket(latestToken);
          }, 2500);
        }
      };
    },
    []
  );

  const setSessionData = useCallback(
    (token: string, u: UserAccount, p: UserProfile) => {
      setAuthToken(token, true);
      setUser(u);
      setProfile(p);
      if (p?.theme) applyThemeClass(p.theme);
      if (p?.language) setLanguageState(p.language);
      initE2EForUser(u);
      connectWebSocket(token);
      refreshNotifications();
    },
    [applyThemeClass, connectWebSocket, initE2EForUser, refreshNotifications]
  );

  const refreshMe = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{
        user: UserAccount;
        profile: UserProfile;
        unreadNotificationsCount: number;
      }>('/api/auth/me');
      setUser(data.user);
      setProfile(data.profile);
      setUnreadNotifications(data.unreadNotificationsCount || 0);
      if (data.profile?.theme) applyThemeClass(data.profile.theme);
      if (data.profile?.language) setLanguageState(data.profile.language);
      initE2EForUser(data.user);
      connectWebSocket(token);
      refreshNotifications();
    } catch {
      setAuthToken(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [applyThemeClass, connectWebSocket, initE2EForUser, refreshNotifications]);

  useEffect(() => {
    refreshMe();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, [refreshMe]);

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    const data = await apiRequest<{
      token: string;
      user: UserAccount;
      profile: UserProfile;
    }>('/api/auth/firebase', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    setSessionData(data.token, data.user, data.profile);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    if (wsRef.current) {
      wsRef.current.close(4001, 'Logged out');
      wsRef.current = null;
    }
    setAuthToken(null);
    setUser(null);
    setProfile(null);
  };

  const setTheme = async (mode: ThemeMode) => {
    applyThemeClass(mode);
    if (user) {
      try {
        const res = await apiRequest<{ profile: UserProfile }>(
          '/api/users/profile',
          {
            method: 'PATCH',
            body: JSON.stringify({ theme: mode }),
          }
        );
        setProfile(res.profile);
      } catch {
        // ignore
      }
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sc_lang', lang);
    if (user) {
      try {
        const res = await apiRequest<{ profile: UserProfile }>(
          '/api/users/profile',
          {
            method: 'PATCH',
            body: JSON.stringify({ language: lang }),
          }
        );
        setProfile(res.profile);
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        language,
        theme,
        onlineUserIds,
        notifications,
        unreadNotifications,
        setSessionData,
        refreshMe,
        refreshNotifications,
        markAllNotificationsRead,
        loginWithGoogle,
        logout,
        setTheme,
        setLanguage,
        sendWs,
        subscribeWs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
