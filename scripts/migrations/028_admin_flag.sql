-- Migration 028: Admin as a user flag instead of a hardcoded email
-- Admin used to be whoever logged in as a fixed address. It is now a flag on
-- the user row, independent of role (portfolio / analyst / manager). Admins get
-- manager access, the Admin panel, and are exempt from device locking.
--
-- On a fresh deployment with no admin yet, the first account to register is
-- made admin automatically (see pages/api/auth/register.ts).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing deployment: carry over the current admin.
UPDATE users SET is_admin = TRUE WHERE email = 'aditya@saguncapital.com';
