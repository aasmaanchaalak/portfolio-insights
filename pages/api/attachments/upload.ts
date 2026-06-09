import { NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFile } from 'fs/promises';
import path from 'path';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { uploadToR2, getPresignedUrl } from '../../../lib/storage';
import { query } from '../../../lib/db';

export const config = {
  api: { bodyParser: false },
};

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/msword',
];
const MAX_SIZE = 20 * 1024 * 1024;

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = formidable({ maxFileSize: MAX_SIZE, keepExtensions: true });
  const [fields, files] = await form.parse(req);

  const module = Array.isArray(fields.module) ? fields.module[0] : fields.module;
  const entityId = Array.isArray(fields.entityId) ? fields.entityId[0] : fields.entityId;
  const file = Array.isArray(files.file) ? files.file[0] : files.file;

  if (!module || !entityId || !file) {
    return res.status(400).json({ error: 'module, entityId, and file required' });
  }
  if (!['pe', 'pipeline', 'thesis'].includes(module)) {
    return res.status(400).json({ error: 'Invalid module' });
  }

  const fileType = file.mimetype || 'application/octet-stream';
  const fileSize = file.size;
  const fileName = file.originalFilename || 'upload';

  if (!ALLOWED_TYPES.includes(fileType)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }
  if (fileSize <= 0 || fileSize > MAX_SIZE) {
    return res.status(400).json({ error: `File must be between 1 byte and ${MAX_SIZE / (1024 * 1024)} MB` });
  }

  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${module}/${entityId}/${Date.now()}-${safeName}`;

  const buffer = await readFile(file.filepath);
  await uploadToR2(storageKey, buffer, fileType);

  const [row] = await query<{ id: string; uploaded_at: string }>(
    `INSERT INTO attachments (module, entity_id, file_name, storage_key, file_type, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, uploaded_at`,
    [module, entityId, safeName, storageKey, fileType, fileSize, req.user.email]
  );

  const url = await getPresignedUrl(storageKey);
  return res.status(201).json({
    id: row.id,
    fileName: safeName,
    fileType,
    fileSize,
    uploadedBy: req.user.email,
    uploadedAt: row.uploaded_at,
    url,
  });
}

export default withAuth(handler as any);
