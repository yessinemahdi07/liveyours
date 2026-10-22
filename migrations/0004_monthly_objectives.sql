ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS target_month DATE;

UPDATE tasks
SET target_month = date_trunc('month', COALESCE(created_at, CURRENT_TIMESTAMP::timestamp))::date
WHERE target_month IS NULL;

ALTER TABLE tasks
    ALTER COLUMN target_month SET DEFAULT date_trunc('month', CURRENT_DATE::timestamp)::date,
    ALTER COLUMN target_month SET NOT NULL;
