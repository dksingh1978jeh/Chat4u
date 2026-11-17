import { Router } from 'express';
import { eq, count, sum, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  users,
  profiles,
  messages,
  messageAttachments,
  groups,
  calls,
  reports,
  systemSettings,
  notifications,
  adminAccounts,
  statusUpdates,
} from '../../db/schema.ts';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { getOnlineUserIds, broadcastToAll } from '../websocket.ts';

export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

// NOTE: Administrators strictly only see aggregate metrics, user accounts, reports, storage, and settings.
// Private message contents and encrypted payloads are NEVER queried or returned here.

adminRouter.get('/overview', async (_req: AuthRequest, res) => {
  try {
    const [{ totalUsers }] = await db
      .select({ totalUsers: count() })
      .from(users);
    const [{ activeUsers }] = await db
      .select({ activeUsers: count() })
      .from(users)
      .where(eq(users.status, 'active'));
    const [{ totalMessages }] = await db
      .select({ totalMessages: count() })
      .from(messages);
    const [{ totalGroups }] = await db
      .select({ totalGroups: count() })
      .from(groups);
    const [{ totalCalls }] = await db
      .select({ totalCalls: count() })
      .from(calls);
    const [{ totalStatuses }] = await db
      .select({ totalStatuses: count() })
      .from(statusUpdates);
    const [{ storageBytes }] = await db
      .select({ storageBytes: sum(messageAttachments.fileSize) })
      .from(messageAttachments);
    const [{ pendingReports }] = await db
      .select({ pendingReports: count() })
      .from(reports)
      .where(eq(reports.status, 'pending'));

    // Aggregate daily message counts (no message contents exposed)
    const dailyRows = await db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as day, COUNT(*)::int as total
      FROM messages
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    const onlineUserIds = getOnlineUserIds();

    return res.json({
      metrics: {
        totalUsers,
        activeUsers,
        onlineUsers: onlineUserIds.length,
        totalMessages,
        totalGroups,
        totalCalls,
        totalStatuses,
        storageBytes: Number(storageBytes || 0),
        pendingReports,
      },
      dailyActivity: dailyRows.rows || [],
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    return res.status(500).json({ error: 'Failed to load analytics overview.' });
  }
});

adminRouter.get('/users', async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        mobileNumber: users.mobileNumber,
        role: users.role,
        status: users.status,
        isVerified: users.isVerified,
        twoFactorEnabled: users.twoFactorEnabled,
        createdAt: users.createdAt,
        fullName: profiles.fullName,
        username: profiles.username,
        onlineStatus: profiles.onlineStatus,
        lastSeenAt: profiles.lastSeenAt,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .orderBy(desc(users.createdAt));

    return res.json({ users: rows });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

adminRouter.patch('/users/:id/status', async (req: AuthRequest, res) => {
  try {
    const targetId = Number(req.params.id);
    const { status, role } = req.body || {};

    if (targetId === req.authUser!.id && status && status !== 'active') {
      return res.status(400).json({ error: 'Cannot suspend your own admin account.' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status && ['active', 'suspended', 'banned'].includes(status)) {
      updates.status = status;
    }
    if (role && ['user', 'admin'].includes(role)) {
      updates.role = role;
      if (role === 'admin') {
        await db
          .insert(adminAccounts)
          .values({ userId: targetId, permissionsLevel: 'moderator' })
          .onConflictDoNothing();
      } else {
        await db.delete(adminAccounts).where(eq(adminAccounts.userId, targetId));
      }
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, targetId))
      .returning();

    return res.json({
      user: {
        id: updated.id,
        status: updated.status,
        role: updated.role,
      },
    });
  } catch (err) {
    console.error('Admin update user error:', err);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

adminRouter.get('/reports', async (_req: AuthRequest, res) => {
  try {
    const allProfiles = await db
      .select({
        userId: profiles.userId,
        fullName: profiles.fullName,
        username: profiles.username,
      })
      .from(profiles);
    const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));

    const rows = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt))
      .limit(100);

    return res.json({
      reports: rows.map((r) => ({
        ...r,
        reporter: profileMap.get(r.reporterId) || null,
        reportedUser: profileMap.get(r.reportedUserId) || null,
      })),
    });
  } catch (err) {
    console.error('Admin reports error:', err);
    return res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

adminRouter.patch('/reports/:id', async (req: AuthRequest, res) => {
  try {
    const reportId = Number(req.params.id);
    const { status } = req.body || {};
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const [updated] = await db
      .update(reports)
      .set({ status, reviewedBy: req.authUser!.id })
      .where(eq(reports.id, reportId))
      .returning();

    return res.json({ report: updated });
  } catch (err) {
    console.error('Update report error:', err);
    return res.status(500).json({ error: 'Failed to update report.' });
  }
});

adminRouter.get('/settings', async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(systemSettings);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return res.json({ settings: map });
  } catch (err) {
    console.error('Get settings error:', err);
    return res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

adminRouter.patch('/settings', async (req: AuthRequest, res) => {
  try {
    const entries = Object.entries(req.body || {});
    for (const [key, val] of entries) {
      await db
        .insert(systemSettings)
        .values({ key, value: String(val), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: String(val), updatedAt: new Date() },
        });
    }
    return res.json({ saved: true });
  } catch (err) {
    console.error('Save settings error:', err);
    return res.status(500).json({ error: 'Failed to save system settings.' });
  }
});

adminRouter.post('/notifications', async (req: AuthRequest, res) => {
  try {
    const { title, body } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, 'active'));

    for (const u of activeUsers) {
      await db.insert(notifications).values({
        userId: u.id,
        type: 'admin',
        title: String(title).trim(),
        body: String(body).trim(),
      });
    }

    broadcastToAll('notification:new', {
      type: 'admin',
      title: String(title).trim(),
      body: String(body).trim(),
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({ sentTo: activeUsers.length });
  } catch (err) {
    console.error('Admin broadcast error:', err);
    return res.status(500).json({ error: 'Failed to send system notification.' });
  }
});
