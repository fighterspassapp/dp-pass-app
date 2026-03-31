-- Create sleepin_requests table for Sleep Ins notifications
-- Contains requests that are dismissed by flight commanders

CREATE TABLE IF NOT EXISTS sleepin_requests (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  type TEXT NOT NULL CHECK (type IN ('pass', 'cdna')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
