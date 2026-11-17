import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { eq, ilike, or, and, ne, inArray, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  users,
  profiles,
  contacts,
  blockedUsers,
  reports,
  notifications,
} from '../../db/schema.ts';
import { requireAuth } from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { broadcastToAll } from '../websocket.ts';
import { UPLOADS_DIR } from './uploads.ts';

const aiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const myId = req.authUser!.id;

    const myBlocks = await db
      .select()
      .from(blockedUsers)
      .where(or(eq(blockedUsers.blockerId, myId), eq(blockedUsers.blockedId, myId)));

    const blockedIds = new Set<number>();
    for (const b of myBlocks) {
      if (b.blockerId === myId) blockedIds.add(b.blockedId);
      if (b.blockedId === myId) blockedIds.add(b.blockerId);
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        mobileNumber: users.mobileNumber,
        e2ePublicKey: users.e2ePublicKey,
        fullName: profiles.fullName,
        username: profiles.username,
        bio: profiles.bio,
        avatarUrl: profiles.avatarUrl,
        onlineStatus: profiles.onlineStatus,
        lastSeenAt: profiles.lastSeenAt,
        privacyProfilePhoto: profiles.privacyProfilePhoto,
        privacyLastSeen: profiles.privacyLastSeen,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          ne(users.id, myId),
          eq(users.status, 'active'),
          q
            ? or(
                ilike(profiles.fullName, `%${q}%`),
                ilike(profiles.username, `%${q}%`),
                ilike(users.mobileNumber, `%${q}%`),
                ilike(users.email, `%${q}%`)
              )
            : undefined
        )
      )
      .limit(40);

    const myContacts = await db
      .select({ contactUserId: contacts.contactUserId })
      .from(contacts)
      .where(eq(contacts.ownerId, myId));
    const contactSet = new Set(myContacts.map((c) => c.contactUserId));

    const results = rows
      .filter((r) => !blockedIds.has(r.id))
      .map((r) => {
        const isContact = contactSet.has(r.id);
        const canSeePhoto =
          r.privacyProfilePhoto === 'everyone' ||
          (r.privacyProfilePhoto === 'contacts' && isContact);
        const canSeeLastSeen =
          r.privacyLastSeen === 'everyone' ||
          (r.privacyLastSeen === 'contacts' && isContact);

        return {
          id: r.id,
          fullName: r.fullName,
          username: r.username,
          bio: r.bio,
          mobileNumber: r.mobileNumber,
          e2ePublicKey: r.e2ePublicKey,
          avatarUrl: canSeePhoto ? r.avatarUrl : null,
          onlineStatus: canSeeLastSeen ? r.onlineStatus : 'hidden',
          lastSeenAt: canSeeLastSeen ? r.lastSeenAt : null,
          isContact,
        };
      });

    return res.json({ users: results });
  } catch (err) {
    console.error('User search error:', err);
    return res.status(500).json({ error: 'Search failed.' });
  }
});

usersRouter.patch('/profile', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const {
      fullName,
      username,
      bio,
      avatarUrl,
      mobileNumber,
      privacyProfilePhoto,
      privacyLastSeen,
      privacyReadReceipts,
      privacyStatus,
      language,
      theme,
      notificationSound,
      defaultWallpaper,
      onlineStatus,
    } = req.body || {};

    if (username) {
      const clean = String(username).toLowerCase().replace(/[^a-z0-9_]/g, '');
      const taken = await db
        .select()
        .from(profiles)
        .where(and(eq(profiles.username, clean), ne(profiles.userId, myId)))
        .limit(1);
      if (taken.length > 0) {
        return res.status(409).json({ error: 'That username is already taken.' });
      }
    }

    if (mobileNumber) {
      const cleanMobile = String(mobileNumber).trim();
      const takenMobile = await db
        .select()
        .from(users)
        .where(and(eq(users.mobileNumber, cleanMobile), ne(users.id, myId)))
        .limit(1);
      if (takenMobile.length > 0) {
        return res.status(409).json({ error: 'Mobile number already linked to another account.' });
      }
      await db
        .update(users)
        .set({ mobileNumber: cleanMobile, updatedAt: new Date() })
        .where(eq(users.id, myId));
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (fullName !== undefined) updateFields.fullName = String(fullName).trim();
    if (username !== undefined)
      updateFields.username = String(username).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (bio !== undefined) updateFields.bio = String(bio);
    if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;
    if (privacyProfilePhoto !== undefined) updateFields.privacyProfilePhoto = privacyProfilePhoto;
    if (privacyLastSeen !== undefined) updateFields.privacyLastSeen = privacyLastSeen;
    if (privacyReadReceipts !== undefined) updateFields.privacyReadReceipts = Boolean(privacyReadReceipts);
    if (privacyStatus !== undefined) updateFields.privacyStatus = privacyStatus;
    if (language !== undefined) updateFields.language = language;
    if (theme !== undefined) updateFields.theme = theme;
    if (notificationSound !== undefined) updateFields.notificationSound = notificationSound;
    if (defaultWallpaper !== undefined) updateFields.defaultWallpaper = defaultWallpaper;
    if (onlineStatus !== undefined) updateFields.onlineStatus = onlineStatus;

    const [updated] = await db
      .update(profiles)
      .set(updateFields)
      .where(eq(profiles.userId, myId))
      .returning();

    if (onlineStatus !== undefined) {
      broadcastToAll('presence:update', {
        userId: myId,
        onlineStatus,
        lastSeenAt: new Date().toISOString(),
      });
    }

    return res.json({ profile: updated });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

usersRouter.get('/contacts', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const rows = await db
      .select({
        contactId: contacts.id,
        nickname: contacts.nickname,
        isSynced: contacts.isSynced,
        userId: users.id,
        mobileNumber: users.mobileNumber,
        email: users.email,
        e2ePublicKey: users.e2ePublicKey,
        fullName: profiles.fullName,
        username: profiles.username,
        bio: profiles.bio,
        avatarUrl: profiles.avatarUrl,
        onlineStatus: profiles.onlineStatus,
        lastSeenAt: profiles.lastSeenAt,
      })
      .from(contacts)
      .innerJoin(users, eq(users.id, contacts.contactUserId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(contacts.ownerId, myId));

    return res.json({ contacts: rows });
  } catch (err) {
    console.error('Get contacts error:', err);
    return res.status(500).json({ error: 'Failed to fetch contacts.' });
  }
});

usersRouter.post('/contacts', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const { contactUserId, identifier, nickname } = req.body || {};

    let targetId = Number(contactUserId);
    if (!targetId && identifier) {
      const clean = String(identifier).trim();
      const [found] = await db
        .select()
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(
          or(
            eq(users.mobileNumber, clean),
            eq(users.email, clean.toLowerCase()),
            eq(profiles.username, clean.toLowerCase())
          )
        )
        .limit(1);
      if (found) targetId = found.users.id;
    }

    if (!targetId || targetId === myId) {
      return res.status(400).json({ error: 'Valid contact user not found.' });
    }

    const [created] = await db
      .insert(contacts)
      .values({
        ownerId: myId,
        contactUserId: targetId,
        nickname: nickname || null,
        isSynced: false,
      })
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.contactUserId],
        set: { nickname: nickname || null },
      })
      .returning();

    return res.status(201).json({ contact: created });
  } catch (err) {
    console.error('Add contact error:', err);
    return res.status(500).json({ error: 'Failed to add contact.' });
  }
});

usersRouter.post('/contacts/sync', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const { entries } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Entries array required.' });
    }

    const cleaned = entries.map((e: string) => String(e).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return res.json({ syncedCount: 0 });
    }

    const matchedUsers = await db
      .select()
      .from(users)
      .where(
        and(
          ne(users.id, myId),
          or(
            inArray(users.mobileNumber, cleaned),
            inArray(
              users.email,
              cleaned.map((c) => c.toLowerCase())
            )
          )
        )
      );

    let syncedCount = 0;
    for (const u of matchedUsers) {
      await db
        .insert(contacts)
        .values({
          ownerId: myId,
          contactUserId: u.id,
          isSynced: true,
        })
        .onConflictDoNothing();
      syncedCount++;
    }

    return res.json({ syncedCount });
  } catch (err) {
    console.error('Sync contacts error:', err);
    return res.status(500).json({ error: 'Contact sync failed.' });
  }
});

usersRouter.delete('/contacts/:userId', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const targetId = Number(req.params.userId);
    await db
      .delete(contacts)
      .where(and(eq(contacts.ownerId, myId), eq(contacts.contactUserId, targetId)));
    return res.json({ removed: true });
  } catch (err) {
    console.error('Remove contact error:', err);
    return res.status(500).json({ error: 'Failed to remove contact.' });
  }
});

usersRouter.get('/blocked', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const rows = await db
      .select({
        id: blockedUsers.id,
        blockedId: blockedUsers.blockedId,
        createdAt: blockedUsers.createdAt,
        fullName: profiles.fullName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
      })
      .from(blockedUsers)
      .innerJoin(profiles, eq(profiles.userId, blockedUsers.blockedId))
      .where(eq(blockedUsers.blockerId, myId));

    return res.json({ blocked: rows });
  } catch (err) {
    console.error('Blocked list error:', err);
    return res.status(500).json({ error: 'Failed to fetch blocked users.' });
  }
});

usersRouter.post('/block', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const blockedId = Number(req.body?.userId);
    if (!blockedId || blockedId === myId) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }
    await db
      .insert(blockedUsers)
      .values({ blockerId: myId, blockedId })
      .onConflictDoNothing();
    return res.json({ blocked: true });
  } catch (err) {
    console.error('Block user error:', err);
    return res.status(500).json({ error: 'Failed to block user.' });
  }
});

usersRouter.delete('/block/:userId', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const blockedId = Number(req.params.userId);
    await db
      .delete(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, myId), eq(blockedUsers.blockedId, blockedId)));
    return res.json({ unblocked: true });
  } catch (err) {
    console.error('Unblock user error:', err);
    return res.status(500).json({ error: 'Failed to unblock user.' });
  }
});

usersRouter.post('/report', async (req: AuthRequest, res) => {
  try {
    const myId = req.authUser!.id;
    const { reportedUserId, conversationId, reason, details } = req.body || {};
    if (!reportedUserId || !reason) {
      return res.status(400).json({ error: 'Reported user and reason are required.' });
    }
    const [created] = await db
      .insert(reports)
      .values({
        reporterId: myId,
        reportedUserId: Number(reportedUserId),
        conversationId: conversationId ? Number(conversationId) : null,
        reason: String(reason),
        details: String(details || ''),
      })
      .returning();

    return res.status(201).json({ report: created });
  } catch (err) {
    console.error('Report error:', err);
    return res.status(500).json({ error: 'Failed to submit report.' });
  }
});

usersRouter.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.authUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return res.json({ notifications: rows });
  } catch (err) {
    console.error('Notifications error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

usersRouter.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.authUser!.id));
    return res.json({ ok: true });
  } catch (err) {
    console.error('Mark notifications error:', err);
    return res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

function sanitizeGeneratedSvg(rawText: string): string | null {
  const withoutFences = rawText
    .replace(/```(?:svg|xml|html)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const match = withoutFences.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;

  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*(?:"https?:[^"]*"|'https?:[^']*')/gi, '')
    .replace(/javascript:/gi, '');

  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg)) {
    svg = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}

usersRouter.post('/generate-wallpaper', async (req: AuthRequest, res) => {
  try {
    const rawPrompt = String(req.body?.prompt || '').trim();
    const style = String(req.body?.style || 'Organic Abstract').trim();
    if (!rawPrompt) {
      return res.status(400).json({ error: 'Please describe the wallpaper you want to generate.' });
    }
    if (rawPrompt.length > 400) {
      return res.status(400).json({ error: 'Prompt must be 400 characters or fewer.' });
    }
    if (!aiClient) {
      return res.status(503).json({
        error: 'AI wallpaper generation requires GEMINI_API_KEY configured on the server.',
      });
    }

    const instruction = [
      'Design a calm, modern, aesthetic chat room background wallpaper as a single self-contained SVG document.',
      `Theme prompt: "${rawPrompt}".`,
      `Visual style: "${style}".`,
      'Technical requirements:',
      '- Output ONLY valid raw <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice">...</svg> with no markdown fences and no explanation.',
      '- Use rich <defs> with harmonious linearGradient and radialGradient fills, soft translucent layered shapes, organic waves, botanical silhouettes, or delicate geometric textures.',
      '- Keep contrast soft and balanced so chat message bubbles remain comfortable and easy to read on top.',
      '- Never include <text>, <script>, <foreignObject>, <image>, external URLs, or inline event handlers.',
    ].join('\n');

    const response = await aiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: instruction,
    });

    const svgContent = sanitizeGeneratedSvg(response.text || '');
    if (!svgContent || svgContent.length < 80) {
      return res.status(502).json({
        error: 'The AI generator did not return valid wallpaper artwork. Please try another prompt.',
      });
    }

    const filename = `ai_wallpaper_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.svg`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), svgContent, 'utf8');

    return res.status(201).json({
      fileUrl: `/uploads/${filename}`,
      prompt: rawPrompt,
      style,
    });
  } catch (err) {
    console.error('AI wallpaper generation error:', err);
    return res.status(500).json({ error: 'Failed to generate AI wallpaper.' });
  }
});
