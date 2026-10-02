import type { AuthUser } from '../authMiddleware';

/** F&O is all amounts, so analysts don't see it. */
export const canViewFo = (u: AuthUser) => u.role !== 'analyst';

/** Uploads and edits follow the other data uploads: managers and admins. */
export const canEditFo = (u: AuthUser) => u.role === 'manager' || u.isAdmin;
