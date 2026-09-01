import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import {
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  generateSessionId,
  getSessionExpiry,
  generateDeviceToken,
  hashDeviceToken,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
  DEVICE_COOKIE_NAME,
  DEVICE_COOKIE_OPTIONS,
} from '../../../lib/auth';
import {
  getUserByEmail,
  createSession,
  updateUserLastLogin,
  deleteUserSessions,
  bindUserDevice,
} from '../../../lib/queries';

// Admin is exempt from device locking and single-session enforcement.
const ADMIN_EMAIL = 'aditya@saguncapital.com';

// A short, human-readable label for the bound device, shown to the admin.
function deviceLabelFromRequest(req: NextApiRequest): string {
  const ua = (req.headers['user-agent'] || '').toString();
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /iPhone|iPad/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Unknown OS';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari'
    : 'Browser';
  return `${browser} on ${os}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isAdmin = normalizedEmail === ADMIN_EMAIL;

    // Cookies to write on a successful response.
    const cookies: string[] = [];

    // ---- Device lock (non-admin only) ----
    if (!isAdmin) {
      const incomingToken = req.cookies[DEVICE_COOKIE_NAME];

      if (user.deviceIdHash) {
        // Account already locked to a device — the cookie must match.
        const matches = !!incomingToken && hashDeviceToken(incomingToken) === user.deviceIdHash;
        if (!matches) {
          return res.status(403).json({
            error: 'This account is locked to another device. Please log in from your usual device, or ask the admin to reset your device access.',
          });
        }
        // Matches — refresh the cookie so it keeps its long lifetime.
        cookies.push(serialize(DEVICE_COOKIE_NAME, incomingToken, DEVICE_COOKIE_OPTIONS));
      } else {
        // First login on any device — bind this browser to the account.
        const token = incomingToken || generateDeviceToken();
        await bindUserDevice(normalizedEmail, hashDeviceToken(token), deviceLabelFromRequest(req));
        cookies.push(serialize(DEVICE_COOKIE_NAME, token, DEVICE_COOKIE_OPTIONS));
      }

      // Single active session: drop any prior sessions before creating the new one.
      await deleteUserSessions(normalizedEmail);
    }

    const sessionId = generateSessionId();
    const expiresAt = new Date(getSessionExpiry());

    await createSession(sessionId, normalizedEmail, expiresAt);
    await updateUserLastLogin(normalizedEmail);

    const accessToken = await createAccessToken(normalizedEmail, sessionId);
    const refreshToken = await createRefreshToken(normalizedEmail, sessionId);

    cookies.push(
      serialize('accessToken', accessToken, ACCESS_COOKIE_OPTIONS),
      serialize('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS),
    );

    res.setHeader('Set-Cookie', cookies);

    return res.status(200).json({
      success: true,
      user: { email: user.email, name: user.name, role: user.role || 'analyst' },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
