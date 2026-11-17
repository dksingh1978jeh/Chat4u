import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    mobileNumber: text('mobile_number').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    otpCode: text('otp_code'),
    otpExpiresAt: timestamp('otp_expires_at'),
    isVerified: boolean('is_verified').default(false).notNull(),
    twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
    twoFactorPinHash: text('two_factor_pin_hash'),
    role: text('role').default('user').notNull(), // 'user' | 'admin'
    status: text('status').default('active').notNull(), // 'active' | 'suspended' | 'banned'
    e2ePublicKey: text('e2e_public_key'),
    e2eEncryptedPrivateKey: text('e2e_encrypted_private_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_mobile_idx').on(table.mobileNumber),
    index('users_email_idx').on(table.email),
    index('users_status_idx').on(table.status),
  ]
);

export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    fullName: text('full_name').notNull(),
    username: text('username').notNull().unique(),
    bio: text('bio').default('Hey there! I am using SmartConnect.').notNull(),
    avatarUrl: text('avatar_url'),
    onlineStatus: text('online_status').default('offline').notNull(), // 'online' | 'offline' | 'away'
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    privacyProfilePhoto: text('privacy_profile_photo').default('everyone').notNull(),
    privacyLastSeen: text('privacy_last_seen').default('everyone').notNull(),
    privacyReadReceipts: boolean('privacy_read_receipts').default(true).notNull(),
    privacyStatus: text('privacy_status').default('everyone').notNull(),
    language: text('language').default('en').notNull(), // 'en' | 'hi'
    theme: text('theme').default('light').notNull(), // 'light' | 'dark'
    notificationSound: text('notification_sound').default('chime').notNull(),
    defaultWallpaper: text('default_wallpaper').default('default').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('profiles_username_idx').on(table.username)]
);

export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    contactUserId: integer('contact_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    nickname: text('nickname'),
    isSynced: boolean('is_synced').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('contacts_owner_contact_idx').on(table.ownerId, table.contactUserId),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    type: text('type').default('direct').notNull(), // 'direct' | 'group' | 'broadcast'
    createdBy: integer('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
    disappearingSeconds: integer('disappearing_seconds').default(0).notNull(), // 0 = off
    wallpaper: text('wallpaper').default('default').notNull(),
    lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('conversations_last_msg_idx').on(table.lastMessageAt)]
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').default('member').notNull(), // 'member' | 'admin'
    isMuted: boolean('is_muted').default(false).notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    isLocked: boolean('is_locked').default(false).notNull(),
    lockPinHash: text('lock_pin_hash'),
    unreadCount: integer('unread_count').default(0).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conv_participants_unique_idx').on(table.conversationId, table.userId),
    index('conv_participants_user_idx').on(table.userId),
  ]
);

export const groups = pgTable(
  'groups',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    avatarUrl: text('avatar_url'),
    isAnnouncementOnly: boolean('is_announcement_only').default(false).notNull(),
    communityName: text('community_name'),
    createdBy: integer('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

export const groupMembers = pgTable(
  'group_members',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .references(() => groups.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').default('member').notNull(), // 'admin' | 'member'
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('group_members_unique_idx').on(table.groupId, table.userId),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: integer('sender_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').default('text').notNull(), // 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'poll' | 'system'
    content: text('content').default('').notNull(),
    encryptedPayload: text('encrypted_payload'),
    isEncrypted: boolean('is_encrypted').default(false).notNull(),
    replyToMessageId: integer('reply_to_message_id'),
    forwardedFromId: integer('forwarded_from_id'),
    isEdited: boolean('is_edited').default(false).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    mentions: jsonb('mentions').$type<string[]>().default([]).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at'),
    deliveryStatus: text('delivery_status').default('sent').notNull(), // 'sent' | 'delivered' | 'read'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('messages_conv_created_idx').on(table.conversationId, table.createdAt),
    index('messages_sender_idx').on(table.senderId),
  ]
);

export const starredMessages = pgTable(
  'starred_messages',
  {
    id: serial('id').primaryKey(),
    messageId: integer('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('starred_msg_user_idx').on(table.messageId, table.userId),
  ]
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: serial('id').primaryKey(),
    messageId: integer('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // 'image' | 'video' | 'audio' | 'document'
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    fileUrl: text('file_url').notNull(),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('attachments_message_idx').on(table.messageId)]
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: serial('id').primaryKey(),
    messageId: integer('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reactions_msg_user_idx').on(table.messageId, table.userId),
  ]
);

export const calls = pgTable(
  'calls',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'set null' }),
    callerId: integer('caller_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    calleeId: integer('callee_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    callType: text('call_type').default('audio').notNull(), // 'audio' | 'video' | 'group_video'
    status: text('status').default('ringing').notNull(), // 'ringing' | 'ongoing' | 'ended' | 'missed' | 'declined'
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('calls_caller_idx').on(table.callerId),
    index('calls_callee_idx').on(table.calleeId),
  ]
);

export const statusUpdates = pgTable(
  'status_updates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    mediaType: text('media_type').default('text').notNull(), // 'text' | 'image' | 'video'
    content: text('content').default('').notNull(),
    mediaUrl: text('media_url'),
    bgColor: text('bg_color').default('#064E3B').notNull(),
    privacy: text('privacy').default('everyone').notNull(), // 'everyone' | 'contacts'
    viewsCount: integer('views_count').default(0).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('status_user_expires_idx').on(table.userId, table.expiresAt)]
);

export const statusReactions = pgTable('status_reactions', {
  id: serial('id').primaryKey(),
  statusId: integer('status_id')
    .references(() => statusUpdates.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  emoji: text('emoji'),
  replyText: text('reply_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // 'message' | 'call' | 'group' | 'system' | 'admin'
    title: text('title').notNull(),
    body: text('body').notNull(),
    referenceId: text('reference_id'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_idx').on(table.userId, table.isRead)]
);

export const blockedUsers = pgTable(
  'blocked_users',
  {
    id: serial('id').primaryKey(),
    blockerId: integer('blocker_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    blockedId: integer('blocked_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('blocked_users_unique_idx').on(table.blockerId, table.blockedId),
  ]
);

export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    reporterId: integer('reporter_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reportedUserId: integer('reported_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: integer('conversation_id'),
    reason: text('reason').notNull(),
    details: text('details').default('').notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'reviewed' | 'resolved' | 'dismissed'
    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('reports_status_idx').on(table.status)]
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenId: text('token_id').notNull().unique(),
    deviceName: text('device_name').default('Web Browser').notNull(),
    userAgent: text('user_agent').default('').notNull(),
    ipAddress: text('ip_address').default('').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
);

export const adminAccounts = pgTable('admin_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  permissionsLevel: text('permissions_level').default('super_admin').notNull(),
  notes: text('notes').default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(userSessions),
  notifications: many(notifications),
  adminAccount: one(adminAccounts, { fields: [users.id], references: [adminAccounts.userId] }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
  group: one(groups, { fields: [conversations.id], references: [groups.conversationId] }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [groups.conversationId],
    references: [conversations.id],
  }),
  members: many(groupMembers),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  attachments: many(messageAttachments),
  reactions: many(messageReactions),
}));
