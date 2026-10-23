CREATE TABLE IF NOT EXISTS account_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('claude', 'codex')),
    config_dir TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    login_method TEXT NOT NULL DEFAULT 'browser'
        CHECK (login_method IN ('browser', 'console', 'sso', 'device-code')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_profiles_agent
    ON account_profiles(agent_type, is_default DESC, name);

INSERT OR IGNORE INTO account_profiles (
    id, name, agent_type, config_dir, is_default, is_system, created_at, updated_at
) VALUES (
    'claude-system', 'System Claude account', 'claude', NULL, 1, 1,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO account_profiles (
    id, name, agent_type, config_dir, is_default, is_system, created_at, updated_at
) VALUES (
    'codex-system', 'System ChatGPT account', 'codex', NULL, 1, 1,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- Databases created before the seeds were in English still carry the Chinese names. Only the exact
-- old seed text is replaced, so a name the user chose is never touched.
UPDATE account_profiles SET name = 'System Claude account'
    WHERE id = 'claude-system' AND name = '系统 Claude 账号';
UPDATE account_profiles SET name = 'System ChatGPT account'
    WHERE id = 'codex-system' AND name = '系统 ChatGPT 账号';
