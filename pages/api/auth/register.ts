import { NextApiRequest, NextApiResponse } from 'next';
import { hashPassword } from '../../../lib/auth';
import { getUserByEmail, createUser, isEmailAllowed, hasAnyAdmin } from '../../../lib/queries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // TEMP debug: registration on a new deployment fails with no server logs.
  const t0 = Date.now();
  const step = (msg: string) => console.log(`[register] ${msg} (+${Date.now() - t0}ms)`);
  step(`start, DATABASE_URL ${process.env.DATABASE_URL ? 'set' : 'MISSING'}, JWT_SECRET ${process.env.JWT_SECRET ? 'set' : 'MISSING'}`);

  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    step(`checking allowlist for ${normalizedEmail}`);
    const allowed = await isEmailAllowed(normalizedEmail);
    step(`allowlist: ${allowed}`);
    if (!allowed) {
      return res.status(403).json({ error: 'This email is not authorized to register' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await getUserByEmail(normalizedEmail);
    step(`existing user: ${!!existingUser}`);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    step('password hashed');
    // Fresh deployment: the first account becomes the admin (with manager access).
    const firstAdmin = !(await hasAnyAdmin());
    await createUser(normalizedEmail, passwordHash, name.trim(), firstAdmin ? 'manager' : 'analyst', firstAdmin);
    step(`user created, admin: ${firstAdmin}`);

    return res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (error) {
    console.error(`Registration error (+${Date.now() - t0}ms):`, error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
