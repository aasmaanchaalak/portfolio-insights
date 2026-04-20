-- Migration 009: Add manager role
-- Manager has same data access as portfolio but can also see upload/management pages.
-- No schema change needed — role is VARCHAR(50) with no constraint.
-- This migration just documents the new role and updates the admin to manager.

-- Set admin to manager role (manager can do everything portfolio can + manage uploads)
UPDATE users SET role = 'manager' WHERE email = 'aditya@saguncapital.com';

-- Note: existing portfolio/analyst users are unaffected.
-- Assign manager role to users who need upload access via the Admin Panel.
