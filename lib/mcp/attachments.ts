// Attachments added through the Claude connector. Same `attachments` table and
// R2 layout as the in-app uploader (pages/api/attachments/upload.ts), so files
// show up in the stock drawer / PE company tabs like any other upload.

import path from 'path';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { query } from '../db';
import { uploadToR2, getPresignedUrl, attachmentKeyPrefix } from '../storage';
import { ToolError } from './errors';

export type AttachmentModule = 'thesis' | 'pe' | 'pipeline';

const MAX_SIZE = 20 * 1024 * 1024;

const TYPES_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
};
const ALLOWED_TYPES = new Set(Object.values(TYPES_BY_EXT));

export interface AttachmentInfo {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

export async function listAttachments(module: AttachmentModule, entityId: string): Promise<AttachmentInfo[]> {
  const rows = await query<{
    id: string; file_name: string; storage_key: string; file_type: string; file_size: number; uploaded_by: string; uploaded_at: string;
  }>(
    `SELECT id, file_name, storage_key, file_type, file_size, uploaded_by, uploaded_at
     FROM attachments WHERE module = $1 AND entity_id = $2 ORDER BY uploaded_at DESC`,
    [module, entityId],
  );
  return Promise.all(rows.map(async r => ({
    id: r.id,
    fileName: r.file_name,
    fileType: r.file_type,
    fileSize: r.file_size,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    url: await getPresignedUrl(r.storage_key),
  })));
}

// ---- Fetching a file from a URL (guarded against reaching internal hosts) ----

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ToolError('source_url is not a valid URL'); }
  if (url.protocol !== 'https:') throw new ToolError('source_url must be https');
  const addrs = await lookup(url.hostname, { all: true }).catch((): { address: string }[] => []);
  if (addrs.length === 0) throw new ToolError(`Could not resolve ${url.hostname}`);
  if (addrs.some(a => isPrivateAddress(a.address))) throw new ToolError('source_url points to a private address');
  return url;
}

async function fetchFile(raw: string): Promise<{ buffer: Buffer; contentType: string | null; name: string }> {
  let url = await assertPublicUrl(raw);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(err => {
      throw new ToolError(`Could not download ${url.hostname}: ${err?.name === 'TimeoutError' ? 'timed out' : 'request failed'}`);
    });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) break;
    url = await assertPublicUrl(new URL(location, url).toString());
    res = null;
  }
  if (!res) throw new ToolError('Too many redirects');
  if (!res.ok || !res.body) throw new ToolError(`Download failed (HTTP ${res.status})`);
  if (Number(res.headers.get('content-length') || 0) > MAX_SIZE) throw new ToolError('File is larger than 20 MB');

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_SIZE) { await reader.cancel(); throw new ToolError('File is larger than 20 MB'); }
    chunks.push(value);
  }
  const contentType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || null;
  return { buffer: Buffer.concat(chunks), contentType, name: decodeURIComponent(path.basename(url.pathname)) };
}

// ---- Saving ----

export interface AttachmentSource {
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
  textContent?: string;
  sourceUrl?: string;
}

export async function addAttachment(
  module: AttachmentModule,
  entityId: string,
  src: AttachmentSource,
  userEmail: string,
): Promise<AttachmentInfo> {
  const given = [src.contentBase64, src.textContent, src.sourceUrl].filter(v => typeof v === 'string' && v.length > 0);
  if (given.length !== 1) throw new ToolError('Provide exactly one of content_base64, text_content or source_url');

  let buffer: Buffer;
  let fileName = src.fileName?.trim() || '';
  let detectedType: string | null = null;

  if (src.sourceUrl) {
    const fetched = await fetchFile(src.sourceUrl);
    buffer = fetched.buffer;
    detectedType = fetched.contentType;
    fileName ||= fetched.name;
  } else if (src.textContent) {
    buffer = Buffer.from(src.textContent, 'utf8');
    detectedType = 'text/markdown';
  } else {
    buffer = Buffer.from(src.contentBase64!.replace(/^data:[^,]*,/, ''), 'base64');
  }

  if (!fileName) throw new ToolError('file_name is required');
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (!ext && src.textContent) fileName += '.md';
  const byExt = TYPES_BY_EXT[path.extname(fileName).slice(1).toLowerCase()];
  // Explicit type first, then the file extension, then what the server said
  // (servers often send application/octet-stream).
  const fileType = [src.mimeType, byExt, detectedType].find(t => t && ALLOWED_TYPES.has(t));
  if (!fileType) {
    throw new ToolError('File type not allowed. Allowed: PDF, images, Word, Excel, PowerPoint, txt, md, csv');
  }
  if (buffer.length === 0) throw new ToolError('File is empty');
  if (buffer.length > MAX_SIZE) throw new ToolError('File is larger than 20 MB');

  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${attachmentKeyPrefix(module, entityId)}${Date.now()}-${safeName}`;
  await uploadToR2(storageKey, buffer, fileType);

  const [row] = await query<{ id: string; uploaded_at: string }>(
    `INSERT INTO attachments (module, entity_id, file_name, storage_key, file_type, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, uploaded_at`,
    [module, entityId, safeName, storageKey, fileType, buffer.length, userEmail],
  );
  return {
    id: row.id,
    fileName: safeName,
    fileType,
    fileSize: buffer.length,
    uploadedBy: userEmail,
    uploadedAt: row.uploaded_at,
    url: await getPresignedUrl(storageKey),
  };
}
