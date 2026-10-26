-- Migration: 20261026000000_audit_logs_realtime_and_rls.sql
-- Enables public read/write RLS policies and Realtime replication on audit_logs table
-- Ensures all past and future audit trail events are reliably synced across all devices

-- 1. Ensure audit_logs table exists with expected schema
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID,
    event_id UUID,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_id ON audit_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 3. Row Level Security: Permit select and insert for seamless admin and client-side sync
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Admin can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Public can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Public can insert audit logs" ON audit_logs;

CREATE POLICY "Allow all on audit_logs" ON audit_logs 
    FOR ALL TO public 
    USING (true) 
    WITH CHECK (true);

-- 4. Enable Supabase Realtime replication on audit_logs
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Table already in publication
        NULL;
END $$;
