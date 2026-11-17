import React, { useEffect, useState, useRef } from 'react';
import {
  Plus,
  Image as ImageIcon,
  Type,
  Eye,
  Trash2,
  Send,
  X,
  Lock,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest, uploadMediaFile } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { Avatar } from './Avatar.tsx';
import type { StatusItem } from '../types/index.ts';

const BG_COLORS = ['#064E3B', '#0F766E', '#1E3A8A', '#7C2D12', '#581C87', '#1E293B'];

export const UpdatesTab: React.FC = () => {
  const { user, profile, language } = useAuth();
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('text');
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [privacy, setPrivacy] = useState<'everyone' | 'contacts'>('everyone');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [viewing, setViewing] = useState<StatusItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadStatuses = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ statuses: StatusItem[] }>('/api/status');
      setStatuses(data.statuses);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
  }, []);

  const handleFilePick = async (file: File) => {
    setPosting(true);
    try {
      const up = await uploadMediaFile(file);
      setMediaUrl(up.fileUrl);
      setMediaType(up.fileType === 'video' ? 'video' : 'image');
    } finally {
      setPosting(false);
    }
  };

  const handlePostStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    try {
      await apiRequest('/api/status', {
        method: 'POST',
        body: JSON.stringify({
          mediaType,
          content,
          mediaUrl,
          bgColor,
          privacy,
        }),
      });
      setShowCreate(false);
      setContent('');
      setMediaUrl(null);
      setMediaType('text');
      loadStatuses();
    } finally {
      setPosting(false);
    }
  };

  const handleOpenStatus = async (st: StatusItem) => {
    setViewing(st);
    if (st.userId !== user?.id) {
      await apiRequest(`/api/status/${st.id}/view`, { method: 'POST' }).catch(() => {});
    }
  };

  const handleReactOrReply = async (emoji?: string) => {
    if (!viewing) return;
    await apiRequest(`/api/status/${viewing.id}/react`, {
      method: 'POST',
      body: JSON.stringify({
        emoji: emoji || null,
        replyText: replyText.trim() || null,
      }),
    });
    setReplyText('');
    loadStatuses();
  };

  const myStatuses = statuses.filter((s) => s.userId === user?.id);
  const friendStatuses = statuses.filter((s) => s.userId !== user?.id);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111B21] overflow-y-auto">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t(language, 'statusTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(language, 'expiresIn24h')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{t(language, 'addStatus')}</span>
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* My Status Section */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t(language, 'myStatus')}
          </h2>
          {myStatuses.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-[#202C33] transition-colors text-left"
            >
              <Avatar src={profile?.avatarUrl} name={profile?.fullName || 'Me'} />
              <div>
                <p className="text-sm font-semibold">Tap to add a status update</p>
                <p className="text-xs text-slate-500">
                  Share text, photo, or video for 24 hours
                </p>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              {myStatuses.map((st) => (
                <div
                  key={st.id}
                  onClick={() => handleOpenStatus(st)}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-[#202C33] flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#2A3942]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-full ring-2 ring-emerald-500 flex items-center justify-center text-white text-xs font-semibold overflow-hidden shrink-0"
                      style={{ backgroundColor: st.bgColor }}
                    >
                      {st.mediaUrl && st.mediaType === 'image' ? (
                        <img
                          src={st.mediaUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        st.content.slice(0, 2).toUpperCase() || 'ST'
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {st.content || `${st.mediaType} status`}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-2 tabular-nums">
                        <span>
                          {new Date(st.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {st.viewsCount}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await apiRequest(`/api/status/${st.id}`, { method: 'DELETE' });
                      loadStatuses();
                    }}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Friends' Updates */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t(language, 'recentUpdates')}
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            </div>
          ) : friendStatuses.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No active updates from contacts right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {friendStatuses.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleOpenStatus(st)}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 flex items-center gap-3 text-left transition-colors"
                >
                  <div className="p-0.5 rounded-full ring-2 ring-emerald-500">
                    <Avatar src={st.authorAvatar} name={st.authorName} size="md" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{st.authorName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {st.content || `Shared a ${st.mediaType}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Create Status Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handlePostStatus}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Create 24-Hour Status</h3>
              <button type="button" onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMediaType('text');
                  setMediaUrl(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 ${
                  mediaType === 'text'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-[#202C33]'
                }`}
              >
                <Type className="w-4 h-4" /> Text Status
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 ${
                  mediaType !== 'text'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-[#202C33]'
                }`}
              >
                <ImageIcon className="w-4 h-4" /> Photo / Video
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePick(f);
                }}
              />
            </div>

            {mediaType === 'text' ? (
              <div
                className="rounded-2xl p-6 min-h-[180px] flex items-center justify-center"
                style={{ backgroundColor: bgColor }}
              >
                <textarea
                  rows={4}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type a status..."
                  className="w-full bg-transparent text-white placeholder-white/60 text-center text-lg font-semibold focus:outline-none resize-none"
                />
              </div>
            ) : (
              <div className="space-y-2">
                {mediaUrl && mediaType === 'image' && (
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="max-h-56 mx-auto rounded-xl object-cover"
                  />
                )}
                {mediaUrl && mediaType === 'video' && (
                  <video src={mediaUrl} controls className="max-h-56 mx-auto rounded-xl" />
                )}
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Add a caption (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
                />
              </div>
            )}

            {mediaType === 'text' && (
              <div className="flex items-center gap-2">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBgColor(c)}
                    className={`w-7 h-7 rounded-full border-2 ${
                      bgColor === c ? 'border-emerald-500 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-slate-500">
                <Lock className="w-3.5 h-3.5" /> Privacy:
              </span>
              <select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as 'everyone' | 'contacts')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#202C33]"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts Only</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={posting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium"
            >
              {posting ? 'Posting...' : 'Share Status'}
            </button>
          </form>
        </div>
      )}

      {/* Fullscreen Story Viewer */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between p-6 text-white"
          style={{ backgroundColor: viewing.mediaType === 'text' ? viewing.bgColor : '#0B141A' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar src={viewing.authorAvatar} name={viewing.authorName} size="sm" />
              <div>
                <p className="text-sm font-semibold">{viewing.authorName}</p>
                <p className="text-xs opacity-75">
                  {new Date(viewing.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="p-2 rounded-full bg-black/30 hover:bg-black/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center my-4">
            {viewing.mediaType === 'image' && viewing.mediaUrl && (
              <img
                src={viewing.mediaUrl}
                alt=""
                className="max-h-[65vh] rounded-2xl object-contain"
              />
            )}
            {viewing.mediaType === 'video' && viewing.mediaUrl && (
              <video
                src={viewing.mediaUrl}
                controls
                autoPlay
                className="max-h-[65vh] rounded-2xl"
              />
            )}
            {viewing.content && (
              <p className="mt-4 text-center text-xl font-semibold max-w-lg">
                {viewing.content}
              </p>
            )}
          </div>

          <div className="max-w-md mx-auto w-full space-y-3">
            <div className="flex items-center justify-center gap-3">
              {['❤️', '😂', '😮', '👏', '🔥'].map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => handleReactOrReply(emo)}
                  className="text-2xl hover:scale-125 transition-transform bg-black/25 rounded-full w-10 h-10 flex items-center justify-center"
                >
                  {emo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to status..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/15 placeholder-white/60 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleReactOrReply()}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
