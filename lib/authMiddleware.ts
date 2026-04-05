import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { verifyToken } from './auth';
import { getSession } from './queries';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    email: string;
    sessionId: string;
  };
}

export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const token = req.cookies.accessToken;

      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = await verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const session = await getSession(payload.sessionId);

      if (!session) {
        return res.status(401).json({ error: 'Session expired' });
      }

      (req as AuthenticatedRequest).user = {
        email: payload.userId,
        sessionId: payload.sessionId,
      };

      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}
