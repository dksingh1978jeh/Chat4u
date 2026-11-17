import { Router } from 'express';
import { eq, gt, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  statusUpdates,
  statusReactions,
  profiles,
  contacts,
  blockedUsers,
} from '../../db/schema.ts';
import { requireAuth } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { broadcastToAll } from '../websocket.ts';

export const statusRouter = Router();
statusRouter.use(requireAuth);

statusRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const now = new Date();

    const rows = await db
      .select({
        id: statusUpdates.id,
        userId: statusUpdates.userId,
        mediaType: statusUpdates.mediaType,
        content: statusUpdates.content,
        mediaUrl: statusUpdates.mediaUrl,
        bgColor: statusUpdates.bgColor,
        privacy: statusUpdates.privacy,
        viewsCount: statusUpdates.viewsCount,
        expiresAt: statusUpdates.expiresAt,
        createdAt: statusUpdates.createdAt,
        authorName: profiles.fullName,
        authorUsername: profiles.username,
        authorAvatar: profiles.avatarUrl,
        authorPrivacyStatus: profiles.privacyStatus,
      })
      .from(statusUpdates)
      .innerJoin(profiles, eq(profiles.userId, statusUpdates.userId))
      .where(gt(statusUpdates.expiresAt, now))
      .orderBy(desc(statusUpdates.createdAt));

    const myContacts = await db
      .select({ contactUserId: contacts.contactUserId })
      .from(contacts)
      .where(eq(contacts.ownerId, myId));
    const contactSet = new Set(myContacts.map((c) => c.contactUserId));

    const blocks = await db
      .select()
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, myId));
    const blockedSet = new Set(blocks.map((b) => b.blockedId));

    const visible = rows.filter((s) => {
      if (s.userId === myId) return true;
      if (blockedSet.has(s.userId)) return false;
      if (s.privacy === 'contacts') return contactSet.has(s.userId);
      return true;
    });

    const ids = visible.map((s) => s.id);
    let reactions: Array<{
      id: number;
      statusId: number;
      userId: number;
      emoji: string | null;
      replyText: string | null;
      createdAt: Date;
      userName: string;
    }> = [];

    if (ids.length > 0) {
      reactions = await db
        .select({
          id: statusReactions.id,
          statusId: statusReactions.statusId,
          userId: statusReactions.userId,
          emoji: statusReactions.emoji,
          replyText: statusReactions.replyText,
          createdAt: statusReactions.createdAt,
          userName: profiles.fullName,
        })
        .from(statusReactions)
        .innerJoin(profiles, eq(profiles.userId, statusReactions.userId))
        .where(inArray(statusReactions.statusId, ids));
    }

    const reactMap = new Map<number, typeof reactions>();
    for (const r of reactions) {
      const list = reactMap.get(r.statusId) || [];
      list.push(r);
      reactMap.set(r.statusId, list);
    }

    return res.json({
      statuses: visible.map((s) => ({
        ...s,
        reactions: reactMap.get(s.id) || [],
      })),
    });
  } catch (err) {
    console.error('Get statuses error:', err);
    return res.status(500).json({ error: 'Failed to load status updates.' });
  }
});

statusRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const {
      mediaType = 'text',
      content = '',
      mediaUrl = null,
      bgColor = '#064E3B',
      privacy = 'everyone',
    } = req.body || {};

    if (mediaType === 'text' && !content?.trim()) {
      return res.status(400).json({ error: 'Status text is required.' });
    }
    if ((mediaType === 'image' || mediaType === 'video') && !mediaUrl) {
      return res.status(400).json({ error: 'Media file is required.' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [created] = await db
      .insert(statusUpdates)
      .values({
        userId: myId,
        mediaType,
        content: String(content),
        mediaUrl,
        bgColor,
        privacy,
        expiresAt,
      })
      .returning();

    broadcastToAll('status:new', { statusId: created.id, userId: myId });

    return res.status(201).json({ status: created });
  } catch (err) {
    console.error('Create status error:', err);
    return res.status(500).json({ error: 'Failed to post status.' });
  }
});

statusRouter.post('/:id/view', async (req: AuthRequest, res) => {
  try {
    const statusId = Number(req.params.id);
    await db
      .update(statusUpdates)
      .set({ viewsCount: sql`${statusUpdates.viewsCount} + 1` })
      .where(eq(statusUpdates.id, statusId));
    return res.json({ viewed: true });
  } catch (err) {
    console.error('View status error:', err);
    return res.status(500).json({ error: 'Failed to record view.' });
  }
});

statusRouter.post('/:id/react', async (req: AuthRequest, res) => {
  try {
    const statusId = Number(req.params.id);
    const myId = req.authUser!.id;
    const { emoji, replyText } = req.body || {};

    const [created] = await db
      .insert(statusReactions)
      .values({
        statusId,
        userId: myId,
        emoji: emoji || null,
        replyText: replyText || null,
      })
      .returning();

    return res.status(201).json({ reaction: created });
  } catch (err) {
    console.error('React status error:', err);
    return res.status(500).json({ error: 'Failed to send status reaction.' });
  }
});

statusRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const statusId = Number(req.params.id);
    const [status] = await db
      .select()
      .from(statusUpdates)
      .where(eq(statusUpdates.id, statusId))
      .limit(1);
    if (!status || status.userId !== req.authUser!.id) {
      return res.status(403).json({ error: 'Cannot delete this status.' });
    }
    await db.delete(statusUpdates).where(eq(statusUpdates.id, statusId));
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete status error:', err);
    return res.status(500).json({ error: 'Failed to delete status.' });
  }
});
