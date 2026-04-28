import { NextApiResponse } from 'next';
import path from 'path';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { getPresignedPutUrl } from '../../../lib/storage';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
];
const MAX_SIZE = 20 * 1024 * 1024;

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { module, entityId, fileName, fileType, fileSize } = req.body || {};

  if (!module || !entityId || !fileName || !fileType || typeof fileSize !== 'number') {
    return res.status(400).json({ error: 'module, entityId, fileName, fileType, fileSize required' });
  }
  if (!['pe', 'pipeline', 'thesis'].includes(module)) {
    return res.status(400).json({ error: 'Invalid module' });
  }
  if (!ALLOWED_TYPES.includes(fileType)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }
  if (fileSize <= 0 || fileSize > MAX_SIZE) {
    return res.status(400).json({ error: `File must be between 1 byte and ${MAX_SIZE / (1024 * 1024)} MB` });
  }

  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${module}/${entityId}/${Date.now()}-${safeName}`;

  const uploadUrl = await getPresignedPutUrl(storageKey, fileType);

  return res.status(200).json({ uploadUrl, storageKey });
}

export default withAuth(handler as any);
