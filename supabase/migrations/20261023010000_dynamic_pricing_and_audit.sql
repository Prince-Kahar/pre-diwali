-- =========================================================================
-- College Pre-Diwali Celebration Database Schema Migration
-- Migration: 20261023010000_dynamic_pricing_and_audit.sql
-- Description: Dynamic Registration Pricing, Event Settings Enhancement,
--              and Append-Only Pricing Audit History Table with RLS & RPC
-- =========================================================================

-- 1. Enhance events table with updated_by and maximum_capacity compatibility
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS maximum_capacity INT;

-- Synchronize maximum_capacity with max_capacity
UPDATE events 
SET maximum_capacity = max_capacity 
WHERE maximum_capacity IS NULL;

-- 2. Create append-only pricing_history table
CREATE TABLE IF NOT EXISTS pricing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    previous_fee_minor_units BIGINT NOT NULL,
    new_fee_minor_units BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    change_reason TEXT,
    changed_by UUID NOT NULL REFERENCES profiles(id),
    changed_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast retrieval of pricing audit trail
CREATE INDEX IF NOT EXISTS idx_pricing_history_event_id ON pricing_history(event_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_created_at ON pricing_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_history_changed_by ON pricing_history(changed_by);

-- 3. Row Level Security for pricing_history
ALTER TABLE pricing_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all pricing history records
CREATE POLICY "Admins can view pricing history" ON pricing_history
    FOR SELECT TO authenticated
    USING (is_admin());

-- Only server / authorized admin can insert pricing history (append-only)
CREATE POLICY "Admins can insert pricing history" ON pricing_history
    FOR INSERT TO authenticated
    WITH CHECK (is_admin());

-- Restrict UPDATE and DELETE: Pricing history is strictly append-only
-- No UPDATE or DELETE policies are granted.

-- 4. Server-Side Atomic RPC: update_registration_pricing
-- Validates authorization, bounds, updates event settings, and appends to pricing history
CREATE OR REPLACE FUNCTION update_registration_pricing(
    p_event_id UUID,
    p_admin_user_id UUID,
    p_new_fee_minor_units BIGINT,
    p_registration_enabled BOOLEAN,
    p_registration_opens_at TIMESTAMPTZ,
    p_registration_closes_at TIMESTAMPTZ,
    p_maximum_capacity INT,
    p_change_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_admin_name TEXT;
    v_prev_fee BIGINT;
    v_currency VARCHAR(10);
    v_history_id UUID;
BEGIN
    -- 1. Verify caller is an active administrator
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_admin_user_id AND role = 'ADMIN' AND is_active = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: only active administrators can update registration pricing';
    END IF;

    SELECT display_name INTO v_admin_name FROM profiles WHERE id = p_admin_user_id;

    -- 2. Validate input constraints
    -- Registration fee must be strictly positive (greater than 0 paise) and within business limits (max ₹1,00,000 = 10,000,000 paise)
    IF p_new_fee_minor_units <= 0 THEN
        RAISE EXCEPTION 'Registration fee must be a strictly positive amount';
    END IF;

    IF p_new_fee_minor_units > 10000000 THEN
        RAISE EXCEPTION 'Registration fee exceeds maximum allowable threshold (₹1,00,000)';
    END IF;

    -- Capacity must be positive
    IF p_maximum_capacity <= 0 THEN
        RAISE EXCEPTION 'Maximum capacity must be greater than zero';
    END IF;

    -- Opening date must be before closing date
    IF p_registration_opens_at >= p_registration_closes_at THEN
        RAISE EXCEPTION 'Registration opening date must be prior to closing date';
    END IF;

    -- 3. Lock event record and retrieve previous pricing
    SELECT registration_fee_minor_units, currency
    INTO v_prev_fee, v_currency
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event record with id % not found', p_event_id;
    END IF;

    -- 4. Update event record
    UPDATE events
    SET registration_fee_minor_units = p_new_fee_minor_units,
        registration_enabled = p_registration_enabled,
        registration_opens_at = p_registration_opens_at,
        registration_closes_at = p_registration_closes_at,
        max_capacity = p_maximum_capacity,
        maximum_capacity = p_maximum_capacity,
        updated_by = p_admin_user_id,
        updated_at = NOW()
    WHERE id = p_event_id;

    -- 5. Append immutable record to pricing_history
    INSERT INTO pricing_history (
        event_id,
        previous_fee_minor_units,
        new_fee_minor_units,
        currency,
        change_reason,
        changed_by,
        changed_by_name,
        created_at
    ) VALUES (
        p_event_id,
        v_prev_fee,
        p_new_fee_minor_units,
        v_currency,
        COALESCE(p_change_reason, 'Administrative pricing adjustment'),
        p_admin_user_id,
        v_admin_name,
        NOW()
    ) RETURNING id INTO v_history_id;

    -- 6. Also log to universal audit_logs
    INSERT INTO audit_logs (
        actor_user_id,
        event_id,
        action,
        target_type,
        target_id,
        reason,
        metadata
    ) VALUES (
        p_admin_user_id,
        p_event_id,
        'UPDATE_REGISTRATION_PRICING',
        'event',
        p_event_id::TEXT,
        COALESCE(p_change_reason, 'Updated registration fee'),
        jsonb_build_object(
            'previous_fee_minor_units', v_prev_fee,
            'new_fee_minor_units', p_new_fee_minor_units,
            'pricing_history_id', v_history_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Registration pricing and schedule successfully updated',
        'event_id', p_event_id,
        'previous_fee_minor_units', v_prev_fee,
        'new_fee_minor_units', p_new_fee_minor_units,
        'history_id', v_history_id,
        'updated_at', NOW()
    );
END;
$$;
