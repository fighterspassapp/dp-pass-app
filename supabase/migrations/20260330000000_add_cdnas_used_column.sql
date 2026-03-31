-- Add cdnas_used column to users table
ALTER TABLE users ADD COLUMN cdnas_used INTEGER DEFAULT 10;
