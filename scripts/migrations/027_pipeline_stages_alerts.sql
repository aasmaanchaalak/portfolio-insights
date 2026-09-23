-- Migration 027: Pipeline redesign — four stages, structured alerts, activity log
--
-- pipeline_ideas
--   stage            new | research | waiting | closed  (replaces the 7-value status;
--                    Exited-Watch ideas go to closed with tag 'Exited';
--                    status is kept, unread, for rollback)
--   outcome          bought | passed — set only when closed
--   tag              e.g. 'Exited'
--   exchange         NSE | BSE, when known
--   alert_type       price | event | NULL  (replaces free-text trigger_condition)
--   alert_price      price alert: hit when current_price <= alert_price
--   alert_event      event alert text
--   alert_due        event alert due date
--   closed_price     price when the idea was closed ("price since pass")
--   last_activity_at any edit, note, stage change or decision. Separate from
--                    updated_at, which price refreshes bump.
-- pipeline_notes (the activity log)
--   kind             note | stage | decision
--   attachment_ids   attachment ids posted with the entry
--
-- (Also applied lazily at runtime by ensurePipelineSchema in lib/pipeline/queries.ts.)

ALTER TABLE pipeline_ideas
  ADD COLUMN IF NOT EXISTS stage VARCHAR(10),
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tag VARCHAR(40),
  ADD COLUMN IF NOT EXISTS exchange VARCHAR(8),
  ADD COLUMN IF NOT EXISTS alert_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS alert_price DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS alert_event TEXT,
  ADD COLUMN IF NOT EXISTS alert_due DATE,
  ADD COLUMN IF NOT EXISTS closed_price DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- Left by an interim version of this change; never held data.
ALTER TABLE pipeline_ideas
  DROP COLUMN IF EXISTS alert_direction,
  DROP COLUMN IF EXISTS event_label,
  DROP COLUMN IF EXISTS event_date;

ALTER TABLE pipeline_notes
  ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Carry old decisions into the activity log before the stage backfill.
INSERT INTO pipeline_notes (idea_id, note_text, added_by, kind, created_at)
SELECT id,
       CONCAT_WS(': ', NULLIF(decision, ''), NULLIF(decision_reason, '')),
       COALESCE(assigned_to, added_by),
       'decision',
       COALESCE(updated_at, NOW())
FROM pipeline_ideas
WHERE stage IS NULL
  AND (COALESCE(decision, '') <> '' OR COALESCE(decision_reason, '') <> '');

-- Old free-text triggers: a price where one can be parsed, else an undated event.
UPDATE pipeline_ideas
SET alert_type = 'price',
    alert_price = REPLACE(SUBSTRING(trigger_condition FROM '(?:₹|\m[Rr][Ss]\.?|\m[Bb]elow|\m[Uu]nder|\m[Aa]round|\m[Nn]ear|<|@)\s*₹?\s*([0-9][0-9,]*(?:\.[0-9]+)?)'), ',', '')::numeric
WHERE stage IS NULL AND status <> 'killed'
  AND SUBSTRING(trigger_condition FROM '(?:₹|\m[Rr][Ss]\.?|\m[Bb]elow|\m[Uu]nder|\m[Aa]round|\m[Nn]ear|<|@)\s*₹?\s*([0-9][0-9,]*(?:\.[0-9]+)?)') IS NOT NULL;

UPDATE pipeline_ideas
SET alert_type = 'event', alert_event = trigger_condition
WHERE stage IS NULL AND status <> 'killed' AND alert_type IS NULL
  AND COALESCE(TRIM(trigger_condition), '') <> '';

UPDATE pipeline_ideas pi
SET stage = CASE pi.status
              WHEN 'captured' THEN 'new'
              WHEN 'triaged' THEN 'research'
              WHEN 'studying' THEN 'research'
              WHEN 'killed' THEN 'closed'
              WHEN 'exited_watch' THEN 'closed'
              ELSE 'waiting'
            END,
    outcome = CASE WHEN pi.status = 'killed' THEN 'passed' END,
    tag = CASE WHEN pi.status = 'exited_watch' THEN 'Exited' ELSE pi.tag END,
    assigned_to = COALESCE(pi.assigned_to, pi.added_by),
    last_activity_at = COALESCE(pi.last_activity_at, GREATEST(
      pi.status_changed_date::timestamptz,
      pi.date_added::timestamptz,
      COALESCE((SELECT MAX(created_at) FROM pipeline_notes pn WHERE pn.idea_id = pi.id), pi.date_added::timestamptz)
    ))
WHERE pi.stage IS NULL;
