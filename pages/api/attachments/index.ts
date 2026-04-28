import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { query } from '../../../lib/db';
import { getPresignedUrl } from '../../../lib/storage';

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
  if (req.method === 'GET') {
    const { module, entityId } = req.query;
    if (!module || !entityId) return res.status(400).json({ error: 'module and entityId required' });

    const rows = await query<{
      id: string; file_name: string; storage_key: string;
      file_type: string; file_size: number; uploaded_by: string; uploaded_at: string;
    }>(
      `SELECT id, file_name, storage_key, file_type, file_size, uploaded_by, uploaded_at
       FROM attachments WHERE module = $1 AND entity_id = $2 ORDER BY uploaded_at DESC`,
      [module, entityId]
    );

    const withUrls = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
      url: await getPresignedUrl(r.storage_key),
    })));

    return res.status(200).json(withUrls);
  }

  if (req.method === 'POST') {
    const { module, entityId, storageKey, fileName, fileType, fileSize } = req.body || {};

    if (!module || !entityId || !storageKey || !fileName || !fileType || typeof fileSize !== 'number') {
      return res.status(400).json({ error: 'module, entityId, storageKey, fileName, fileType, fileSize required' });
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
    const expectedPrefix = `${module}/${entityId}/`;
    if (!storageKey.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: 'storageKey does not match module/entityId' });
    }

    const [row] = await query<{ id: string; uploaded_at: string }>(
      `INSERT INTO attachments (module, entity_id, file_name, storage_key, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, uploaded_at`,
      [module, entityId, fileName, storageKey, fileType, fileSize, req.user.email]
    );

    const url = await getPresignedUrl(storageKey);
    return res.status(201).json({
      id: row.id,
      fileName,
      fileType,
      fileSize,
      uploadedBy: req.user.email,
      uploadedAt: row.uploaded_at,
      url,
    });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default withAuth(handler as any);
