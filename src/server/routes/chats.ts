import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import {
  eq,
  and,
  or,
  desc,
  asc,
  inArray,
  gt,
  isNull,
  sql,
} from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  conversations,
  conversationParticipants,
  groups,
  groupMembers,
  messages,
  messageAttachments,
  messageReactions,
  starredMessages,
  users,
  profiles,
  blockedUsers,
  contacts,
  notifications,
} from '../../db/schema.ts';
import { requireAuth } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { sendToUsers, sendToUser } from '../websocket.ts';

export const chatsRouter = Router();
chatsRouter.use(requireAuth);

const aiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

async function getParticipantUserIds(conversationId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

chatsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const myParticipations = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, myId));

    if (myParticipations.length === 0) {
      return res.json({ conversations: [] });
    }

    const convIds = myParticipations.map((p) => p.conversationId);
    const convRows = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds))
      .orderBy(desc(conversations.lastMessageAt));

    const allParticipants = await db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
        role: conversationParticipants.role,
        fullName: profiles.fullName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
        onlineStatus: profiles.onlineStatus,
        lastSeenAt: profiles.lastSeenAt,
        bio: profiles.bio,
        mobileNumber: users.mobileNumber,
        e2ePublicKey: users.e2ePublicKey,
        privacyProfilePhoto: profiles.privacyProfilePhoto,
        privacyLastSeen: profiles.privacyLastSeen,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, convIds));

    const groupRows = await db
      .select()
      .from(groups)
      .where(inArray(groups.conversationId, convIds));
    const groupByConv = new Map(groupRows.map((g) => [g.conversationId, g]));

    const myContacts = await db
      .select({ contactUserId: contacts.contactUserId })
      .from(contacts)
      .where(eq(contacts.ownerId, myId));
    const contactSet = new Set(myContacts.map((c) => c.contactUserId));

    const myBlocks = await db
      .select()
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, myId));
    const blockedByMe = new Set(myBlocks.map((b) => b.blockedId));

    const latestMessages = await db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.createdAt));

    const lastMsgByConv = new Map<number, typeof latestMessages[number]>();
    for (const m of latestMessages) {
      if (m.expiresAt && m.expiresAt.getTime() < Date.now()) continue;
      if (!lastMsgByConv.has(m.conversationId)) {
        lastMsgByConv.set(m.conversationId, m);
      }
    }

    const partByMe = new Map(myParticipations.map((p) => [p.conversationId, p]));

    const enriched = convRows.map((conv) => {
      const me = partByMe.get(conv.id)!;
      const peers = allParticipants
        .filter((p) => p.conversationId === conv.id && p.userId !== myId)
        .map((p) => {
          const isContact = contactSet.has(p.userId);
          const canSeePhoto =
            p.privacyProfilePhoto === 'everyone' ||
            (p.privacyProfilePhoto === 'contacts' && isContact);
          const canSeeLastSeen =
            p.privacyLastSeen === 'everyone' ||
            (p.privacyLastSeen === 'contacts' && isContact);
          return {
            userId: p.userId,
            role: p.role,
            fullName: p.fullName,
            username: p.username,
            bio: p.bio,
            mobileNumber: p.mobileNumber,
            e2ePublicKey: p.e2ePublicKey,
            avatarUrl: canSeePhoto ? p.avatarUrl : null,
            onlineStatus: canSeeLastSeen ? p.onlineStatus : 'hidden',
            lastSeenAt: canSeeLastSeen ? p.lastSeenAt : null,
            isBlocked: blockedByMe.has(p.userId),
          };
        });

      const grp = groupByConv.get(conv.id) || null;
      const lastMsg = lastMsgByConv.get(conv.id) || null;

      return {
        id: conv.id,
        type: conv.type,
        disappearingSeconds: conv.disappearingSeconds,
        wallpaper: conv.wallpaper,
        lastMessageAt: conv.lastMessageAt,
        isMuted: me.isMuted,
        isArchived: me.isArchived,
        isLocked: me.isLocked,
        unreadCount: me.unreadCount,
        myRole: me.role,
        group: grp,
        peers,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              senderId: lastMsg.senderId,
              type: lastMsg.type,
              content: lastMsg.isDeleted
                ? 'This message was deleted'
                : lastMsg.content,
              isEncrypted: lastMsg.isEncrypted,
              encryptedPayload: lastMsg.encryptedPayload,
              deliveryStatus: lastMsg.deliveryStatus,
              createdAt: lastMsg.createdAt,
            }
          : null,
      };
    });

    return res.json({ conversations: enriched });
  } catch (err) {
    console.error('Get conversations error:', err);
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

chatsRouter.post('/direct', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const targetUserId = Number(req.body?.userId);
    if (!targetUserId || targetUserId === myId) {
      return res.status(400).json({ error: 'Valid target user ID required.' });
    }

    // Find existing 1:1 direct conversation between myId and targetUserId
    const myDirects = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationParticipants.conversationId)
      )
      .where(
        and(
          eq(conversationParticipants.userId, myId),
          eq(conversations.type, 'direct')
        )
      );

    if (myDirects.length > 0) {
      const myConvIds = myDirects.map((d) => d.conversationId);
      const match = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            inArray(conversationParticipants.conversationId, myConvIds),
            eq(conversationParticipants.userId, targetUserId)
          )
        )
        .limit(1);

      if (match.length > 0) {
        return res.json({ conversationId: match[0].conversationId, created: false });
      }
    }

    const [conv] = await db
      .insert(conversations)
      .values({ type: 'direct', createdBy: myId })
      .returning();

    await db.insert(conversationParticipants).values([
      { conversationId: conv.id, userId: myId, role: 'member' },
      { conversationId: conv.id, userId: targetUserId, role: 'member' },
    ]);

    return res.status(201).json({ conversationId: conv.id, created: true });
  } catch (err) {
    console.error('Create direct chat error:', err);
    return res.status(500).json({ error: 'Failed to open direct chat.' });
  }
});

chatsRouter.post('/broadcast', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const { recipientIds, content } = req.body || {};
    if (!Array.isArray(recipientIds) || recipientIds.length === 0 || !content?.trim()) {
      return res.status(400).json({ error: 'Recipients and message text are required.' });
    }

    const [senderProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, myId))
      .limit(1);

    const results: number[] = [];
    for (const rawId of recipientIds) {
      const targetUserId = Number(rawId);
      if (!targetUserId || targetUserId === myId) continue;

      // Find or create direct conversation for each broadcast recipient
      const myDirects = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversations.id, conversationParticipants.conversationId)
        )
        .where(
          and(
            eq(conversationParticipants.userId, myId),
            eq(conversations.type, 'direct')
          )
        );

      let convId: number | null = null;
      if (myDirects.length > 0) {
        const match = await db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              inArray(
                conversationParticipants.conversationId,
                myDirects.map((d) => d.conversationId)
              ),
              eq(conversationParticipants.userId, targetUserId)
            )
          )
          .limit(1);
        if (match.length > 0) convId = match[0].conversationId;
      }

      if (!convId) {
        const [newConv] = await db
          .insert(conversations)
          .values({ type: 'direct', createdBy: myId })
          .returning();
        await db.insert(conversationParticipants).values([
          { conversationId: newConv.id, userId: myId, role: 'member' },
          { conversationId: newConv.id, userId: targetUserId, role: 'member' },
        ]);
        convId = newConv.id;
      }

      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: convId,
          senderId: myId,
          type: 'text',
          content: String(content).trim(),
          metadataJson: { isBroadcast: true },
          deliveryStatus: 'delivered',
        })
        .returning();

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, convId));

      await db
        .update(conversationParticipants)
        .set({ unreadCount: sql`${conversationParticipants.unreadCount} + 1` })
        .where(
          and(
            eq(conversationParticipants.conversationId, convId),
            eq(conversationParticipants.userId, targetUserId)
          )
        );

      sendToUser(targetUserId, 'message:new', {
        conversationId: convId,
        message: {
          ...msg,
          senderName: senderProfile?.fullName || 'SmartConnect User',
          senderUsername: senderProfile?.username || 'user',
          senderAvatar: senderProfile?.avatarUrl || null,
          attachments: [],
          reactions: [],
        },
      });
      results.push(convId);
    }

    return res.status(201).json({ deliveredTo: results.length });
  } catch (err) {
    console.error('Broadcast error:', err);
    return res.status(500).json({ error: 'Broadcast failed.' });
  }
});

chatsRouter.patch('/:id/settings', async (req: AuthRequest, res) => {
  try {
    const convId = Number(req.params.id);
    const myId = req.authUser!.id;

    const [membership] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, convId),
          eq(conversationParticipants.userId, myId)
        )
      )
      .limit(1);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a participant of this chat.' });
    }

    const {
      isMuted,
      isArchived,
      isLocked,
      lockPin,
      disappearingSeconds,
      wallpaper,
    } = req.body || {};

    const participantUpdates: Record<string, unknown> = {};
    if (isMuted !== undefined) participantUpdates.isMuted = Boolean(isMuted);
    if (isArchived !== undefined) participantUpdates.isArchived = Boolean(isArchived);
    if (isLocked !== undefined) {
      participantUpdates.isLocked = Boolean(isLocked);
      if (isLocked && lockPin) {
        participantUpdates.lockPinHash = await bcrypt.hash(String(lockPin), 10);
      } else if (!isLocked) {
        participantUpdates.lockPinHash = null;
      }
    }

    if (Object.keys(participantUpdates).length > 0) {
      await db
        .update(conversationParticipants)
        .set(participantUpdates)
        .where(
          and(
            eq(conversationParticipants.conversationId, convId),
            eq(conversationParticipants.userId, myId)
          )
        );
    }

    const convUpdates: Record<string, unknown> = {};
    if (disappearingSeconds !== undefined) {
      convUpdates.disappearingSeconds = Number(disappearingSeconds);
    }
    if (wallpaper !== undefined) {
      convUpdates.wallpaper = String(wallpaper);
    }

    if (Object.keys(convUpdates).length > 0) {
      await db
        .update(conversations)
        .set(convUpdates)
        .where(eq(conversations.id, convId));
    }

    return res.json({ updated: true });
  } catch (err) {
    console.error('Update chat settings error:', err);
    return res.status(500).json({ error: 'Failed to update chat settings.' });
  }
});

chatsRouter.post('/:id/unlock', async (req: AuthRequest, res) => {
  try {
    const convId = Number(req.params.id);
    const myId = req.authUser!.id;
    const { pin } = req.body || {};
    const [part] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, convId),
          eq(conversationParticipants.userId, myId)
        )
      )
      .limit(1);

    if (!part) return res.status(404).json({ error: 'Conversation not found.' });
    if (!part.isLocked || !part.lockPinHash) return res.json({ unlocked: true });
    const ok = await bcrypt.compare(String(pin || ''), part.lockPinHash);
    if (!ok) return res.status(401).json({ error: 'Incorrect chat lock PIN.' });
    return res.json({ unlocked: true });
  } catch (err) {
    console.error('Unlock chat error:', err);
    return res.status(500).json({ error: 'Failed to unlock chat.' });
  }
});

chatsRouter.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const convId = Number(req.params.id);
    const myId = req.authUser!.id;

    const [member] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, convId),
          eq(conversationParticipants.userId, myId)
        )
      )
      .limit(1);

    if (!member) {
      return res.status(403).json({ error: 'Not a participant of this conversation.' });
    }

    const fetchAll = req.query.all === 'true';
    const now = new Date();
    const baseQuery = db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        type: messages.type,
        content: messages.content,
        encryptedPayload: messages.encryptedPayload,
        isEncrypted: messages.isEncrypted,
        replyToMessageId: messages.replyToMessageId,
        forwardedFromId: messages.forwardedFromId,
        isEdited: messages.isEdited,
        isDeleted: messages.isDeleted,
        isPinned: messages.isPinned,
        mentions: messages.mentions,
        metadataJson: messages.metadataJson,
        expiresAt: messages.expiresAt,
        deliveryStatus: messages.deliveryStatus,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        senderName: profiles.fullName,
        senderUsername: profiles.username,
        senderAvatar: profiles.avatarUrl,
      })
      .from(messages)
      .innerJoin(profiles, eq(profiles.userId, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, convId),
          or(isNull(messages.expiresAt), gt(messages.expiresAt, now))
        )
      )
      .orderBy(asc(messages.createdAt));

    const msgRows = fetchAll ? await baseQuery.limit(10000) : await baseQuery.limit(200);

    const msgIds = msgRows.map((m) => m.id);
    let attachments: (typeof messageAttachments.$inferSelect)[] = [];
    let reactions: Array<{
      id: number;
      messageId: number;
      userId: number;
      emoji: string;
      username: string;
    }> = [];
    let starredSet = new Set<number>();

    if (msgIds.length > 0) {
      attachments = await db
        .select()
        .from(messageAttachments)
        .where(inArray(messageAttachments.messageId, msgIds));

      reactions = await db
        .select({
          id: messageReactions.id,
          messageId: messageReactions.messageId,
          userId: messageReactions.userId,
          emoji: messageReactions.emoji,
          username: profiles.username,
        })
        .from(messageReactions)
        .innerJoin(profiles, eq(profiles.userId, messageReactions.userId))
        .where(inArray(messageReactions.messageId, msgIds));

      const starredRows = await db
        .select({ messageId: starredMessages.messageId })
        .from(starredMessages)
        .where(
          and(
            eq(starredMessages.userId, myId),
            inArray(starredMessages.messageId, msgIds)
          )
        );
      starredSet = new Set(starredRows.map((s) => s.messageId));
    }

    const attByMsg = new Map<number, typeof attachments>();
    for (const a of attachments) {
      const list = attByMsg.get(a.messageId) || [];
      list.push(a);
      attByMsg.set(a.messageId, list);
    }

    const reactByMsg = new Map<number, typeof reactions>();
    for (const r of reactions) {
      const list = reactByMsg.get(r.messageId) || [];
      list.push(r);
      reactByMsg.set(r.messageId, list);
    }

    const hydrated = msgRows.map((m) => ({
      ...m,
      content: m.isDeleted ? 'This message was deleted' : m.content,
      attachments: m.isDeleted ? [] : attByMsg.get(m.id) || [],
      reactions: reactByMsg.get(m.id) || [],
      isStarred: starredSet.has(m.id),
    }));

    return res.json({ messages: hydrated });
  } catch (err) {
    console.error('Fetch messages error:', err);
    return res.status(500).json({ error: 'Failed to load messages.' });
  }
});

chatsRouter.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const convId = Number(req.params.id);
    const myId = req.authUser!.id;
    const {
      type = 'text',
      content = '',
      encryptedPayload = null,
      isEncrypted = false,
      replyToMessageId = null,
      forwardedFromId = null,
      metadataJson = null,
      attachments = [],
    } = req.body || {};

    const [member] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, convId),
          eq(conversationParticipants.userId, myId)
        )
      )
      .limit(1);

    if (!member) {
      return res.status(403).json({ error: 'Not a participant of this conversation.' });
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (conv.type === 'group') {
      const [grp] = await db
        .select()
        .from(groups)
        .where(eq(groups.conversationId, convId))
        .limit(1);
      if (grp?.isAnnouncementOnly) {
        const [gm] = await db
          .select()
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, grp.id), eq(groupMembers.userId, myId)))
          .limit(1);
        if (gm?.role !== 'admin') {
          return res.status(403).json({
            error: 'Only group administrators can send messages in announcement mode.',
          });
        }
      }
    }

    // Check block status for 1:1 chats
    const peers = await getParticipantUserIds(convId);
    const otherIds = peers.filter((id) => id !== myId);
    if (conv.type === 'direct' && otherIds.length === 1) {
      const [blocked] = await db
        .select()
        .from(blockedUsers)
        .where(
          or(
            and(
              eq(blockedUsers.blockerId, myId),
              eq(blockedUsers.blockedId, otherIds[0])
            ),
            and(
              eq(blockedUsers.blockerId, otherIds[0]),
              eq(blockedUsers.blockedId, myId)
            )
          )
        )
        .limit(1);
      if (blocked) {
        return res.status(403).json({
          error: 'Messaging unavailable because one user has blocked the other.',
        });
      }
    }

    const mentionMatches = String(content).match(/@([a-zA-Z0-9_]+)/g) || [];
    const mentions = mentionMatches.map((m) => m.slice(1).toLowerCase());

    const expiresAt =
      conv.disappearingSeconds > 0
        ? new Date(Date.now() + conv.disappearingSeconds * 1000)
        : null;

    const [inserted] = await db
      .insert(messages)
      .values({
        conversationId: convId,
        senderId: myId,
        type: String(type),
        content: String(content),
        encryptedPayload,
        isEncrypted: Boolean(isEncrypted),
        replyToMessageId: replyToMessageId ? Number(replyToMessageId) : null,
        forwardedFromId: forwardedFromId ? Number(forwardedFromId) : null,
        mentions,
        metadataJson,
        expiresAt,
        deliveryStatus: 'delivered',
      })
      .returning();

    const savedAttachments: (typeof messageAttachments.$inferSelect)[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const [saved] = await db
          .insert(messageAttachments)
          .values({
            messageId: inserted.id,
            fileName: String(att.fileName || 'attachment'),
            fileType: String(att.fileType || 'document'),
            mimeType: String(att.mimeType || 'application/octet-stream'),
            fileSize: Number(att.fileSize || 0),
            fileUrl: String(att.fileUrl),
            durationSeconds: att.durationSeconds ? Number(att.durationSeconds) : null,
          })
          .returning();
        savedAttachments.push(saved);
      }
    }

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, convId));

    if (otherIds.length > 0) {
      await db
        .update(conversationParticipants)
        .set({ unreadCount: sql`${conversationParticipants.unreadCount} + 1` })
        .where(
          and(
            eq(conversationParticipants.conversationId, convId),
            inArray(conversationParticipants.userId, otherIds)
          )
        );
    }

    const [senderProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, myId))
      .limit(1);

    const hydrated = {
      ...inserted,
      senderName: senderProfile?.fullName || 'SmartConnect User',
      senderUsername: senderProfile?.username || 'user',
      senderAvatar: senderProfile?.avatarUrl || null,
      attachments: savedAttachments,
      reactions: [],
      isStarred: false,
    };

    // Broadcast to all participants including sender's other devices
    sendToUsers(peers, 'message:new', {
      conversationId: convId,
      message: hydrated,
    });

    // Save notifications for muted=false peers
    if (otherIds.length > 0) {
      const peerSettings = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, convId),
            inArray(conversationParticipants.userId, otherIds)
          )
        );
      for (const ps of peerSettings) {
        if (!ps.isMuted) {
          const notifBody = isEncrypted
            ? 'New encrypted message'
            : String(content).slice(0, 80) || `Sent a ${type}`;
          const [notif] = await db
            .insert(notifications)
            .values({
              userId: ps.userId,
              type: conv.type === 'group' ? 'group' : 'message',
              title: senderProfile?.fullName || 'New Message',
              body: notifBody,
              referenceId: String(convId),
            })
            .returning();
          sendToUser(ps.userId, 'notification:new', notif);
        }
      }
    }

    return res.status(201).json({ message: hydrated });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

chatsRouter.post('/:id/read', async (req: AuthRequest, res) => {
  try {
    const convId = Number(req.params.id);
    const myId = req.authUser!.id;

    await db
      .update(conversationParticipants)
      .set({ unreadCount: 0 })
      .where(
        and(
          eq(conversationParticipants.conversationId, convId),
          eq(conversationParticipants.userId, myId)
        )
      );

    const [myProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, myId))
      .limit(1);

    if (myProfile?.privacyReadReceipts !== false) {
      await db
        .update(messages)
        .set({ deliveryStatus: 'read' })
        .where(
          and(
            eq(messages.conversationId, convId),
            sql`${messages.senderId} != ${myId}`
          )
        );

      const peers = await getParticipantUserIds(convId);
      sendToUsers(
        peers.filter((id) => id !== myId),
        'message:read',
        { conversationId: convId, readerId: myId }
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ error: 'Failed to update read status.' });
  }
});

chatsRouter.patch('/messages/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const myId = req.authUser!.id;
    const { content } = req.body || {};
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Content is required.' });
    }

    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!msg || msg.senderId !== myId) {
      return res.status(403).json({ error: 'Cannot edit this message.' });
    }

    const [updated] = await db
      .update(messages)
      .set({
        content: String(content).trim(),
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    const peers = await getParticipantUserIds(msg.conversationId);
    sendToUsers(peers, 'message:updated', {
      conversationId: msg.conversationId,
      message: updated,
    });

    return res.json({ message: updated });
  } catch (err) {
    console.error('Edit message error:', err);
    return res.status(500).json({ error: 'Failed to edit message.' });
  }
});

chatsRouter.delete('/messages/:messageId', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const myId = req.authUser!.id;

    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!msg || msg.senderId !== myId) {
      return res.status(403).json({ error: 'Cannot delete this message.' });
    }

    const [updated] = await db
      .update(messages)
      .set({
        isDeleted: true,
        content: 'This message was deleted',
        encryptedPayload: null,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    const peers = await getParticipantUserIds(msg.conversationId);
    sendToUsers(peers, 'message:deleted', {
      conversationId: msg.conversationId,
      messageId: msg.id,
    });

    return res.json({ message: updated });
  } catch (err) {
    console.error('Delete message error:', err);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

chatsRouter.post('/messages/:messageId/pin', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });

    const [updated] = await db
      .update(messages)
      .set({ isPinned: !msg.isPinned })
      .where(eq(messages.id, messageId))
      .returning();

    const peers = await getParticipantUserIds(msg.conversationId);
    sendToUsers(peers, 'message:updated', {
      conversationId: msg.conversationId,
      message: updated,
    });

    return res.json({ isPinned: updated.isPinned });
  } catch (err) {
    console.error('Pin message error:', err);
    return res.status(500).json({ error: 'Failed to pin message.' });
  }
});

chatsRouter.post('/messages/:messageId/star', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const myId = req.authUser!.id;

    const existing = await db
      .select()
      .from(starredMessages)
      .where(
        and(
          eq(starredMessages.messageId, messageId),
          eq(starredMessages.userId, myId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(starredMessages).where(eq(starredMessages.id, existing[0].id));
      return res.json({ isStarred: false });
    } else {
      await db.insert(starredMessages).values({ messageId, userId: myId });
      return res.json({ isStarred: true });
    }
  } catch (err) {
    console.error('Star message error:', err);
    return res.status(500).json({ error: 'Failed to star message.' });
  }
});

chatsRouter.get('/starred', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        content: messages.content,
        type: messages.type,
        createdAt: messages.createdAt,
        senderName: profiles.fullName,
      })
      .from(starredMessages)
      .innerJoin(messages, eq(messages.id, starredMessages.messageId))
      .innerJoin(profiles, eq(profiles.userId, messages.senderId))
      .where(eq(starredMessages.userId, myId))
      .orderBy(desc(starredMessages.createdAt));
    return res.json({ starred: rows });
  } catch (err) {
    console.error('Get starred error:', err);
    return res.status(500).json({ error: 'Failed to fetch starred messages.' });
  }
});

chatsRouter.post('/messages/:messageId/react', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const myId = req.authUser!.id;
    const emoji = String(req.body?.emoji || '👍');

    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!msg) return res.status(404).json({ error: 'Message not found.' });

    const existing = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, myId)
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].emoji === emoji) {
      await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
    } else {
      await db
        .insert(messageReactions)
        .values({ messageId, userId: myId, emoji })
        .onConflictDoUpdate({
          target: [messageReactions.messageId, messageReactions.userId],
          set: { emoji },
        });
    }

    const reactions = await db
      .select({
        id: messageReactions.id,
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        username: profiles.username,
      })
      .from(messageReactions)
      .innerJoin(profiles, eq(profiles.userId, messageReactions.userId))
      .where(eq(messageReactions.messageId, messageId));

    const peers = await getParticipantUserIds(msg.conversationId);
    sendToUsers(peers, 'message:reaction', {
      conversationId: msg.conversationId,
      messageId,
      reactions,
    });

    return res.json({ reactions });
  } catch (err) {
    console.error('Reaction error:', err);
    return res.status(500).json({ error: 'Failed to react.' });
  }
});

chatsRouter.post('/polls/:messageId/vote', async (req: AuthRequest, res) => {
  try {
    const messageId = Number(req.params.messageId);
    const myId = req.authUser!.id;
    const optionIndex = Number(req.body?.optionIndex);

    const [msg] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!msg || msg.type !== 'poll' || !msg.metadataJson) {
      return res.status(404).json({ error: 'Poll not found.' });
    }

    const meta = msg.metadataJson as {
      question: string;
      options: Array<{ text: string; votes: number[] }>;
    };

    const updatedOptions = meta.options.map((opt, idx) => {
      const filtered = (opt.votes || []).filter((uid) => uid !== myId);
      if (idx === optionIndex) filtered.push(myId);
      return { ...opt, votes: filtered };
    });

    const newMeta = { ...meta, options: updatedOptions };
    const [updated] = await db
      .update(messages)
      .set({ metadataJson: newMeta })
      .where(eq(messages.id, messageId))
      .returning();

    const peers = await getParticipantUserIds(msg.conversationId);
    sendToUsers(peers, 'message:updated', {
      conversationId: msg.conversationId,
      message: updated,
    });

    return res.json({ message: updated });
  } catch (err) {
    console.error('Poll vote error:', err);
    return res.status(500).json({ error: 'Failed to submit vote.' });
  }
});

chatsRouter.post('/messages/translate', async (req: AuthRequest, res) => {
  try {
    const { text, targetLanguage = 'Hindi' } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: 'Message text is required.' });
    }
    if (!aiClient) {
      return res.status(503).json({
        error: 'Translation requires GEMINI_API_KEY configured in Secrets.',
      });
    }

    const response = await aiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Translate the following chat message naturally into ${targetLanguage}. Return ONLY the translated text without quotes or explanations:\n\n${text}`,
    });

    return res.json({
      translatedText: (response.text || '').trim(),
      targetLanguage,
    });
  } catch (err) {
    console.error('Translate error:', err);
    return res.status(500).json({ error: 'Translation service failed.' });
  }
});
