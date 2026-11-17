import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users, profiles, userSessions, adminAccounts } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${firebaseConfig.projectId}:${firebaseConfig.apiKey}:sc`).digest('hex');

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  mobileNumber: string | null;
  role: string;
  status: string;
  isVerified: boolean;
  twoFactorEnabled: boolean;
  e2ePublicKey: string | null;
  sessionTokenId?: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export function signSessionToken(userId: number, tokenId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, tid: tokenId, iat: Date.now() })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `sc_${payload}.${sig}`;
}

export function verifySessionToken(
  token: string
): { uid: number; tid: string } | null {
  if (!token.startsWith('sc_')) return null;
  const raw = token.slice(3);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.uid === 'number' && typeof parsed.tid === 'string') {
      return { uid: parsed.uid, tid: parsed.tid };
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyBearerToken(
  token: string
): Promise<AuthenticatedUser | null> {
  // 1. Check SmartConnect HMAC session token
  if (token.startsWith('sc_')) {
    const decoded = verifySessionToken(token);
    if (!decoded) return null;

    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.tokenId, decoded.tid),
          eq(userSessions.userId, decoded.uid),
          eq(userSessions.isActive, true)
        )
      )
      .limit(1);

    if (!session) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.uid))
      .limit(1);

    if (!user || user.status !== 'active') return null;

    // Touch session activity asynchronously
    db.update(userSessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(userSessions.id, session.id))
      .catch(() => {});

    return {
      id: user.id,
      uid: user.uid,
      email: user.email,
      mobileNumber: user.mobileNumber,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      e2ePublicKey: user.e2ePublicKey,
      sessionTokenId: decoded.tid,
    };
  }

  // 2. Otherwise verify Firebase ID token
  try {
    const decodedFirebase = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateFirebaseUser(
      decodedFirebase.uid,
      decodedFirebase.email || `${decodedFirebase.uid}@smartconnect.app`,
      decodedFirebase.name || 'SmartConnect User',
      decodedFirebase.picture || null
    );
    if (!dbUser || dbUser.status !== 'active') return null;
    return {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      mobileNumber: dbUser.mobileNumber,
      role: dbUser.role,
      status: dbUser.status,
      isVerified: dbUser.isVerified,
      twoFactorEnabled: dbUser.twoFactorEnabled,
      e2ePublicKey: dbUser.e2ePublicKey,
    };
  } catch {
    return null;
  }
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  fullName: string,
  avatarUrl: string | null
) {
  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail.length > 0 && existingByEmail[0].uid !== uid) {
    // Link existing email user to Firebase uid
    const [updated] = await db
      .update(users)
      .set({ uid, isVerified: true, updatedAt: new Date() })
      .where(eq(users.id, existingByEmail[0].id))
      .returning();
    return updated;
  }

  const [{ value: adminCount }] = await db
    .select({ value: count() })
    .from(adminAccounts);

  const shouldPromoteAdmin =
    adminCount === 0 || email.toLowerCase() === 'dksingh1978.jeh@gmail.com';

  const [upserted] = await db
    .insert(users)
    .values({
      uid,
      email,
      isVerified: true,
      role: shouldPromoteAdmin ? 'admin' : 'user',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        isVerified: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Ensure profile exists
  const existingProfile = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, upserted.id))
    .limit(1);

  if (existingProfile.length === 0) {
    const baseHandle =
      email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'user';
    const uniqueHandle = `${baseHandle}_${upserted.id}`;
    await db
      .insert(profiles)
      .values({
        userId: upserted.id,
        fullName: fullName || baseHandle,
        username: uniqueHandle,
        avatarUrl,
        onlineStatus: 'online',
      })
      .onConflictDoNothing();
  }

  if (shouldPromoteAdmin) {
    await db
      .insert(adminAccounts)
      .values({
        userId: upserted.id,
        permissionsLevel: 'super_admin',
        notes: 'Initial platform administrator',
      })
      .onConflictDoNothing();
  }

  return upserted;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = authHeader.slice(7).trim();
  try {
    const authUser = await verifyBearerToken(token);
    if (!authUser) {
      return res.status(401).json({ error: 'Session expired or account suspended.' });
    }
    req.authUser = authUser;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.authUser.role !== 'admin') {
    const [adminRow] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.userId, req.authUser.id))
      .limit(1);
    if (!adminRow) {
      return res.status(403).json({ error: 'Administrator privileges required.' });
    }
  }
  next();
};
