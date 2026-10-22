ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS tasks_active_idx ON tasks (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_active_idx ON transactions (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS activities_active_idx ON activities (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS conversations_active_idx ON conversations (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS files_active_idx ON files (id DESC) WHERE deleted_at IS NULL;
