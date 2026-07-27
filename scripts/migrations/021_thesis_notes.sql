-- Migration: Make thesis notes first-class (stacked, editable) instead of a single latest_note
-- Run this migration against your PostgreSQL database

-- Dedicated table so notes stack up and can be edited/deleted individually
CREATE TABLE IF NOT EXISTS thesis_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    user_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thesis_notes_thesis_id ON thesis_notes(thesis_id);

-- Backfill: every note ever added lives in thesis_history as a 'note_added' entry
-- (new_value = the note text). Move them all into thesis_notes so nothing is lost.
-- The table-wide guard keeps this idempotent if the migration is re-run.
INSERT INTO thesis_notes (id, thesis_id, content, user_email, created_at, updated_at)
SELECT gen_random_uuid(), thesis_id, new_value, user_email, created_at, created_at
FROM thesis_history
WHERE action_type = 'note_added'
  AND new_value IS NOT NULL
  AND btrim(new_value) <> ''
  AND NOT EXISTS (SELECT 1 FROM thesis_notes);

-- Also capture any latest_note that was never routed through history (e.g. set at
-- thesis creation time) and isn't already present as a note for that thesis.
INSERT INTO thesis_notes (id, thesis_id, content, user_email, created_at, updated_at)
SELECT gen_random_uuid(), t.id, t.latest_note, NULL, t.updated_at, t.updated_at
FROM theses t
WHERE t.latest_note IS NOT NULL
  AND btrim(t.latest_note) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM thesis_notes n
    WHERE n.thesis_id = t.id AND n.content = t.latest_note
  );
