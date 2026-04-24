import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { query } from '../../../lib/db';
import { deleteFromR2 } from '../../../lib/storage';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { attachmentId } = req.query;

  const rows = await query<{ id: string; storage_key: string }>(
    `SELECT id, storage_key FROM attachments WHERE id = $1`,
    [attachmentId]
  );

  if (rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

  await deleteFromR2(rows[0].storage_key);
  await query(`DELETE FROM attachments WHERE id = $1`, [attachmentId]);

  return res.status(200).json({ deleted: true });
}

export default withAuth(handler as any);
