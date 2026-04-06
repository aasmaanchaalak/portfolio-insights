-- Migration: 004_add_user_roles.sql
-- Add role-based access control to users

-- Add role column to users table
-- Roles: 'portfolio' (full access), 'analyst' (restricted - no financial amounts)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'analyst';

-- Set admin user to portfolio role
UPDATE users SET role = 'portfolio' WHERE email = 'aditya@saguncapital.com';

-- Create index on role for efficient filtering
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
