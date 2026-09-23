import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { serialize } from 'cookie';
import {
  verifyToken,
  createAccessToken,
  createRefreshToken,
  getSessionExpiry,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
} from './auth';
import { getSession, extendSession } from './queries';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    email: string;
    sessionId: string;
  };
}

// Issue a fresh access token and slide the session + refresh token forward.
export async function renewSession(res: NextApiResponse, userId: string, sessionId: string): Promise<void> {
  const expiresAt = new Date(getSessionExpiry());
  await extendSession(sessionId, expiresAt);
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(userId, sessionId),
    createRefreshToken(userId, sessionId),
  ]);
  res.setHeader('Set-Cookie', [
    serialize('accessToken', accessToken, ACCESS_COOKIE_OPTIONS),
    serialize('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS),
  ]);
}

// Resolve the caller's session. Uses the short-lived access token when it's
// valid; otherwise falls back to the refresh token and renews on the spot, so
// reopening the app after the access token lapsed (e.g. an iOS home-screen app
// that was suspended) doesn't bounce the user to the login screen.
export async function authenticate(req: NextApiRequest, res: NextApiResponse): Promise<{ email: string; sessionId: string } | null> {
  const access = req.cookies.accessToken ? await verifyToken(req.cookies.accessToken) : null;
  if (access) {
    const session = await getSession(access.sessionId);
    if (session) return { email: access.userId, sessionId: access.sessionId };
  }

  const refresh = req.cookies.refreshToken ? await verifyToken(req.cookies.refreshToken) : null;
  if (!refresh || (refresh as any).type !== 'refresh') return null;
  const session = await getSession(refresh.sessionId);
  if (!session) return null;

  await renewSession(res, refresh.userId, refresh.sessionId);
  return { email: refresh.userId, sessionId: refresh.sessionId };
}

export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const auth = await authenticate(req, res);

      if (!auth) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      (req as AuthenticatedRequest).user = auth;

      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}
