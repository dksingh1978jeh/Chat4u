export type Language = 'en' | 'hi';
export type ThemeMode = 'light' | 'dark';
export type NavTab = 'chats' | 'updates' | 'communities' | 'calls' | 'settings' | 'admin';

export interface UserAccount {
  id: number;
  uid: string;
  email: string;
  mobileNumber: string | null;
  role: 'user' | 'admin';
  twoFactorEnabled: boolean;
  e2ePublicKey: string | null;
  e2eEncryptedPrivateKey?: string | null;
  currentSessionTokenId?: string;
}

export interface UserProfile {
  id: number;
  userId: number;
  fullName: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  onlineStatus: string;
  lastSeenAt: string;
  privacyProfilePhoto: 'everyone' | 'contacts' | 'nobody';
  privacyLastSeen: 'everyone' | 'contacts' | 'nobody';
  privacyReadReceipts: boolean;
  privacyStatus: 'everyone' | 'contacts';
  language: Language;
  theme: ThemeMode;
  notificationSound: string;
  defaultWallpaper: string;
}

export interface PeerInfo {
  userId: number;
  role: string;
  fullName: string;
  username: string;
  bio: string;
  mobileNumber: string | null;
  e2ePublicKey: string | null;
  avatarUrl: string | null;
  onlineStatus: string;
  lastSeenAt: string | null;
  isBlocked?: boolean;
}

export interface GroupInfo {
  id: number;
  conversationId: number;
  name: string;
  description: string;
  avatarUrl: string | null;
  isAnnouncementOnly: boolean;
  communityName: string | null;
  createdBy: number | null;
  createdAt: string;
  members?: Array<{
    groupId: number;
    userId: number;
    role: string;
    fullName: string;
    username: string;
    avatarUrl: string | null;
    onlineStatus: string;
  }>;
}

export interface MessageAttachment {
  id: number;
  messageId: number;
  fileName: string;
  fileType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  durationSeconds: number | null;
}

export interface MessageReaction {
  id: number;
  messageId: number;
  userId: number;
  emoji: string;
  username: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'poll' | 'system';
  content: string;
  encryptedPayload: string | null;
  isEncrypted: boolean;
  replyToMessageId: number | null;
  forwardedFromId: number | null;
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  mentions: string[];
  metadataJson: Record<string, any> | null;
  expiresAt: string | null;
  deliveryStatus: 'sent' | 'delivered' | 'read';
  createdAt: string;
  updatedAt: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string | null;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  isStarred: boolean;
  decryptedText?: string;
  translatedText?: string;
}

export interface ConversationSummary {
  id: number;
  type: 'direct' | 'group' | 'broadcast';
  disappearingSeconds: number;
  wallpaper: string;
  lastMessageAt: string;
  isMuted: boolean;
  isArchived: boolean;
  isLocked: boolean;
  unreadCount: number;
  myRole: string;
  group: GroupInfo | null;
  peers: PeerInfo[];
  lastMessage: {
    id: number;
    senderId: number;
    type: string;
    content: string;
    isEncrypted: boolean;
    encryptedPayload: string | null;
    deliveryStatus: string;
    createdAt: string;
  } | null;
}

export interface StatusItem {
  id: number;
  userId: number;
  mediaType: 'text' | 'image' | 'video';
  content: string;
  mediaUrl: string | null;
  bgColor: string;
  privacy: string;
  viewsCount: number;
  expiresAt: string;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  reactions: Array<{
    id: number;
    statusId: number;
    userId: number;
    emoji: string | null;
    replyText: string | null;
    createdAt: string;
    userName: string;
  }>;
}

export interface CallRecord {
  id: number;
  conversationId: number | null;
  callerId: number;
  calleeId: number | null;
  callType: 'audio' | 'video' | 'group_video';
  status: 'ringing' | 'ongoing' | 'ended' | 'missed' | 'declined';
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  caller: { userId: number; fullName: string; username: string; avatarUrl: string | null } | null;
  callee: { userId: number; fullName: string; username: string; avatarUrl: string | null } | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}
