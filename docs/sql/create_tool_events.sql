-- PDFaro tool_events table
-- Run once against your PostgreSQL database.
-- Compatible with Supabase, Railway, Neon, and self-hosted Postgres.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tool_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT        NOT NULL,
  user_id          TEXT,                          -- null until auth is added
  tool_name        TEXT        NOT NULL,
  event_type       TEXT        NOT NULL CHECK (event_type IN (
                                 'tool_started',
                                 'tool_completed',
                                 'download_clicked',
                                 'processing_failed'
                               )),
  file_type        TEXT,
  file_size        BIGINT,
  file_count       INTEGER,
  processing_time_ms INTEGER,
  success          BOOLEAN,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tool_events_tool_name   ON tool_events (tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_events_event_type  ON tool_events (event_type);
CREATE INDEX IF NOT EXISTS idx_tool_events_created_at  ON tool_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_events_session_id  ON tool_events (session_id);
