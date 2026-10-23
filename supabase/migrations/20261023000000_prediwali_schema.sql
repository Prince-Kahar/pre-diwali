-- =========================================================================
-- College Pre-Diwali Celebration Database Schema
-- Production-Ready PostgreSQL Schema with RLS, Constraints & Atomic RPC
-- =========================================================================

-- Enable pgcrypto for UUIDs and cryptographic hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- 1. EVENTS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    college_name TEXT NOT NULL,
    college_logo_url TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    venue TEXT NOT NULL,
    venue_directions TEXT,
    registration_opens_at TIMESTAMPTZ NOT NULL,
    registration_closes_at TIMESTAMPTZ NOT NULL,
    registration_fee_minor_units BIGINT NOT NULL DEFAULT 25000, -- e.g. 25000 = ₹250.00
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    max_capacity INT NOT NULL DEFAULT 1000,
    registration_enabled BOOLEAN NOT NULL DEFAULT true,
    entry_enabled BOOLEAN NOT NULL DEFAULT true,
    payment_mode VARCHAR(20) NOT NULL DEFAULT 'STATIC_UPI', -- 'GATEWAY' or 'STATIC_UPI'
    payment_upi_id TEXT DEFAULT 'college.prediwali@okaxis',
    payment_upi_name TEXT DEFAULT 'College Pre-Diwali Committee',
    payment_qr_storage_path TEXT,
    student_instructions TEXT,
    contact_email TEXT DEFAULT 'prediwali.support@college.edu',
    contact_phone VARCHAR(20) DEFAULT '+91 98765 43210',
    allowed_academic_years TEXT[] NOT NULL DEFAULT ARRAY['FY', 'SY'],
    food_options TEXT[] NOT NULL DEFAULT ARRAY['Regular', 'Jain'],
    terms_and_conditions TEXT,
    pass_branding_title TEXT DEFAULT 'VIP FESTIVE ENTRY PASS',
    settings_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. PROFILES (ADMIN & STAFF ROLES)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 3. REGISTRATIONS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    full_name TEXT NOT NULL,
    academic_year VARCHAR(10) NOT NULL CHECK (academic_year IN ('FY', 'SY')),
    food_preference VARCHAR(20) NOT NULL CHECK (food_preference IN ('Regular', 'Jain')),
    contact_number VARCHAR(15) NOT NULL,
    normalized_roll_number TEXT NOT NULL,
    consent_agreed BOOLEAN NOT NULL DEFAULT true,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' 
        CHECK (payment_status IN ('NOT_STARTED', 'PENDING', 'PAID', 'FAILED', 'REJECTED', 'REFUNDED')),
    expected_amount_minor_units BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT uq_event_normalized_roll UNIQUE (event_id, normalized_roll_number)
);

CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_roll ON registrations(normalized_roll_number);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status);

-- -------------------------------------------------------------------------
-- 4. PAYMENTS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('RAZORPAY', 'STATIC_UPI')),
    provider_order_id TEXT,
    provider_payment_id TEXT,
    transaction_reference TEXT,
    expected_amount_minor_units BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REJECTED', 'REFUNDED')),
    verification_method VARCHAR(30) NOT NULL DEFAULT 'MANUAL_ADMIN'
        CHECK (verification_method IN ('GATEWAY_SIGNATURE', 'MANUAL_ADMIN')),
    verified_by UUID REFERENCES profiles(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_order UNIQUE (provider_order_id),
    CONSTRAINT uq_payment_provider_id UNIQUE (provider_payment_id),
    CONSTRAINT uq_payment_tx_ref UNIQUE (transaction_reference)
);

CREATE INDEX IF NOT EXISTS idx_payments_reg_id ON payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- -------------------------------------------------------------------------
-- 5. ENTRY PASSES TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entry_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of high-entropy opaque pass token
    status VARCHAR(20) NOT NULL DEFAULT 'VALID'
        CHECK (status IN ('VALID', 'USED', 'REVOKED', 'CANCELLED')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ,
    redeemed_by UUID REFERENCES profiles(id),
    revoked_at TIMESTAMPTZ,
    replacement_of_pass_id UUID REFERENCES entry_passes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passes_token_hash ON entry_passes(token_hash);
CREATE INDEX IF NOT EXISTS idx_passes_status ON entry_passes(status);

-- -------------------------------------------------------------------------
-- 6. ENTRY SCANS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entry_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    pass_id UUID REFERENCES entry_passes(id) ON DELETE SET NULL,
    staff_user_id UUID NOT NULL REFERENCES profiles(id),
    scan_result VARCHAR(30) NOT NULL 
        CHECK (scan_result IN ('ENTRY_APPROVED', 'ALREADY_USED', 'PAYMENT_NOT_VERIFIED', 'INVALID_PASS', 'PASS_CANCELLED')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id TEXT,
    reason_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_event_id ON entry_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_scans_staff_user ON entry_scans(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_scans_pass_id ON entry_scans(pass_id);

-- -------------------------------------------------------------------------
-- 7. PAYMENT WEBHOOK EVENTS (FOR IDEMPOTENCY)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL,
    provider_event_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED',
    payload_snapshot JSONB,
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider, provider_event_id)
);

-- -------------------------------------------------------------------------
-- 8. AUDIT LOGS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES profiles(id),
    event_id UUID REFERENCES events(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_id ON audit_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);

-- -------------------------------------------------------------------------
-- 9. ATOMIC RPC FUNCTION: REDEEM ENTRY PASS
-- -------------------------------------------------------------------------
-- This function runs inside a database transaction and applies row-level locking (FOR UPDATE)
-- to ensure that concurrent scans across multiple gate staff can NEVER cause double-entry.
CREATE OR REPLACE FUNCTION redeem_entry_pass(
    p_token_hash TEXT,
    p_staff_user_id UUID,
    p_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pass_id UUID;
    v_reg_id UUID;
    v_event_id UUID;
    v_pass_status VARCHAR(20);
    v_payment_status VARCHAR(20);
    v_prev_redeemed_at TIMESTAMPTZ;
    v_prev_staff_name TEXT;
    v_student_name TEXT;
    v_roll_number TEXT;
    v_academic_year TEXT;
    v_food_pref TEXT;
    v_staff_active BOOLEAN;
    v_event_entry_enabled BOOLEAN;
BEGIN
    -- 1. Validate Staff Permission
    SELECT is_active INTO v_staff_active FROM profiles WHERE id = p_staff_user_id;
    IF v_staff_active IS NULL OR v_staff_active = false THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'FORBIDDEN',
            'message', 'Staff account is inactive or not found'
        );
    END IF;

    -- 2. Lookup and Lock Pass row using FOR UPDATE to prevent race conditions
    SELECT id, registration_id, status, redeemed_at, redeemed_by
    INTO v_pass_id, v_reg_id, v_pass_status, v_prev_redeemed_at, v_prev_staff_name
    FROM entry_passes
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    -- If pass does not exist: record scan attempt and reject
    IF v_pass_id IS NULL THEN
        -- Find default active event to log attempt against
        SELECT id INTO v_event_id FROM events WHERE entry_enabled = true LIMIT 1;
        INSERT INTO entry_scans (event_id, staff_user_id, scan_result, request_id, reason_code)
        VALUES (COALESCE(v_event_id, '00000000-0000-0000-0000-000000000000'::UUID), p_staff_user_id, 'INVALID_PASS', p_request_id, 'TOKEN_HASH_NOT_FOUND');
        
        RETURN jsonb_build_object(
            'success', false,
            'status', 'INVALID_PASS',
            'message', 'ENTRY DENIED — INVALID PASS'
        );
    END IF;

    -- Fetch registration and event details
    SELECT r.event_id, r.full_name, r.normalized_roll_number, r.academic_year, r.food_preference, r.payment_status, e.entry_enabled
    INTO v_event_id, v_student_name, v_roll_number, v_academic_year, v_food_pref, v_payment_status, v_event_entry_enabled
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    WHERE r.id = v_reg_id;

    -- Verify event entry is enabled
    IF v_event_entry_enabled = false THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ENTRY_DISABLED',
            'message', 'Event entry is currently closed by administration'
        );
    END IF;

    -- 3. Check for ALREADY USED
    IF v_pass_status = 'USED' THEN
        -- Fetch staff name who previously scanned it
        SELECT display_name INTO v_prev_staff_name FROM profiles WHERE id = (SELECT redeemed_by FROM entry_passes WHERE id = v_pass_id);

        INSERT INTO entry_scans (event_id, pass_id, staff_user_id, scan_result, request_id, reason_code)
        VALUES (v_event_id, v_pass_id, p_staff_user_id, 'ALREADY_USED', p_request_id, 'PASS_ALREADY_REDEEMED');

        RETURN jsonb_build_object(
            'success', false,
            'status', 'ALREADY_USED',
            'message', 'ENTRY DENIED — QR CODE ALREADY USED',
            'previous_scan_at', v_prev_redeemed_at,
            'previous_staff_name', COALESCE(v_prev_staff_name, 'Staff Member'),
            'student_name', v_student_name,
            'roll_number', v_roll_number
        );
    END IF;

    -- 4. Check for CANCELLED OR REVOKED
    IF v_pass_status IN ('REVOKED', 'CANCELLED') THEN
        INSERT INTO entry_scans (event_id, pass_id, staff_user_id, scan_result, request_id, reason_code)
        VALUES (v_event_id, v_pass_id, p_staff_user_id, 'PASS_CANCELLED', p_request_id, 'PASS_STATUS_' || v_pass_status);

        RETURN jsonb_build_object(
            'success', false,
            'status', 'PASS_CANCELLED',
            'message', 'ENTRY DENIED — PASS CANCELLED'
        );
    END IF;

    -- 5. Check for PAYMENT VERIFICATION
    IF v_payment_status <> 'PAID' THEN
        INSERT INTO entry_scans (event_id, pass_id, staff_user_id, scan_result, request_id, reason_code)
        VALUES (v_event_id, v_pass_id, p_staff_user_id, 'PAYMENT_NOT_VERIFIED', p_request_id, 'PAYMENT_STATUS_' || v_payment_status);

        RETURN jsonb_build_object(
            'success', false,
            'status', 'PAYMENT_NOT_VERIFIED',
            'message', 'ENTRY DENIED — PAYMENT NOT VERIFIED'
        );
    END IF;

    -- 6. ATOMICALLY REDEEM THE PASS
    UPDATE entry_passes
    SET status = 'USED',
        redeemed_at = NOW(),
        redeemed_by = p_staff_user_id,
        updated_at = NOW()
    WHERE id = v_pass_id;

    -- 7. Record the scan log
    INSERT INTO entry_scans (event_id, pass_id, staff_user_id, scan_result, request_id, reason_code)
    VALUES (v_event_id, v_pass_id, p_staff_user_id, 'ENTRY_APPROVED', p_request_id, 'APPROVED_ENTRY');

    -- 8. Return authoritative approval with verified student credentials
    RETURN jsonb_build_object(
        'success', true,
        'status', 'ENTRY_APPROVED',
        'message', 'ENTRY APPROVED — VALID FOR THIS ENTRY',
        'student_name', v_student_name,
        'roll_number', v_roll_number,
        'academic_year', v_academic_year,
        'food_preference', v_food_pref,
        'scanned_at', NOW()
    );
END;
$$;

-- -------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Is Admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND is_active = true
  );
$$;

-- Helper function: Is Staff or Admin?
CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- EVENTS: Public can read active event details, Admins can update/manage
CREATE POLICY "Public can view active event" ON events
    FOR SELECT TO public
    USING (true);

CREATE POLICY "Admin can modify events" ON events
    FOR ALL TO authenticated
    USING (is_admin());

-- PROFILES: Users can read own profile; Admin can read and manage all profiles
CREATE POLICY "Users can read own profile" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR is_admin());

CREATE POLICY "Admin can manage all profiles" ON profiles
    FOR ALL TO authenticated
    USING (is_admin());

-- REGISTRATIONS:
-- Anyone can insert a new registration (validated server-side)
CREATE POLICY "Public can insert registrations" ON registrations
    FOR INSERT TO public
    WITH CHECK (true);

-- Admins can view and update all registrations
CREATE POLICY "Admin can view all registrations" ON registrations
    FOR SELECT TO authenticated
    USING (is_admin());

CREATE POLICY "Admin can modify registrations" ON registrations
    FOR ALL TO authenticated
    USING (is_admin());

-- PAYMENTS: Admins can view and manage all payments
CREATE POLICY "Admin can view and manage payments" ON payments
    FOR ALL TO authenticated
    USING (is_admin());

-- ENTRY PASSES: Staff and Admin can view passes; only Admin or RPC can modify
CREATE POLICY "Staff and Admin can view entry passes" ON entry_passes
    FOR SELECT TO authenticated
    USING (is_staff_or_admin());

-- ENTRY SCANS: Staff can insert scans; Staff can view their own scans; Admin can view all
CREATE POLICY "Staff can view own scans" ON entry_scans
    FOR SELECT TO authenticated
    USING (staff_user_id = auth.uid() OR is_admin());

CREATE POLICY "Staff can insert scans" ON entry_scans
    FOR INSERT TO authenticated
    WITH CHECK (staff_user_id = auth.uid() OR is_admin());

-- AUDIT LOGS: Only Admin can view audit logs
CREATE POLICY "Admin can view audit logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (is_admin());

-- -------------------------------------------------------------------------
-- 11. SEED DEFAULT EVENT CONFIGURATION
-- -------------------------------------------------------------------------
INSERT INTO events (
    name,
    college_name,
    event_date,
    venue,
    venue_directions,
    registration_opens_at,
    registration_closes_at,
    registration_fee_minor_units,
    currency,
    max_capacity,
    registration_enabled,
    entry_enabled,
    payment_mode,
    payment_upi_id,
    payment_upi_name,
    student_instructions,
    contact_email,
    contact_phone,
    allowed_academic_years,
    food_options,
    terms_and_conditions
) VALUES (
    'College Pre-Diwali Celebration 2026',
    'Vibrant College of Engineering & Technology',
    '2026-10-31 17:30:00+05:30',
    'Main College Amphitheatre & Central Courtyard',
    'Near Campus Gate 2, Follow Diwali Lantern Signs to Amphitheatre Entrance',
    NOW() - INTERVAL '5 days',
    '2026-10-30 23:59:59+05:30',
    25000, -- ₹250.00
    'INR',
    1200,
    true,
    true,
    'STATIC_UPI',
    'prediwali2026@okhdfcbank',
    'College Cultural Committee',
    '1. Carry your physical college ID card alongside this QR Pass.\n2. QR pass is strictly one-time entry only. Once scanned at gate, it cannot be reused.\n3. Food coupon will be distributed at designated food counters based on registered preference (Regular / Jain).\n4. Traditional festive attire is strongly encouraged.',
    'cultural.committee@college.edu',
    '+91 98200 12345',
    ARRAY['FY', 'SY'],
    ARRAY['Regular', 'Jain'],
    '1. Entry passes are non-transferable and strictly bound to student roll number.\n2. Registration fees are non-refundable.\n3. Strict campus disciplinary code applies throughout celebration.'
) ON CONFLICT DO NOTHING;
