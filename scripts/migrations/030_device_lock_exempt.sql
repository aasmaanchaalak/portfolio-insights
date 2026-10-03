-- Migration 030: Per-user device-lock exemption
-- Admins can exempt chosen accounts from device locking (Admin → Users). An
-- exempt account, like an admin, can log in from any device and keep several
-- sessions open. Also applied at runtime by lib/queries.ts (ensureUserSchema).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_lock_exempt BOOLEAN NOT NULL DEFAULT FALSE;
