import { Router } from 'express';
import { eq, or, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { calls, profiles, notifications } from '../../db/schema.ts';
import { requireAuth } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { sendToUser, sendToUsers } from '../websocket.ts';

export const callsRouter = Router();
callsRouter.use(requireAuth);

callsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const rows = await db
      .select()
      .from(calls)
      .where(or(eq(calls.callerId, myId), eq(calls.calleeId, myId)))
      .orderBy(desc(calls.createdAt))
      .limit(60);

    const allProfiles = await db
      .select({
        userId: profiles.userId,
        fullName: profiles.fullName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles);
    const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));

    const hydrated = rows.map((c) => ({
      ...c,
      caller: profileMap.get(c.callerId) || null,
      callee: c.calleeId ? profileMap.get(c.calleeId) || null : null,
    }));

    return res.json({ calls: hydrated });
  } catch (err) {
    console.error('Get calls error:', err);
    return res.status(500).json({ error: 'Failed to load call history.' });
  }
});

callsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const {
      conversationId = null,
      calleeId = null,
      calleeIds = [],
      callType = 'audio',
    } = req.body || {};

    const [created] = await db
      .insert(calls)
      .values({
        conversationId: conversationId ? Number(conversationId) : null,
        callerId: myId,
        calleeId: calleeId ? Number(calleeId) : null,
        callType: String(callType),
        status: 'ringing',
      })
      .returning();

    const [callerProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, myId))
      .limit(1);

    const targets = new Set<number>();
    if (calleeId) targets.add(Number(calleeId));
    if (Array.isArray(calleeIds)) {
      for (const id of calleeIds) {
        if (Number(id) && Number(id) !== myId) targets.add(Number(id));
      }
    }

    const targetList = Array.from(targets);
    if (targetList.length > 0) {
      sendToUsers(targetList, 'call:incoming', {
        callId: created.id,
        conversationId: created.conversationId,
        callType: created.callType,
        callerId: myId,
        callerName: callerProfile?.fullName || 'SmartConnect User',
        callerAvatar: callerProfile?.avatarUrl || null,
      });
    }

    return res.status(201).json({ call: created });
  } catch (err) {
    console.error('Start call error:', err);
    return res.status(500).json({ error: 'Failed to initiate call.' });
  }
});

callsRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const callId = Number(req.params.id);
    const { status, durationSeconds } = req.body || {};

    const [existing] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Call not found.' });

    const updates: Record<string, unknown> = {};
    if (status) updates.status = String(status);
    if (durationSeconds !== undefined) updates.durationSeconds = Number(durationSeconds);
    if (status === 'ended' || status === 'missed' || status === 'declined') {
      updates.endedAt = new Date();
    }

    const [updated] = await db
      .update(calls)
      .set(updates)
      .where(eq(calls.id, callId))
      .returning();

    if (status === 'missed' && existing.calleeId) {
      const [callerProfile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, existing.callerId))
        .limit(1);
      const [notif] = await db
        .insert(notifications)
        .values({
          userId: existing.calleeId,
          type: 'call',
          title: 'Missed Call',
          body: `Missed ${existing.callType} call from ${callerProfile?.fullName || 'User'}`,
          referenceId: String(existing.id),
        })
        .returning();
      sendToUser(existing.calleeId, 'notification:new', notif);
    }

    return res.json({ call: updated });
  } catch (err) {
    console.error('Update call error:', err);
    return res.status(500).json({ error: 'Failed to update call.' });
  }
});
