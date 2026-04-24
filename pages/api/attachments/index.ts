import { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { query } from '../../../lib/db';
import { uploadToR2, getPresignedUrl } from '../../../lib/storage';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

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
    const form = formidable({ maxFileSize: MAX_SIZE, keepExtensions: true });

    let fields: formidable.Fields;
    let files: formidable.Files;
    try {
      [fields, files] = await form.parse(req);
    } catch {
      return res.status(400).json({ error: 'File too large or invalid (max 20 MB)' });
    }

    const module = Array.isArray(fields.module) ? fields.module[0] : fields.module;
    const entityId = Array.isArray(fields.entityId) ? fields.entityId[0] : fields.entityId;
    const fileArr = Array.isArray(files.file) ? files.file : [files.file];
    const file = fileArr[0];

    if (!module || !entityId || !file) return res.status(400).json({ error: 'module, entityId, and file required' });
    if (!['pe', 'pipeline', 'thesis'].includes(module)) return res.status(400).json({ error: 'Invalid module' });

    const mimeType = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    const ext = path.extname(file.originalFilename || file.newFilename || '');
    const safeName = (file.originalFilename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${module}/${entityId}/${Date.now()}-${safeName}`;

    const buffer = fs.readFileSync(file.filepath);
    await uploadToR2(storageKey, buffer, mimeType);
    fs.unlinkSync(file.filepath);

    const [row] = await query<{ id: string; uploaded_at: string }>(
      `INSERT INTO attachments (module, entity_id, file_name, storage_key, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, uploaded_at`,
      [module, entityId, file.originalFilename || safeName, storageKey, mimeType, file.size, req.user.email]
    );

    const url = await getPresignedUrl(storageKey);
    return res.status(201).json({
      id: row.id,
      fileName: file.originalFilename || safeName,
      fileType: mimeType,
      fileSize: file.size,
      uploadedBy: req.user.email,
      uploadedAt: row.uploaded_at,
      url,
    });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default withAuth(handler as any);
