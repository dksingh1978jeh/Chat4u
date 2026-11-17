import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  QrCode,
  Shield,
  Lock,
  Laptop,
  LogOut,
  Moon,
  Sun,
  Globe,
  Volume2,
  UserCheck,
  Ban,
  ShieldAlert,
  Trash2,
  Check,
  X,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Loader2,
  Palette,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest, uploadMediaFile } from '../lib/api.ts';
import { playNotificationSound } from '../lib/sounds.ts';
import { t } from '../lib/i18n.ts';
import {
  WALLPAPER_GALLERY,
  resolveWallpaperStyle,
  getWallpaperLabel,
} from '../lib/wallpapers.ts';
import { Avatar } from './Avatar.tsx';
import type { ConversationSummary } from '../types/index.ts';

interface SettingsTabProps {
  onOpenAdmin: () => void;
  conversations?: ConversationSummary[];
  onRefreshConversations?: () => Promise<void> | void;
}

const AI_STYLE_OPTIONS = [
  'Organic Abstract',
  'Minimal Geometric',
  'Botanical Silhouette',
  'Atmospheric Gradient',
];

const AI_QUICK_PROMPTS = [
  'Soft misty bamboo forest at dawn',
  'Warm terracotta desert dunes at sunset',
  'Deep emerald ocean aurora waves',
  'Calm minimalist geometric sage linen',
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  onOpenAdmin,
  conversations = [],
  onRefreshConversations,
}) => {
  const { user, profile, theme, setTheme, language, setLanguage, refreshMe, logout } =
    useAuth();

  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || '');
  const [privacyPhoto, setPrivacyPhoto] = useState(
    profile?.privacyProfilePhoto || 'everyone'
  );
  const [privacyLastSeen, setPrivacyLastSeen] = useState(
    profile?.privacyLastSeen || 'everyone'
  );
  const [privacyReadReceipts, setPrivacyReadReceipts] = useState(
    profile?.privacyReadReceipts ?? true
  );
  const [privacyStatus, setPrivacyStatus] = useState(
    profile?.privacyStatus || 'everyone'
  );
  const [notifSound, setNotifSound] = useState(profile?.notificationSound || 'chime');

  const [sessions, setSessions] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);

  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const [show2faModal, setShow2faModal] = useState(false);
  const [twoFaPin, setTwoFaPin] = useState('');

  const [showSyncContacts, setShowSyncContacts] = useState(false);
  const [syncInput, setSyncInput] = useState('');
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [savedToast, setSavedToast] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Chat room custom wallpaper state
  const [selectedRoomTarget, setSelectedRoomTarget] = useState<string>('default');
  const [wallpaperTab, setWallpaperTab] = useState<'gallery' | 'ai' | 'upload'>('gallery');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState<string>(AI_STYLE_OPTIONS[0]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedUrl, setAiGeneratedUrl] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [wallpaperSaving, setWallpaperSaving] = useState(false);
  const wallpaperUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectedRoomTarget === 'default' && conversations.length > 0) {
      setSelectedRoomTarget(String(conversations[0].id));
    }
  }, [conversations, selectedRoomTarget]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setUsername(profile.username);
      setBio(profile.bio);
      setPrivacyPhoto(profile.privacyProfilePhoto);
      setPrivacyLastSeen(profile.privacyLastSeen);
      setPrivacyReadReceipts(profile.privacyReadReceipts);
      setPrivacyStatus(profile.privacyStatus);
      setNotifSound(profile.notificationSound);
    }
    if (user) {
      setMobileNumber(user.mobileNumber || '');
    }
  }, [profile, user]);

  const loadSecurityLists = async () => {
    try {
      const [sessData, blockData] = await Promise.all([
        apiRequest<{ sessions: any[] }>('/api/auth/sessions'),
        apiRequest<{ blocked: any[] }>('/api/users/blocked'),
      ]);
      setSessions(sessData.sessions);
      setBlockedUsers(blockData.blocked);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSecurityLists();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          username,
          bio,
          mobileNumber: mobileNumber || undefined,
          privacyProfilePhoto: privacyPhoto,
          privacyLastSeen,
          privacyReadReceipts,
          privacyStatus,
          notificationSound: notifSound,
        }),
      });
      await refreshMe();
      setSavedToast('Settings saved');
      setTimeout(() => setSavedToast(null), 2500);
    } catch (err: any) {
      setSavedToast(err.message || 'Save failed');
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const up = await uploadMediaFile(file);
    await apiRequest('/api/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: up.fileUrl }),
    });
    await refreshMe();
  };

  const handleOpenQr = async () => {
    const payload = JSON.stringify({
      app: 'SmartConnect',
      username: profile?.username,
      userId: user?.id,
    });
    const url = await QRCode.toDataURL(payload, { width: 240, margin: 2 });
    setQrDataUrl(url);
    setShowQr(true);
  };

  const handleEnablePush = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setSavedToast(
      perm === 'granted' ? 'Push alerts enabled!' : 'Notification permission declined'
    );
  };

  const handleSyncContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = syncInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await apiRequest<{ syncedCount: number }>('/api/users/contacts/sync', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
    setSyncResult(`Matched and synced ${res.syncedCount} SmartConnect contacts.`);
  };

  const getConversationTitle = (conv: ConversationSummary) => {
    if (conv.type === 'group') {
      return conv.group?.name || `Group #${conv.id}`;
    }
    return conv.peers[0]?.fullName || `Chat #${conv.id}`;
  };

  const selectedConversation =
    selectedRoomTarget === 'default'
      ? null
      : conversations.find((c) => String(c.id) === selectedRoomTarget) || null;

  const activeTargetWallpaper = selectedConversation
    ? selectedConversation.wallpaper
    : profile?.defaultWallpaper || 'default';

  const applyWallpaperToTarget = async (wallpaperValue: string, label: string) => {
    setWallpaperSaving(true);
    setAiError(null);
    try {
      if (selectedConversation) {
        await apiRequest(`/api/conversations/${selectedConversation.id}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({ wallpaper: wallpaperValue }),
        });
        if (onRefreshConversations) {
          await onRefreshConversations();
        }
        setSavedToast(
          `Applied "${label}" to ${getConversationTitle(selectedConversation)}`
        );
      } else {
        await apiRequest('/api/users/profile', {
          method: 'PATCH',
          body: JSON.stringify({ defaultWallpaper: wallpaperValue }),
        });
        await refreshMe();
        setSavedToast(`Applied "${label}" as default chat wallpaper`);
      }
      window.setTimeout(() => setSavedToast(null), 2800);
    } catch (err: any) {
      setAiError(err.message || 'Failed to apply wallpaper.');
    } finally {
      setWallpaperSaving(false);
    }
  };

  const handleGenerateAiWallpaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await apiRequest<{ fileUrl: string }>('/api/users/generate-wallpaper', {
        method: 'POST',
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          style: aiStyle,
        }),
      });
      setAiGeneratedUrl(res.fileUrl);
    } catch (err: any) {
      setAiError(err.message || 'AI wallpaper generation failed.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleCustomWallpaperUpload = async (file: File) => {
    setWallpaperSaving(true);
    setAiError(null);
    try {
      const up = await uploadMediaFile(file);
      await applyWallpaperToTarget(up.fileUrl, file.name || 'Custom Image');
    } catch (err: any) {
      setAiError(err.message || 'Image upload failed.');
      setWallpaperSaving(false);
    }
  };

  return (
    <div className="h-full bg-slate-50 dark:bg-[#0B141A] overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t(language, 'settingsTitle')}
          </h1>
          <div className="flex items-center gap-2">
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-medium flex items-center gap-1.5"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{t(language, 'adminDashboard')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4" />
              <span>{t(language, 'logout')}</span>
            </button>
          </div>
        </div>

        {savedToast && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4" /> {savedToast}
          </div>
        )}

        {/* Profile & QR Card */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar
                  src={profile?.avatarUrl}
                  name={profile?.fullName || 'User'}
                  size="xl"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-1.5 rounded-full bg-emerald-600 text-white shadow-md"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarUpload(f);
                  }}
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{profile?.fullName}</h2>
                <p className="text-xs text-slate-500">@{profile?.username}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenQr}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-[#202C33]"
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>Share QR</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSyncContacts(true)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-[#202C33]"
              >
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Sync Contacts</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Mobile Number</label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">About / Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
              />
            </div>
          </div>

          {/* Privacy Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>{t(language, 'privacySection')}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Profile Photo</label>
                <select
                  value={privacyPhoto}
                  onChange={(e) => setPrivacyPhoto(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
                >
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My Contacts</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Last Seen &amp; Online</label>
                <select
                  value={privacyLastSeen}
                  onChange={(e) => setPrivacyLastSeen(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
                >
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My Contacts</option>
                  <option value="nobody">Nobody</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Status Updates</label>
                <select
                  value={privacyStatus}
                  onChange={(e) => setPrivacyStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
                >
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My Contacts</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyReadReceipts}
                  onChange={(e) => setPrivacyReadReceipts(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span>Send Read Receipts (blue ticks)</span>
              </label>

              <button
                type="button"
                onClick={() => setShow2faModal(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#202C33] font-medium flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  2FA: {user?.twoFactorEnabled ? 'Enabled (Configure)' : 'Off (Enable)'}
                </span>
              </button>
            </div>
          </div>

          {/* Sounds & Save */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <select
                value={notifSound}
                onChange={(e) => {
                  setNotifSound(e.target.value);
                  playNotificationSound(e.target.value);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#202C33]"
              >
                <option value="chime">Chime</option>
                <option value="ripple">Ripple</option>
                <option value="bell">Bell</option>
                <option value="silent">Silent</option>
              </select>
              <button
                type="button"
                onClick={handleEnablePush}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700"
              >
                Enable Desktop Alerts
              </button>
            </div>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              {t(language, 'saveChanges')}
            </button>
          </div>
        </form>

        {/* Appearance & Language */}
        <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-xs font-medium flex items-center gap-2"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
              <span>{theme === 'dark' ? t(language, 'lightMode') : t(language, 'darkMode')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>{t(language, 'languageLabel')}:</span>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-lg font-medium ${
                language === 'en'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#202C33]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={`px-3 py-1.5 rounded-lg font-medium ${
                language === 'hi'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#202C33]'
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>

        {/* Chat Room Wallpapers (Gallery, AI Generator & Custom Upload) */}
        <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>Chat Room Backgrounds</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick any individual chat room and customize its background from the gallery, upload an image, or generate one with AI.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#202C33] text-[11px] font-medium text-slate-600 dark:text-slate-300 self-start sm:self-auto whitespace-nowrap">
              Active: {getWallpaperLabel(activeTargetWallpaper)}
            </span>
          </div>

          {/* Chat Room Selector + Live Preview */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            <div className="md:col-span-3 space-y-3 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Target Chat Room
                </label>
                <div className="relative">
                  <select
                    value={selectedRoomTarget}
                    onChange={(e) => setSelectedRoomTarget(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202C33] text-xs font-medium border border-slate-200/70 dark:border-slate-700/70 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {conversations.map((conv) => (
                      <option key={conv.id} value={String(conv.id)}>
                        {conv.type === 'group' ? 'Group: ' : 'Chat: '}
                        {getConversationTitle(conv)} ({getWallpaperLabel(conv.wallpaper)})
                      </option>
                    ))}
                    <option value="default">
                      Default for All Unstyled Chats ({getWallpaperLabel(profile?.defaultWallpaper)})
                    </option>
                  </select>
                </div>
                {conversations.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Start a conversation in Chats to customize individual rooms—meanwhile you can set your default wallpaper.
                    </span>
                  </p>
                )}
              </div>

              {/* Mode Switcher */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWallpaperTab('gallery')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    wallpaperTab === 'gallery'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-[#202C33] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-[#2A3942]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Default Gallery</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWallpaperTab('ai')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    wallpaperTab === 'ai'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-[#202C33] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-[#2A3942]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Generator</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWallpaperTab('upload')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    wallpaperTab === 'upload'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-[#202C33] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-[#2A3942]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            {/* Live Chat Bubble Preview */}
            <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-[140px]">
              <div className="px-3 py-1.5 bg-slate-100 dark:bg-[#202C33] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <span className="truncate">
                  {selectedConversation
                    ? getConversationTitle(selectedConversation)
                    : 'Default Chat Preview'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  Live Preview
                </span>
              </div>
              <div
                className="flex-1 p-3 flex flex-col justify-end gap-2 bg-slate-50 dark:bg-[#0B141A]"
                style={resolveWallpaperStyle(
                  wallpaperTab === 'ai' && aiGeneratedUrl
                    ? aiGeneratedUrl
                    : activeTargetWallpaper,
                  profile?.defaultWallpaper
                )}
              >
                <div className="self-start max-w-[82%] px-3 py-1.5 rounded-xl rounded-tl-xs bg-white/95 dark:bg-[#202C33]/95 text-slate-900 dark:text-slate-100 text-[11px] shadow-xs">
                  Hey! How does this chat background look?
                </div>
                <div className="self-end max-w-[82%] px-3 py-1.5 rounded-xl rounded-tr-xs bg-[#D9FDD3]/95 dark:bg-[#005C4B]/95 text-slate-900 dark:text-white text-[11px] shadow-xs">
                  Crisp and super easy to read!
                </div>
              </div>
            </div>
          </div>

          {aiError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs">
              {aiError}
            </div>
          )}

          {/* Tab 1: Default Gallery */}
          {wallpaperTab === 'gallery' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {WALLPAPER_GALLERY.map((preset) => {
                const isSelected = activeTargetWallpaper === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={wallpaperSaving}
                    onClick={() => applyWallpaperToTarget(preset.id, preset.label)}
                    className={`group p-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                    }`}
                  >
                    <div
                      className="h-20 rounded-lg mb-2 bg-slate-100 dark:bg-[#202C33] bg-cover bg-center relative overflow-hidden border border-slate-200/60 dark:border-slate-700/60"
                      style={
                        preset.url
                          ? { backgroundImage: `url(${preset.url})` }
                          : preset.bg
                            ? { backgroundColor: preset.bg }
                            : undefined
                      }
                    >
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {preset.label}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab 2: AI Wallpaper Generator */}
          {wallpaperTab === 'ai' && (
            <form onSubmit={handleGenerateAiWallpaper} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">
                    Describe your chat background
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={400}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Soft misty eucalyptus leaves at sunrise..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202C33] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Art Style</label>
                  <select
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-[#202C33] text-xs"
                  >
                    {AI_STYLE_OPTIONS.map((styleOpt) => (
                      <option key={styleOpt} value={styleOpt}>
                        {styleOpt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 mr-1">Ideas:</span>
                {AI_QUICK_PROMPTS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setAiPrompt(idea)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#202C33] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-[11px] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition-colors"
                  >
                    {idea}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-colors"
                >
                  {aiGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{aiGenerating ? 'Generating...' : 'Generate AI Background'}</span>
                </button>

                {aiGeneratedUrl && (
                  <>
                    <button
                      type="button"
                      disabled={wallpaperSaving}
                      onClick={() =>
                        applyWallpaperToTarget(aiGeneratedUrl, 'AI Generated Wallpaper')
                      }
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:opacity-90 transition-opacity"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        Apply to{' '}
                        {selectedConversation
                          ? getConversationTitle(selectedConversation)
                          : 'Default'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiGeneratedUrl(null)}
                      className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Discard Preview
                    </button>
                  </>
                )}
              </div>

              {aiGeneratedUrl && (
                <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-3">
                  <img
                    src={aiGeneratedUrl}
                    alt="AI generated chat wallpaper"
                    className="w-20 h-24 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      AI Background Ready
                    </p>
                    <p className="text-slate-500">
                      Previewed in the live chat window above. Click Apply to save it to your selected chat room.
                    </p>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Tab 3: Upload Custom Image */}
          {wallpaperTab === 'upload' && (
            <div className="p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0B141A]/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Upload a Custom Photo or Artwork
                </p>
                <p className="text-[11px] text-slate-500">
                  Choose a PNG, JPG, or WebP from your device to apply to{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {selectedConversation
                      ? getConversationTitle(selectedConversation)
                      : 'Default Chat Wallpaper'}
                  </span>
                  .
                </p>
              </div>
              <input
                ref={wallpaperUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCustomWallpaperUpload(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={wallpaperSaving}
                onClick={() => wallpaperUploadRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
              >
                {wallpaperSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>Choose Image &amp; Apply</span>
              </button>
            </div>
          )}
        </div>

        {/* Linked Devices & Active Sessions */}
        <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Laptop className="w-4 h-4 text-emerald-600" />
            <span>{t(language, 'devicesSection')}</span>
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions
              .filter((s) => s.isActive)
              .map((s) => (
                <div
                  key={s.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold">
                      {s.deviceName}{' '}
                      {s.isCurrent && (
                        <span className="text-emerald-600">(This device)</span>
                      )}
                    </p>
                    <p className="text-slate-500 font-mono">
                      Last active: {new Date(s.lastActiveAt).toLocaleString()}
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/auth/sessions/${s.id}`, {
                          method: 'DELETE',
                        });
                        loadSecurityLists();
                      }}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Blocked Users */}
        {blockedUsers.length > 0 && (
          <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-500" />
              <span>Blocked Users</span>
            </h3>
            {blockedUsers.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-xs py-1.5"
              >
                <span>
                  {b.fullName} (@{b.username})
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/users/block/${b.blockedId}`, {
                      method: 'DELETE',
                    });
                    loadSecurityLists();
                  }}
                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#202C33]"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-xs w-full p-6 text-center space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">QR Profile Share</h3>
              <button type="button" onClick={() => setShowQr(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="Profile QR Code" className="mx-auto rounded-xl" />
            )}
            <p className="text-xs text-slate-500">
              @{profile?.username} · Scan to find me on SmartConnect
            </p>
          </div>
        </div>
      )}

      {/* 2FA PIN Modal */}
      {show2faModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiRequest('/api/auth/2fa', {
                method: 'POST',
                body: JSON.stringify({ enabled: true, pin: twoFaPin }),
              });
              await refreshMe();
              setShow2faModal(false);
              setTwoFaPin('');
            }}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-xs w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <h3 className="font-semibold">Two-Step Verification</h3>
            <input
              type="password"
              required
              minLength={4}
              maxLength={6}
              value={twoFaPin}
              onChange={(e) => setTwoFaPin(e.target.value)}
              placeholder="New 4–6 digit PIN"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] font-mono text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              {user?.twoFactorEnabled && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest('/api/auth/2fa', {
                      method: 'POST',
                      body: JSON.stringify({ enabled: false }),
                    });
                    await refreshMe();
                    setShow2faModal(false);
                  }}
                  className="text-xs text-rose-500"
                >
                  Disable 2FA
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShow2faModal(false)}
                  className="px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-medium"
                >
                  Save PIN
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Contact Sync Modal */}
      {showSyncContacts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSyncContacts}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Sync Contacts (Permission Required)</h3>
              <button type="button" onClick={() => setShowSyncContacts(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter mobile numbers or emails (one per line) to find registered contacts on
              SmartConnect.
            </p>
            <textarea
              rows={4}
              required
              value={syncInput}
              onChange={(e) => setSyncInput(e.target.value)}
              placeholder="+919876543210&#10;friend@example.com"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-xs font-mono"
            />
            {syncResult && <p className="text-xs text-emerald-600">{syncResult}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-medium"
            >
              Allow &amp; Sync Contacts
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
