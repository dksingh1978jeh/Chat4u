import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Phone,
  Video,
  Search,
  MoreVertical,
  Send,
  Smile,
  Paperclip,
  Mic,
  Square,
  Lock,
  Pin,
  Star,
  Reply,
  Forward,
  Copy,
  Trash2,
  Edit3,
  Languages,
  Check,
  CheckCheck,
  FileText,
  Download,
  MapPin,
  UserPlus,
  BarChart2,
  Image as ImageIcon,
  ShieldAlert,
  Ban,
  Timer,
  Palette,
  BellOff,
  Bell,
  Archive,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest, uploadMediaFile } from '../lib/api.ts';
import { encryptForPeer, decryptFromPeer } from '../lib/crypto.ts';
import { t } from '../lib/i18n.ts';
import { Avatar } from './Avatar.tsx';
import {
  WALLPAPER_GALLERY,
  resolveWallpaperStyle,
  getWallpaperLabel,
  isImageUrlWallpaper,
} from '../lib/wallpapers.ts';
import {
  buildChatExportDocument,
  formatChatExportAsJson,
  formatChatExportAsText,
  getConversationDisplayTitle,
  sanitizeExportFilename,
  triggerLocalFileDownload,
  type ExportFormat,
} from '../lib/exportChat.ts';
import type { ChatMessage, ConversationSummary } from '../types/index.ts';

interface ChatRoomProps {
  conversation: ConversationSummary;
  allConversations: ConversationSummary[];
  onBack: () => void;
  onRefreshConversations: () => void;
  onStartCall: (
    type: 'audio' | 'video' | 'group_video',
    targetUserIds: number[],
    convId: number,
    displayName: string,
    avatarUrl: string | null
  ) => void;
  onOpenChatByUserId: (userId: number) => void;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '✅', '🚀', '💯'];

export const ChatRoom: React.FC<ChatRoomProps> = ({
  conversation,
  allConversations,
  onBack,
  onRefreshConversations,
  onStartCall,
  onOpenChatByUserId,
}) => {
  const { user, profile, language, theme, onlineUserIds, sendWs, subscribeWs } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const [peerTyping, setPeerTyping] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<number | null>(null);

  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const [showContactShareModal, setShowContactShareModal] = useState(false);
  const [contactsList, setContactsList] = useState<any[]>([]);

  const [showLockModal, setShowLockModal] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or abuse');
  const [reportDetails, setReportDetails] = useState('');

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [exportIncludeDeleted, setExportIncludeDeleted] = useState(true);
  const [exportIncludeDetails, setExportIncludeDetails] = useState(true);
  const [exporting, setExporting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const isGroup = conversation.type === 'group';
  const primaryPeer = !isGroup ? conversation.peers[0] : null;
  const displayName = isGroup
    ? conversation.group?.name || 'Group Chat'
    : primaryPeer?.fullName || 'SmartConnect User';
  const displayAvatar = isGroup
    ? conversation.group?.avatarUrl || null
    : primaryPeer?.avatarUrl || null;
  const isPeerOnline = primaryPeer ? onlineUserIds.has(primaryPeer.userId) : false;

  const hydrateDecrypted = useCallback(
    async (list: ChatMessage[]): Promise<ChatMessage[]> => {
      if (!user || isGroup || !primaryPeer?.e2ePublicKey) return list;
      const out = await Promise.all(
        list.map(async (m) => {
          if (m.isEncrypted && m.encryptedPayload && !m.isDeleted) {
            const plain = await decryptFromPeer(
              user.id,
              primaryPeer.e2ePublicKey!,
              m.encryptedPayload
            );
            return { ...m, decryptedText: plain || m.content };
          }
          return m;
        })
      );
      return out;
    },
    [user, isGroup, primaryPeer?.e2ePublicKey]
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ messages: ChatMessage[] }>(
        `/api/conversations/${conversation.id}/messages`
      );
      const hydrated = await hydrateDecrypted(data.messages);
      setMessages(hydrated);
      await apiRequest(`/api/conversations/${conversation.id}/read`, {
        method: 'POST',
      });
      onRefreshConversations();
    } catch (err: any) {
      setStatusFeedback(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [conversation.id, hydrateDecrypted, onRefreshConversations]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const unsub = subscribeWs(async (event, payload) => {
      if (event === 'message:new' && Number(payload?.conversationId) === conversation.id) {
        const [hydrated] = await hydrateDecrypted([payload.message]);
        setMessages((prev) => {
          if (prev.some((m) => m.id === hydrated.id)) return prev;
          return [...prev, hydrated];
        });
        apiRequest(`/api/conversations/${conversation.id}/read`, { method: 'POST' }).catch(
          () => {}
        );
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } else if (
        event === 'message:updated' &&
        Number(payload?.conversationId) === conversation.id
      ) {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.message.id ? { ...m, ...payload.message } : m))
        );
      } else if (
        event === 'message:deleted' &&
        Number(payload?.conversationId) === conversation.id
      ) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, isDeleted: true, content: 'This message was deleted', attachments: [] }
              : m
          )
        );
      } else if (
        event === 'message:reaction' &&
        Number(payload?.conversationId) === conversation.id
      ) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m
          )
        );
      } else if (
        event === 'message:read' &&
        Number(payload?.conversationId) === conversation.id
      ) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === user?.id ? { ...m, deliveryStatus: 'read' } : m
          )
        );
      } else if (
        event === 'typing:start' &&
        Number(payload?.conversationId) === conversation.id &&
        Number(payload?.userId) !== user?.id
      ) {
        setPeerTyping(true);
      } else if (
        event === 'typing:stop' &&
        Number(payload?.conversationId) === conversation.id &&
        Number(payload?.userId) !== user?.id
      ) {
        setPeerTyping(false);
      }
    });
    return unsub;
  }, [conversation.id, hydrateDecrypted, subscribeWs, user?.id]);

  const handleTypingChange = (val: string) => {
    setText(val);
    sendWs('typing:start', { conversationId: conversation.id });
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      sendWs('typing:stop', { conversationId: conversation.id });
    }, 1500);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    if (editingMsg) {
      setSending(true);
      try {
        await apiRequest(`/api/conversations/messages/${editingMsg.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: trimmed }),
        });
        setEditingMsg(null);
        setText('');
      } catch (err: any) {
        setStatusFeedback(err.message);
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    try {
      let encryptedPayload: string | null = null;
      let isEncrypted = false;
      let payloadContent = trimmed;

      if (!isGroup && primaryPeer?.e2ePublicKey && user) {
        const cipher = await encryptForPeer(user.id, primaryPeer.e2ePublicKey, trimmed);
        if (cipher) {
          encryptedPayload = cipher;
          isEncrypted = true;
          payloadContent = '🔒 End-to-end encrypted message';
        }
      }

      const res = await apiRequest<{ message: ChatMessage }>(
        `/api/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'text',
            content: payloadContent,
            encryptedPayload,
            isEncrypted,
            replyToMessageId: replyTo?.id || null,
          }),
        }
      );

      const hydrated = {
        ...res.message,
        decryptedText: trimmed,
      };
      setMessages((prev) =>
        prev.some((m) => m.id === hydrated.id) ? prev : [...prev, hydrated]
      );
      setText('');
      setReplyTo(null);
      sendWs('typing:stop', { conversationId: conversation.id });
      onRefreshConversations();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (err: any) {
      setStatusFeedback(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setSending(true);
    setShowAttachMenu(false);
    try {
      const uploaded = await uploadMediaFile(file);
      const res = await apiRequest<{ message: ChatMessage }>(
        `/api/conversations/${conversation.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: uploaded.fileType,
            content: uploaded.fileName,
            attachments: [uploaded],
          }),
        }
      );
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      onRefreshConversations();
    } catch (err: any) {
      setStatusFeedback(err.message || 'Upload failed');
    } finally {
      setSending(false);
    }
  };

  const toggleVoiceRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setSending(true);
        try {
          const uploaded = await uploadMediaFile(blob, `voice-${Date.now()}.webm`);
          const res = await apiRequest<{ message: ChatMessage }>(
            `/api/conversations/${conversation.id}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({
                type: 'audio',
                content: 'Voice message',
                attachments: [{ ...uploaded, durationSeconds: recordSeconds }],
              }),
            }
          );
          setMessages((prev) =>
            prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
          );
        } catch (err: any) {
          setStatusFeedback(err.message || 'Voice note upload failed');
        } finally {
          setSending(false);
          setRecordSeconds(0);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000
      );
    } catch {
      setStatusFeedback('Microphone access denied or unavailable.');
    }
  };

  const handleShareLocation = () => {
    setShowAttachMenu(false);
    if (!navigator.geolocation) {
      setStatusFeedback('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const res = await apiRequest<{ message: ChatMessage }>(
          `/api/conversations/${conversation.id}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              type: 'location',
              content: `Live Location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
              metadataJson: { latitude, longitude },
            }),
          }
        );
        setMessages((prev) => [...prev, res.message]);
      },
      () => setStatusFeedback('Location permission denied.')
    );
  };

  const handleOpenContactShare = async () => {
    setShowAttachMenu(false);
    try {
      const data = await apiRequest<{ contacts: any[] }>('/api/users/contacts');
      setContactsList(data.contacts);
      setShowContactShareModal(true);
    } catch {
      setStatusFeedback('Failed to load contacts');
    }
  };

  const handleSendContact = async (c: any) => {
    setShowContactShareModal(false);
    const res = await apiRequest<{ message: ChatMessage }>(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'contact',
          content: c.fullName,
          metadataJson: {
            userId: c.userId,
            fullName: c.fullName,
            username: c.username,
            mobileNumber: c.mobileNumber,
          },
        }),
      }
    );
    setMessages((prev) => [...prev, res.message]);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || validOpts.length < 2) return;
    const res = await apiRequest<{ message: ChatMessage }>(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'poll',
          content: pollQuestion.trim(),
          metadataJson: {
            question: pollQuestion.trim(),
            options: validOpts.map((textOpt) => ({ text: textOpt, votes: [] })),
          },
        }),
      }
    );
    setMessages((prev) => [...prev, res.message]);
    setShowPollModal(false);
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const handleVotePoll = async (messageId: number, optionIndex: number) => {
    try {
      await apiRequest(`/api/conversations/polls/${messageId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionIndex }),
      });
    } catch (err: any) {
      setStatusFeedback(err.message);
    }
  };

  const handleReact = async (messageId: number, emoji: string) => {
    setActiveMsgMenu(null);
    await apiRequest(`/api/conversations/messages/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  };

  const handleTranslate = async (msg: ChatMessage) => {
    setActiveMsgMenu(null);
    const sourceText = msg.decryptedText || msg.content;
    const targetLanguage = language === 'hi' ? 'English' : 'Hindi';
    try {
      const res = await apiRequest<{ translatedText: string }>(
        '/api/conversations/messages/translate',
        {
          method: 'POST',
          body: JSON.stringify({ text: sourceText, targetLanguage }),
        }
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, translatedText: res.translatedText } : m
        )
      );
    } catch (err: any) {
      setStatusFeedback(err.message || 'Translation failed');
    }
  };

  const handleForwardTo = async (targetConvId: number) => {
    if (!forwardingMsg) return;
    const msgText = forwardingMsg.decryptedText || forwardingMsg.content;
    await apiRequest(`/api/conversations/${targetConvId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'text',
        content: msgText,
        forwardedFromId: forwardingMsg.id,
      }),
    });
    setForwardingMsg(null);
    setStatusFeedback('Message forwarded');
  };

  const updateChatSetting = async (patch: Record<string, unknown>) => {
    setShowMenu(false);
    await apiRequest(`/api/conversations/${conversation.id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    onRefreshConversations();
  };

  const handleBlockToggle = async () => {
    if (!primaryPeer) return;
    setShowMenu(false);
    if (primaryPeer.isBlocked) {
      await apiRequest(`/api/users/block/${primaryPeer.userId}`, { method: 'DELETE' });
    } else {
      await apiRequest('/api/users/block', {
        method: 'POST',
        body: JSON.stringify({ userId: primaryPeer.userId }),
      });
    }
    onRefreshConversations();
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryPeer) return;
    await apiRequest('/api/users/report', {
      method: 'POST',
      body: JSON.stringify({
        reportedUserId: primaryPeer.userId,
        conversationId: conversation.id,
        reason: reportReason,
        details: reportDetails,
      }),
    });
    setShowReportModal(false);
    setReportDetails('');
    setStatusFeedback('Report submitted to administrators.');
  };

  const handleExportHistory = async () => {
    setExporting(true);
    try {
      const data = await apiRequest<{ messages: ChatMessage[] }>(
        `/api/conversations/${conversation.id}/messages?all=true`
      );
      const hydrated = await hydrateDecrypted(data.messages);
      const options = {
        includeDeleted: exportIncludeDeleted,
        includeDetails: exportIncludeDetails,
      };
      const doc = buildChatExportDocument({
        conversation,
        messages: hydrated,
        currentUser: user,
        currentProfile: profile,
        options,
      });

      const baseName = sanitizeExportFilename(getConversationDisplayTitle(conversation));
      if (exportFormat === 'json') {
        const jsonText = formatChatExportAsJson(doc);
        triggerLocalFileDownload(
          jsonText,
          `${baseName}.json`,
          'application/json;charset=utf-8'
        );
      } else {
        const plainText = formatChatExportAsText(doc, options);
        triggerLocalFileDownload(
          plainText,
          `${baseName}.txt`,
          'text/plain;charset=utf-8'
        );
      }

      setShowExportModal(false);
      setStatusFeedback(
        `Exported ${doc.conversation.messageCount} messages as ${exportFormat.toUpperCase()}`
      );
    } catch (err: any) {
      setStatusFeedback(err.message || 'Failed to export conversation history.');
    } finally {
      setExporting(false);
    }
  };

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeleted);
  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) =>
        (m.decryptedText || m.content)
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : messages;

  const bgStyle: React.CSSProperties = resolveWallpaperStyle(
    conversation.wallpaper,
    profile?.defaultWallpaper
  );

  // Mention suggestions inside groups
  const mentionMatch = isGroup ? text.match(/@([a-zA-Z0-9_]*)$/) : null;
  const mentionSuggestions = mentionMatch
    ? conversation.peers.filter((p) =>
        p.username.toLowerCase().startsWith(mentionMatch[1].toLowerCase())
      )
    : [];

  return (
    <div className="flex flex-col h-full w-full bg-[#EFEAE2] dark:bg-[#0B141A] relative">
      {/* Chat Header */}
      <header className="h-16 px-3 sm:px-5 bg-white dark:bg-[#202C33] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-2 -ml-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Avatar
            src={displayAvatar}
            name={displayName}
            online={!isGroup && isPeerOnline}
            isGroup={isGroup}
          />
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
              {displayName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {peerTyping ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {t(language, 'typing')}
                </span>
              ) : isGroup ? (
                `${conversation.peers.length + 1} members`
              ) : isPeerOnline ? (
                t(language, 'online')
              ) : primaryPeer?.lastSeenAt ? (
                `Last seen ${new Date(primaryPeer.lastSeenAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              ) : (
                t(language, 'offline')
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            title={t(language, 'voiceCall')}
            onClick={() =>
              onStartCall(
                'audio',
                conversation.peers.map((p) => p.userId),
                conversation.id,
                displayName,
                displayAvatar
              )
            }
            className="p-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            title={isGroup ? t(language, 'groupVideoCall') : t(language, 'videoCall')}
            onClick={() =>
              onStartCall(
                isGroup ? 'group_video' : 'video',
                conversation.peers.map((p) => p.userId),
                conversation.id,
                displayName,
                displayAvatar
              )
            }
            className="p-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
          >
            <Video className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            title="Search messages"
            onClick={() => setShowSearch((s) => !s)}
            className="p-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((m) => !m)}
              className="p-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
            >
              <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-12 w-56 bg-white dark:bg-[#233138] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-40 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowWallpaperModal(true);
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  <Palette className="w-4 h-4 text-slate-500" />
                  <span>{t(language, 'wallpaper')}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateChatSetting({
                      disappearingSeconds:
                        conversation.disappearingSeconds > 0 ? 0 : 86400,
                    })
                  }
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  <Timer className="w-4 h-4 text-slate-500" />
                  <span>
                    {conversation.disappearingSeconds > 0
                      ? 'Disappearing: 24h (Off)'
                      : 'Disappearing: 24h (On)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => updateChatSetting({ isMuted: !conversation.isMuted })}
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  {conversation.isMuted ? (
                    <Bell className="w-4 h-4 text-slate-500" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-500" />
                  )}
                  <span>
                    {conversation.isMuted
                      ? t(language, 'unmuteChat')
                      : t(language, 'muteChat')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateChatSetting({ isArchived: !conversation.isArchived })
                  }
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  <Archive className="w-4 h-4 text-slate-500" />
                  <span>
                    {conversation.isArchived
                      ? t(language, 'unarchiveChat')
                      : t(language, 'archiveChat')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    if (conversation.isLocked) {
                      updateChatSetting({ isLocked: false });
                    } else {
                      setShowLockModal(true);
                    }
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>
                    {conversation.isLocked
                      ? t(language, 'unlockChat')
                      : t(language, 'lockChat')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowExportModal(true);
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                >
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t(language, 'exportChat')}</span>
                </button>
                {!isGroup && primaryPeer && (
                  <>
                    <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                    <button
                      type="button"
                      onClick={handleBlockToggle}
                      className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Ban className="w-4 h-4" />
                      <span>
                        {primaryPeer.isBlocked
                          ? t(language, 'unblockUser')
                          : t(language, 'blockUser')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowReportModal(true);
                      }}
                      className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>{t(language, 'reportUser')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-white dark:bg-[#111B21] border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages in this chat..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-emerald-50/95 dark:bg-[#182229] border-b border-emerald-200/70 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Pin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate font-medium text-slate-800 dark:text-slate-200">
              {pinnedMessages[pinnedMessages.length - 1].decryptedText ||
                pinnedMessages[pinnedMessages.length - 1].content}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              apiRequest(
                `/api/conversations/messages/${pinnedMessages[pinnedMessages.length - 1].id}/pin`,
                { method: 'POST' }
              )
            }
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0"
          >
            Unpin
          </button>
        </div>
      )}

      {/* Status Toast */}
      {statusFeedback && (
        <div className="mx-auto mt-2 px-4 py-1.5 rounded-full bg-slate-900/90 text-white text-xs flex items-center gap-2 z-30">
          <span>{statusFeedback}</span>
          <button type="button" onClick={() => setStatusFeedback(null)}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5"
        style={bgStyle}
      >
        {/* E2E Encryption Notice */}
        <div className="max-w-md mx-auto my-2 px-3.5 py-2 rounded-xl bg-amber-50/90 dark:bg-[#182229]/90 border border-amber-200/60 dark:border-slate-700/60 text-[11px] text-center text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 shadow-xs">
          <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t(language, 'e2eNotice')}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : (
          filteredMessages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <span className="px-3 py-1 rounded-lg bg-white/80 dark:bg-[#182229]/90 text-[11px] text-slate-600 dark:text-slate-300 shadow-xs">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const isMine = msg.senderId === user?.id;
            const bodyText = msg.decryptedText || msg.content;
            const repliedMsg = msg.replyToMessageId
              ? messages.find((m) => m.id === msg.replyToMessageId)
              : null;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group relative`}
              >
                <div
                  className={`relative max-w-[82%] sm:max-w-[68%] rounded-2xl px-3.5 py-2 shadow-xs border ${
                    isMine
                      ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-slate-900 dark:text-slate-100 border-emerald-200/60 dark:border-emerald-900/50 rounded-tr-xs'
                      : 'bg-white dark:bg-[#202C33] text-slate-900 dark:text-slate-100 border-slate-200/70 dark:border-slate-700/60 rounded-tl-xs'
                  }`}
                >
                  {/* Group Sender Label */}
                  {isGroup && !isMine && (
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">
                      {msg.senderName}
                    </p>
                  )}

                  {msg.forwardedFromId && (
                    <p className="text-[10px] italic text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <Forward className="w-3 h-3" /> Forwarded
                    </p>
                  )}

                  {/* Reply Preview */}
                  {repliedMsg && (
                    <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-black/25 text-xs">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {repliedMsg.senderName}
                      </p>
                      <p className="truncate opacity-80">
                        {repliedMsg.decryptedText || repliedMsg.content}
                      </p>
                    </div>
                  )}

                  {/* Attachments */}
                  {!msg.isDeleted &&
                    msg.attachments?.map((att) => (
                      <div key={att.id} className="mb-1.5">
                        {att.fileType === 'image' && (
                          <img
                            src={att.fileUrl}
                            alt={att.fileName}
                            onClick={() => setLightboxUrl(att.fileUrl)}
                            className="max-h-64 rounded-xl object-cover cursor-pointer border border-black/5"
                          />
                        )}
                        {att.fileType === 'video' && (
                          <video
                            src={att.fileUrl}
                            controls
                            className="max-h-64 rounded-xl w-full"
                          />
                        )}
                        {att.fileType === 'audio' && (
                          <audio src={att.fileUrl} controls className="max-w-full h-9" />
                        )}
                        {att.fileType === 'document' && (
                          <a
                            href={att.fileUrl}
                            download={att.fileName}
                            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 hover:bg-black/10 transition-colors"
                          >
                            <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{att.fileName}</p>
                              <p className="text-[10px] opacity-70">
                                {(att.fileSize / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Download className="w-4 h-4 shrink-0" />
                          </a>
                        )}
                      </div>
                    ))}

                  {/* Special Message Types */}
                  {msg.type === 'location' && msg.metadataJson && !msg.isDeleted ? (
                    <a
                      href={`https://maps.google.com/?q=${msg.metadataJson.latitude},${msg.metadataJson.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 transition-colors"
                    >
                      <MapPin className="w-5 h-5 text-rose-500 shrink-0" />
                      <div className="text-xs">
                        <p className="font-semibold">Shared Live Location</p>
                        <p className="font-mono text-[11px] opacity-75">
                          {Number(msg.metadataJson.latitude).toFixed(4)},{' '}
                          {Number(msg.metadataJson.longitude).toFixed(4)}
                        </p>
                      </div>
                    </a>
                  ) : msg.type === 'contact' && msg.metadataJson && !msg.isDeleted ? (
                    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-black/20">
                      <div>
                        <p className="text-xs font-semibold">{msg.metadataJson.fullName}</p>
                        <p className="text-[11px] opacity-75">
                          @{msg.metadataJson.username}{' '}
                          {msg.metadataJson.mobileNumber
                            ? `· ${msg.metadataJson.mobileNumber}`
                            : ''}
                        </p>
                      </div>
                      {msg.metadataJson.userId && (
                        <button
                          type="button"
                          onClick={() => onOpenChatByUserId(Number(msg.metadataJson!.userId))}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                        >
                          Message
                        </button>
                      )}
                    </div>
                  ) : msg.type === 'poll' && msg.metadataJson && !msg.isDeleted ? (
                    <div className="space-y-2 min-w-[220px]">
                      <p className="text-sm font-semibold">{msg.metadataJson.question}</p>
                      <div className="space-y-1.5">
                        {(msg.metadataJson.options || []).map((opt: any, idx: number) => {
                          const totalVotes = (msg.metadataJson!.options || []).reduce(
                            (sum: number, o: any) => sum + (o.votes?.length || 0),
                            0
                          );
                          const votes = opt.votes?.length || 0;
                          const pct = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
                          const votedByMe = opt.votes?.includes(user?.id);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleVotePoll(msg.id, idx)}
                              className={`w-full text-left p-2 rounded-lg border text-xs relative overflow-hidden transition-colors ${
                                votedByMe
                                  ? 'border-emerald-600 bg-emerald-600/10'
                                  : 'border-slate-300/60 dark:border-slate-600/60'
                              }`}
                            >
                              <div
                                className="absolute inset-y-0 left-0 bg-emerald-500/20 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <div className="relative flex items-center justify-between gap-2">
                                <span className="font-medium">{opt.text}</span>
                                <span className="font-mono text-[11px]">
                                  {votes} ({pct}%)
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    msg.attachments.length === 0 && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.isDeleted ? (
                          <span className="italic opacity-60">{bodyText}</span>
                        ) : (
                          bodyText
                        )}
                      </p>
                    )
                  )}

                  {/* Translated Text */}
                  {msg.translatedText && (
                    <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10 text-xs opacity-90">
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70 block">
                        Translation
                      </span>
                      {msg.translatedText}
                    </div>
                  )}

                  {/* Metadata footer */}
                  <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-slate-500 dark:text-slate-300/75 tabular-nums">
                    {msg.isPinned && <Pin className="w-2.5 h-2.5 text-emerald-600" />}
                    {msg.isStarred && <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />}
                    {msg.isEncrypted && <Lock className="w-2.5 h-2.5 opacity-70" />}
                    {msg.isEdited && <span>edited</span>}
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine &&
                      (msg.deliveryStatus === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                      ) : msg.deliveryStatus === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 opacity-60" />
                      ) : (
                        <Check className="w-3.5 h-3.5 opacity-60" />
                      ))}

                    <button
                      type="button"
                      onClick={() =>
                        setActiveMsgMenu(activeMsgMenu === msg.id ? null : msg.id)
                      }
                      className="ml-1 opacity-70 hover:opacity-100 px-1 rounded"
                    >
                      ▾
                    </button>
                  </div>

                  {/* Reactions Row */}
                  {msg.reactions?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(
                        msg.reactions.reduce<Record<string, number>>((acc, r) => {
                          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                          return acc;
                        }, {})
                      ).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReact(msg.id, emoji)}
                          className="px-1.5 py-0.5 rounded-full bg-white/80 dark:bg-[#111B21]/80 border border-slate-200/80 dark:border-slate-700 text-xs flex items-center gap-1 shadow-xs"
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px] font-mono">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Message Action Menu */}
                  {activeMsgMenu === msg.id && !msg.isDeleted && (
                    <div
                      className={`absolute top-8 ${
                        isMine ? 'right-0' : 'left-0'
                      } w-48 bg-white dark:bg-[#233138] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30 text-xs`}
                    >
                      <div className="flex items-center justify-around px-2 py-1.5 border-b border-slate-200 dark:border-slate-700">
                        {['👍', '❤️', '😂', '😮', '🙏'].map((emo) => (
                          <button
                            key={emo}
                            type="button"
                            onClick={() => handleReact(msg.id, emo)}
                            className="hover:scale-125 transition-transform text-base"
                          >
                            {emo}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(msg);
                          setActiveMsgMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Reply className="w-3.5 h-3.5" /> {t(language, 'reply')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForwardingMsg(msg);
                          setActiveMsgMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Forward className="w-3.5 h-3.5" /> {t(language, 'forward')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(bodyText);
                          setActiveMsgMenu(null);
                          setStatusFeedback('Copied to clipboard');
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Copy className="w-3.5 h-3.5" /> {t(language, 'copy')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveMsgMenu(null);
                          const res = await apiRequest<{ isStarred: boolean }>(
                            `/api/conversations/messages/${msg.id}/star`,
                            { method: 'POST' }
                          );
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, isStarred: res.isStarred } : m
                            )
                          );
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Star className="w-3.5 h-3.5" />{' '}
                        {msg.isStarred ? t(language, 'unstar') : t(language, 'star')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveMsgMenu(null);
                          await apiRequest(`/api/conversations/messages/${msg.id}/pin`, {
                            method: 'POST',
                          });
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Pin className="w-3.5 h-3.5" />{' '}
                        {msg.isPinned ? t(language, 'unpin') : t(language, 'pin')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTranslate(msg)}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <Languages className="w-3.5 h-3.5" /> {t(language, 'translate')}
                      </button>
                      {isMine && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsg(msg);
                              setText(bodyText);
                              setActiveMsgMenu(null);
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> {t(language, 'edit')}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setActiveMsgMenu(null);
                              await apiRequest(`/api/conversations/messages/${msg.id}`, {
                                method: 'DELETE',
                              });
                            }}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {t(language, 'delete')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply / Edit Banner */}
      {(replyTo || editingMsg) && (
        <div className="px-4 py-2 bg-white dark:bg-[#202C33] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="min-w-0">
            <span className="font-semibold text-emerald-600">
              {editingMsg ? 'Editing message' : `Replying to ${replyTo?.senderName}`}
            </span>
            <p className="truncate text-slate-500">
              {(editingMsg || replyTo)?.decryptedText ||
                (editingMsg || replyTo)?.content}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setEditingMsg(null);
              setText('');
            }}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* @Mention Suggestions */}
      {mentionSuggestions.length > 0 && (
        <div className="mx-4 mb-1 bg-white dark:bg-[#233138] rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
          {mentionSuggestions.map((p) => (
            <button
              key={p.userId}
              type="button"
              onClick={() => {
                setText((prev) => prev.replace(/@[a-zA-Z0-9_]*$/, `@${p.username} `));
              }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Avatar src={p.avatarUrl} name={p.fullName} size="xs" />
              <span className="font-medium">{p.fullName}</span>
              <span className="text-slate-400">@{p.username}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji Keyboard Popover */}
      {showEmojiPicker && (
        <div className="mx-3 mb-2 p-3 bg-white dark:bg-[#233138] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
          {EMOJIS.map((emo) => (
            <button
              key={emo}
              type="button"
              onClick={() => {
                setText((prev) => prev + emo);
                setShowEmojiPicker(false);
              }}
              className="text-xl hover:scale-125 transition-transform p-1"
            >
              {emo}
            </button>
          ))}
        </div>
      )}

      {/* Attachment Popover */}
      {showAttachMenu && (
        <div className="mx-3 mb-2 p-3 bg-white dark:bg-[#233138] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            <ImageIcon className="w-5 h-5 text-emerald-600" />
            <span>Photo / Video</span>
          </button>
          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            <FileText className="w-5 h-5 text-indigo-500" />
            <span>Document / PDF</span>
          </button>
          <button
            type="button"
            onClick={handleShareLocation}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            <MapPin className="w-5 h-5 text-rose-500" />
            <span>Live Location</span>
          </button>
          <button
            type="button"
            onClick={handleOpenContactShare}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            <UserPlus className="w-5 h-5 text-sky-500" />
            <span>Share Contact</span>
          </button>
          {isGroup && (
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                setShowPollModal(true);
              }}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60"
            >
              <BarChart2 className="w-5 h-5 text-amber-500" />
              <span>Group Poll</span>
            </button>
          )}
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = '';
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.csv,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = '';
        }}
      />

      {/* Composer Bar */}
      <form
        onSubmit={handleSend}
        className="px-3 py-2.5 bg-white dark:bg-[#202C33] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => {
            setShowEmojiPicker((s) => !s);
            setShowAttachMenu(false);
          }}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60"
        >
          <Smile className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAttachMenu((s) => !s);
            setShowEmojiPicker(false);
          }}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {recording ? (
          <div className="flex-1 flex items-center justify-between px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-sm">
            <span className="font-mono tabular-nums">
              Recording voice note... {recordSeconds}s
            </span>
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-medium flex items-center gap-1"
            >
              <Square className="w-3 h-3" /> Stop &amp; Send
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={text}
            onChange={(e) => handleTypingChange(e.target.value)}
            placeholder={t(language, 'typeMessage')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#2A3942] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        {text.trim() ? (
          <button
            type="submit"
            disabled={sending}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title="Record voice message"
            className={`p-2.5 rounded-xl transition-colors ${
              recording
                ? 'bg-rose-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </form>

      {/* Modals */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            className="max-w-full max-h-full rounded-xl"
          />
        </div>
      )}

      {showWallpaperModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Choose Chat Wallpaper</h3>
                <p className="text-[11px] text-slate-500">
                  Active: {getWallpaperLabel(conversation.wallpaper)} · Customize AI or uploaded backgrounds in Settings
                </p>
              </div>
              <button type="button" onClick={() => setShowWallpaperModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {isImageUrlWallpaper(conversation.wallpaper) && (
              <div className="p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-3">
                <div
                  className="w-14 h-10 rounded-lg bg-cover bg-center shrink-0 border border-slate-200 dark:border-slate-700"
                  style={{ backgroundImage: `url("${conversation.wallpaper}")` }}
                />
                <div className="text-xs flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {getWallpaperLabel(conversation.wallpaper)}
                  </p>
                  <p className="text-[11px] text-slate-500">Currently applied to this chat</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {WALLPAPER_GALLERY.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    updateChatSetting({ wallpaper: w.id });
                    setShowWallpaperModal(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-colors ${
                    conversation.wallpaper === w.id
                      ? 'border-emerald-600 ring-2 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                  }`}
                >
                  <div
                    className="h-20 rounded-lg mb-2 bg-slate-100 dark:bg-slate-800 bg-cover bg-center"
                    style={
                      w.url
                        ? { backgroundImage: `url(${w.url})` }
                        : w.bg
                          ? { backgroundColor: w.bg }
                          : undefined
                    }
                  />
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPollModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePoll}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Create Group Poll</h3>
              <button type="button" onClick={() => setShowPollModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            />
            {pollOptions.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                required={idx < 2}
                value={opt}
                onChange={(e) =>
                  setPollOptions((prev) =>
                    prev.map((v, i) => (i === idx ? e.target.value : v))
                  )
                }
                placeholder={`Option ${idx + 1}`}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
              />
            ))}
            {pollOptions.length < 5 && (
              <button
                type="button"
                onClick={() => setPollOptions((p) => [...p, ''])}
                className="text-xs text-emerald-600 font-medium"
              >
                + Add Option
              </button>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium"
            >
              Post Poll
            </button>
          </form>
        </div>
      )}

      {forwardingMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-sm w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Forward Message To</h3>
              <button type="button" onClick={() => setForwardingMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {allConversations.map((c) => {
                const name =
                  c.type === 'group'
                    ? c.group?.name || 'Group'
                    : c.peers[0]?.fullName || 'User';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleForwardTo(c.id)}
                    className="w-full py-2.5 px-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                  >
                    <span>{name}</span>
                    <Forward className="w-4 h-4 text-emerald-600" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showContactShareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-sm w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Share Contact</h3>
              <button type="button" onClick={() => setShowContactShareModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {contactsList.length === 0 ? (
              <p className="text-xs text-slate-500">No saved contacts yet.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {contactsList.map((c) => (
                  <button
                    key={c.userId}
                    type="button"
                    onClick={() => handleSendContact(c)}
                    className="w-full p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-left"
                  >
                    <Avatar src={c.avatarUrl} name={c.fullName} size="sm" />
                    <div>
                      <p className="text-sm font-medium">{c.fullName}</p>
                      <p className="text-xs text-slate-500">@{c.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showLockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (lockPinInput.length < 4) return;
              await updateChatSetting({ isLocked: true, lockPin: lockPinInput });
              setShowLockModal(false);
              setLockPinInput('');
            }}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-xs w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <h3 className="font-semibold">Lock Chat with PIN</h3>
            <input
              type="password"
              required
              minLength={4}
              maxLength={8}
              value={lockPinInput}
              onChange={(e) => setLockPinInput(e.target.value)}
              placeholder="Enter 4–8 digit PIN"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                className="px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-medium"
              >
                Lock
              </button>
            </div>
          </form>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleReportSubmit}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-sm w-full p-5 space-y-3 border border-slate-200 dark:border-slate-800"
          >
            <h3 className="font-semibold">Report User</h3>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            >
              <option>Spam or abuse</option>
              <option>Harassment</option>
              <option>Impersonation</option>
              <option>Suspicious activity</option>
            </select>
            <textarea
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional context (private messages remain encrypted)"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {showExportModal && (() => {
        const previewOptions = {
          includeDeleted: exportIncludeDeleted,
          includeDetails: exportIncludeDetails,
        };
        const previewDoc = buildChatExportDocument({
          conversation,
          messages: messages.slice(-5),
          currentUser: user,
          currentProfile: profile,
          options: previewOptions,
        });
        const previewOutput =
          exportFormat === 'json'
            ? formatChatExportAsJson(previewDoc)
            : formatChatExportAsText(previewDoc, previewOptions);

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-lg w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>{t(language, 'exportChat')}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Save a decrypted local backup of &ldquo;{displayName}&rdquo; ({messages.length} loaded messages).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportFormat('json')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    exportFormat === 'json'
                      ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Formatted JSON (.json)
                    </span>
                    {exportFormat === 'json' && (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Structured archive with timestamps, senders, and metadata.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('txt')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    exportFormat === 'txt'
                      ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Plain Text (.txt)
                    </span>
                    {exportFormat === 'txt' && (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Human-readable chronological chat transcript.
                  </p>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={exportIncludeDetails}
                    onChange={(e) => setExportIncludeDetails(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span>Include attachments, reactions, replies, and poll/location details</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={exportIncludeDeleted}
                    onChange={(e) => setExportIncludeDeleted(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span>Include deleted message placeholders</span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Format Preview (latest messages)</span>
                  <span className="font-mono uppercase">{exportFormat}</span>
                </div>
                <pre className="p-3 rounded-xl bg-slate-100 dark:bg-[#0B141A] border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-h-40 overflow-auto whitespace-pre-wrap break-words">
                  {previewOutput}
                </pre>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t(language, 'cancel')}
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={handleExportHistory}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    {exporting
                      ? 'Preparing Backup...'
                      : `Download ${exportFormat.toUpperCase()} Backup`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
