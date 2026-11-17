import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq, or, desc, count } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  users,
  profiles,
  userSessions,
  notifications,
  adminAccounts,
} from '../../db/schema.ts';
import {
  requireAuth,
  signSessionToken,
  getOrCreateFirebaseUser,
} from '../auth.ts';
import type { AuthRequest } from '../auth.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { disconnectSession } from '../websocket.ts';

export const authRouter = Router();

function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function getDeviceName(userAgent: string): string {
  if (/Android/i.test(userAgent)) return 'Android Mobile';
  if (/iPhone|iPad/i.test(userAgent)) return 'iOS Device';
  if (/Mac/i.test(userAgent)) return 'macOS Desktop';
  if (/Windows/i.test(userAgent)) return 'Windows Desktop';
  if (/Linux/i.test(userAgent)) return 'Linux Workstation';
  return 'Web Browser';
}

async function createSessionForUser(userId: number, req: AuthRequest) {
  const tokenId = crypto.randomUUID();
  const ua = req.headers['user-agent'] || 'SmartConnect Client';
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  await db.insert(userSessions).values({
    userId,
    tokenId,
    deviceName: req.body?.deviceName || getDeviceName(ua),
    userAgent: ua.slice(0, 240),
    ipAddress: ip,
    isActive: true,
  });
  return { token: signSessionToken(userId, tokenId), tokenId };
}

authRouter.post('/register', async (req, res) => {
  try {
    const { mobileNumber, email, fullName, username, password } = req.body || {};
    if (!mobileNumber || !email || !fullName || !password) {
      return res.status(400).json({
        error: 'Mobile number, email, full name, and password are required.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedMobile = String(mobileNumber).trim();
    const cleanHandle = (
      username || normalizedEmail.split('@')[0]
    )
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, normalizedEmail),
          eq(users.mobileNumber, normalizedMobile)
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].isVerified) {
      return res.status(409).json({
        error: 'An account with this email or mobile number already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otpCode = generateOtpCode();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    let userRecord;
    if (existing.length > 0) {
      const [updated] = await db
        .update(users)
        .set({
          email: normalizedEmail,
          mobileNumber: normalizedMobile,
          passwordHash,
          otpCode,
          otpExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      userRecord = updated;
    } else {
      const [{ value: adminCount }] = await db
        .select({ value: count() })
        .from(adminAccounts);
      const isInitialAdmin =
        adminCount === 0 || normalizedEmail === 'dksingh1978.jeh@gmail.com';

      const [inserted] = await db
        .insert(users)
        .values({
          uid: `sc_${crypto.randomUUID()}`,
          email: normalizedEmail,
          mobileNumber: normalizedMobile,
          passwordHash,
          otpCode,
          otpExpiresAt,
          isVerified: false,
          role: isInitialAdmin ? 'admin' : 'user',
        })
        .returning();
      userRecord = inserted;

      if (isInitialAdmin) {
        await db
          .insert(adminAccounts)
          .values({
            userId: userRecord.id,
            permissionsLevel: 'super_admin',
            notes: 'Primary SmartConnect Administrator',
          })
          .onConflictDoNothing();
      }
    }

    // Create or update profile
    const existingProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userRecord.id))
      .limit(1);

    if (existingProfile.length === 0) {
      const handleExists = await db
        .select()
        .from(profiles)
        .where(eq(profiles.username, cleanHandle))
        .limit(1);
      const finalUsername =
        handleExists.length > 0 ? `${cleanHandle}_${userRecord.id}` : cleanHandle;

      await db.insert(profiles).values({
        userId: userRecord.id,
        fullName: String(fullName).trim(),
        username: finalUsername,
        bio: 'Hey there! I am using SmartConnect.',
        onlineStatus: 'offline',
      });
    } else {
      await db
        .update(profiles)
        .set({ fullName: String(fullName).trim(), updatedAt: new Date() })
        .where(eq(profiles.userId, userRecord.id));
    }

    return res.status(201).json({
      requiresOtp: true,
      email: normalizedEmail,
      mobileNumber: normalizedMobile,
      verificationOtp: otpCode, // Returned for sandbox OTP verification UI
      message: 'OTP generated and stored. Enter the 6-digit code to verify your account.',
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

authRouter.post('/verify-otp', async (req: AuthRequest, res) => {
  try {
    const { identifier, otpCode } = req.body || {};
    if (!identifier || !otpCode) {
      return res.status(400).json({ error: 'Identifier and OTP code are required.' });
    }

    const cleanId = String(identifier).trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.email, cleanId.toLowerCase()), eq(users.mobileNumber, cleanId))
      )
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    if (!user.otpCode || user.otpCode !== String(otpCode).trim()) {
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }
    if (!user.otpExpiresAt || user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    await db
      .update(users)
      .set({
        isVerified: true,
        otpCode: null,
        otpExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db
      .update(profiles)
      .set({ onlineStatus: 'online', lastSeenAt: new Date() })
      .where(eq(profiles.userId, user.id));

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const { token } = await createSessionForUser(user.id, req);

    return res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        e2ePublicKey: user.e2ePublicKey,
        e2eEncryptedPrivateKey: user.e2eEncryptedPrivateKey,
      },
      profile,
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    return res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

authRouter.post('/resend-otp', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: 'Email or mobile number is required.' });
    }
    const cleanId = String(identifier).trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.email, cleanId.toLowerCase()), eq(users.mobileNumber, cleanId))
      )
      .limit(1);
    if (!user) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    const otpCode = generateOtpCode();
    await db
      .update(users)
      .set({
        otpCode,
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .where(eq(users.id, user.id));

    return res.json({
      verificationOtp: otpCode,
      message: 'New OTP code generated.',
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP.' });
  }
});

authRouter.post('/login', async (req: AuthRequest, res) => {
  try {
    const { identifier, password, twoFactorPin } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({
        error: 'Mobile number (or email) and password are required.',
      });
    }

    const cleanId = String(identifier).trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.mobileNumber, cleanId), eq(users.email, cleanId.toLowerCase()))
      )
      .limit(1);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({
        error: `Your account is currently ${user.status}. Please contact support.`,
      });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!user.isVerified) {
      const otpCode = generateOtpCode();
      await db
        .update(users)
        .set({
          otpCode,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .where(eq(users.id, user.id));
      return res.status(403).json({
        requiresOtp: true,
        identifier: user.email,
        verificationOtp: otpCode,
        error: 'Account not verified yet. Enter the OTP code to continue.',
      });
    }

    if (user.twoFactorEnabled && user.twoFactorPinHash) {
      if (!twoFactorPin) {
        return res.status(200).json({
          requires2FA: true,
          message: 'Enter your 6-digit Two-Step Verification PIN.',
        });
      }
      const pinOk = await bcrypt.compare(String(twoFactorPin), user.twoFactorPinHash);
      if (!pinOk) {
        return res.status(401).json({ error: 'Incorrect Two-Step Verification PIN.' });
      }
    }

    await db
      .update(profiles)
      .set({ onlineStatus: 'online', lastSeenAt: new Date() })
      .where(eq(profiles.userId, user.id));

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const { token } = await createSessionForUser(user.id, req);

    return res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        e2ePublicKey: user.e2ePublicKey,
        e2eEncryptedPrivateKey: user.e2eEncryptedPrivateKey,
      },
      profile,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

authRouter.post('/firebase', async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : req.body?.idToken;

    if (!token) {
      return res.status(400).json({ error: 'Firebase ID token required.' });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getOrCreateFirebaseUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@smartconnect.app`,
      decoded.name || 'SmartConnect User',
      decoded.picture || null
    );

    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}.` });
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    const { token: sessionToken } = await createSessionForUser(user.id, req);

    return res.json({
      token: sessionToken,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        e2ePublicKey: user.e2ePublicKey,
        e2eEncryptedPrivateKey: user.e2eEncryptedPrivateKey,
      },
      profile,
    });
  } catch (err) {
    console.error('Firebase auth error:', err);
    return res.status(401).json({ error: 'Google authentication failed.' });
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ error: 'Mobile number or email is required.' });
    }
    const cleanId = String(identifier).trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.mobileNumber, cleanId), eq(users.email, cleanId.toLowerCase()))
      )
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'No account found with that identifier.' });
    }

    const otpCode = generateOtpCode();
    await db
      .update(users)
      .set({
        otpCode,
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .where(eq(users.id, user.id));

    return res.json({
      verificationOtp: otpCode,
      message: 'Account recovery OTP generated.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Recovery request failed.' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { identifier, otpCode, newPassword } = req.body || {};
    if (!identifier || !otpCode || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'Identifier, OTP code, and a new password (6+ chars) are required.',
      });
    }
    const cleanId = String(identifier).trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(eq(users.mobileNumber, cleanId), eq(users.email, cleanId.toLowerCase()))
      )
      .limit(1);

    if (!user || !user.otpCode || user.otpCode !== String(otpCode).trim()) {
      return res.status(400).json({ error: 'Invalid recovery OTP.' });
    }
    if (!user.otpExpiresAt || user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Recovery OTP has expired.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await db
      .update(users)
      .set({
        passwordHash,
        otpCode: null,
        otpExpiresAt: null,
        isVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    const unreadNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId));

    return res.json({
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        e2ePublicKey: user.e2ePublicKey,
        e2eEncryptedPrivateKey: user.e2eEncryptedPrivateKey,
        currentSessionTokenId: req.authUser!.sessionTokenId,
      },
      profile,
      unreadNotificationsCount: unreadNotifs.filter((n) => !n.isRead).length,
    });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Failed to load profile.' });
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    if (req.authUser!.sessionTokenId) {
      await db
        .update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.tokenId, req.authUser!.sessionTokenId));
      disconnectSession(userId, req.authUser!.sessionTokenId);
    }
    await db
      .update(profiles)
      .set({ onlineStatus: 'offline', lastSeenAt: new Date() })
      .where(eq(profiles.userId, userId));

    return res.json({ message: 'Logged out securely.' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

authRouter.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, req.authUser!.id))
      .orderBy(desc(userSessions.lastActiveAt));

    return res.json({
      sessions: list.map((s) => ({
        ...s,
        isCurrent: s.tokenId === req.authUser!.sessionTokenId,
      })),
    });
  } catch (err) {
    console.error('Get sessions error:', err);
    return res.status(500).json({ error: 'Failed to load sessions.' });
  }
});

authRouter.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sessionId = Number(req.params.id);
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, sessionId))
      .limit(1);

    if (!session || session.userId !== req.authUser!.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    await db
      .update(userSessions)
      .set({ isActive: false })
      .where(eq(userSessions.id, sessionId));

    disconnectSession(req.authUser!.id, session.tokenId);

    return res.json({ message: 'Device session revoked.' });
  } catch (err) {
    console.error('Revoke session error:', err);
    return res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

authRouter.post('/2fa', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { enabled, pin } = req.body || {};
    if (enabled) {
      if (!pin || String(pin).length < 4) {
        return res.status(400).json({ error: 'A 4–6 digit PIN is required to enable 2FA.' });
      }
      const hash = await bcrypt.hash(String(pin), 10);
      await db
        .update(users)
        .set({ twoFactorEnabled: true, twoFactorPinHash: hash })
        .where(eq(users.id, req.authUser!.id));
      return res.json({ twoFactorEnabled: true });
    } else {
      await db
        .update(users)
        .set({ twoFactorEnabled: false, twoFactorPinHash: null })
        .where(eq(users.id, req.authUser!.id));
      return res.json({ twoFactorEnabled: false });
    }
  } catch (err) {
    console.error('2FA error:', err);
    return res.status(500).json({ error: 'Failed to update 2FA settings.' });
  }
});

authRouter.post('/e2e-keys', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { publicKey, encryptedPrivateKey } = req.body || {};
    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required.' });
    }
    await db
      .update(users)
      .set({
        e2ePublicKey: String(publicKey),
        e2eEncryptedPrivateKey: encryptedPrivateKey ? String(encryptedPrivateKey) : undefined,
      })
      .where(eq(users.id, req.authUser!.id));
    return res.json({ saved: true });
  } catch (err) {
    console.error('E2E keys error:', err);
    return res.status(500).json({ error: 'Failed to save encryption keys.' });
  }
});
