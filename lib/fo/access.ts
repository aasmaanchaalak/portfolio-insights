import type { AuthUser } from '../authMiddleware';

/** Every signed-in user, analysts included, can view F&O. */
export const canViewFo = (_u: AuthUser) => true;

/** Uploads and edits follow the other data uploads: managers and admins. */
export const canEditFo = (u: AuthUser) => u.role === 'manager' || u.isAdmin;
