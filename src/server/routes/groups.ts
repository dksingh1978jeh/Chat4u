import { Router } from 'express';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  conversations,
  conversationParticipants,
  groups,
  groupMembers,
  messages,
  profiles,
} from '../../db/schema.ts';
import { requireAuth } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { sendToUsers } from '../websocket.ts';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

groupsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, myId));

    if (memberships.length === 0) {
      return res.json({ groups: [] });
    }

    const gIds = memberships.map((m) => m.groupId);
    const groupRows = await db
      .select()
      .from(groups)
      .where(inArray(groups.id, gIds))
      .orderBy(desc(groups.createdAt));

    const allMembers = await db
      .select({
        groupId: groupMembers.groupId,
        userId: groupMembers.userId,
        role: groupMembers.role,
        fullName: profiles.fullName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
        onlineStatus: profiles.onlineStatus,
      })
      .from(groupMembers)
      .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
      .where(inArray(groupMembers.groupId, gIds));

    const enriched = groupRows.map((g) => ({
      ...g,
      members: allMembers.filter((m) => m.groupId === g.id),
    }));

    return res.json({ groups: enriched });
  } catch (err) {
    console.error('Get groups error:', err);
    return res.status(500).json({ error: 'Failed to load groups.' });
  }
});

groupsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const {
      name,
      description = '',
      avatarUrl = null,
      communityName = null,
      isAnnouncementOnly = false,
      memberIds = [],
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    const [conv] = await db
      .insert(conversations)
      .values({ type: 'group', createdBy: myId })
      .returning();

    const [group] = await db
      .insert(groups)
      .values({
        conversationId: conv.id,
        name: String(name).trim(),
        description: String(description),
        avatarUrl,
        communityName: communityName ? String(communityName).trim() : null,
        isAnnouncementOnly: Boolean(isAnnouncementOnly),
        createdBy: myId,
      })
      .returning();

    const uniqueMembers = new Set<number>([
      myId,
      ...(Array.isArray(memberIds) ? memberIds.map(Number).filter(Boolean) : []),
    ]);

    for (const uid of uniqueMembers) {
      const role = uid === myId ? 'admin' : 'member';
      await db.insert(groupMembers).values({ groupId: group.id, userId: uid, role });
      await db
        .insert(conversationParticipants)
        .values({ conversationId: conv.id, userId: uid, role });
    }

    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: myId,
      type: 'system',
      content: `Created group "${group.name}"`,
    });

    sendToUsers(Array.from(uniqueMembers), 'group:created', {
      group,
      conversationId: conv.id,
    });

    return res.status(201).json({ group, conversationId: conv.id });
  } catch (err) {
    console.error('Create group error:', err);
    return res.status(500).json({ error: 'Failed to create group.' });
  }
});

groupsRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const myId = req.authUser!.id;
    const { name, description, avatarUrl, isAnnouncementOnly, communityName } =
      req.body || {};

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, myId)))
      .limit(1);

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can update settings.' });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description);
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (isAnnouncementOnly !== undefined)
      updates.isAnnouncementOnly = Boolean(isAnnouncementOnly);
    if (communityName !== undefined) updates.communityName = communityName;

    const [updated] = await db
      .update(groups)
      .set(updates)
      .where(eq(groups.id, groupId))
      .returning();

    return res.json({ group: updated });
  } catch (err) {
    console.error('Update group error:', err);
    return res.status(500).json({ error: 'Failed to update group.' });
  }
});

groupsRouter.post('/:id/members', async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const myId = req.authUser!.id;
    const userId = Number(req.body?.userId);

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, myId)))
      .limit(1);

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can add members.' });
    }

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    await db
      .insert(groupMembers)
      .values({ groupId, userId, role: 'member' })
      .onConflictDoNothing();

    await db
      .insert(conversationParticipants)
      .values({ conversationId: group.conversationId, userId, role: 'member' })
      .onConflictDoNothing();

    return res.status(201).json({ added: true });
  } catch (err) {
    console.error('Add group member error:', err);
    return res.status(500).json({ error: 'Failed to add member.' });
  }
});

groupsRouter.delete('/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const myId = req.authUser!.id;

    if (targetUserId !== myId) {
      const [membership] = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, myId)))
        .limit(1);
      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can remove members.' });
      }
    }

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));

    await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, group.conversationId),
          eq(conversationParticipants.userId, targetUserId)
        )
      );

    return res.json({ removed: true });
  } catch (err) {
    console.error('Remove member error:', err);
    return res.status(500).json({ error: 'Failed to remove member.' });
  }
});

groupsRouter.patch('/:id/members/:userId/role', async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const myId = req.authUser!.id;
    const role = req.body?.role === 'admin' ? 'admin' : 'member';

    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, myId)))
      .limit(1);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can manage roles.' });
    }

    await db
      .update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));

    return res.json({ role });
  } catch (err) {
    console.error('Role update error:', err);
    return res.status(500).json({ error: 'Failed to update role.' });
  }
});
