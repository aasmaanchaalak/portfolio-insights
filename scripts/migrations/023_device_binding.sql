-- Migration: 023_device_binding.sql
-- Lock each non-admin account to a single "usual" device to prevent password sharing.
--
-- On first login a random device token is generated; its SHA-256 hash is stored
-- here and the token is set as a long-lived httpOnly cookie on that browser.
-- Subsequent logins must present a matching device cookie or they are rejected.
-- Admin resets these columns to re-bind a user (new laptop / cleared cookies).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_id_hash   TEXT,
  ADD COLUMN IF NOT EXISTS device_label     TEXT,
  ADD COLUMN IF NOT EXISTS device_bound_at  TIMESTAMP WITH TIME ZONE;
