-- Migration: Allow DINNER_APPROVED and flexible scan results in entry_scans table
-- Date: 2026-10-24

DO $$
BEGIN
    -- 1. Drop the restrictive check constraint on scan_result if present
    ALTER TABLE IF EXISTS entry_scans DROP CONSTRAINT IF EXISTS entry_scans_scan_result_check;

    -- 2. Add extended check constraint supporting dinner redemptions and multi-station checkpoints
    ALTER TABLE IF EXISTS entry_scans ADD CONSTRAINT entry_scans_scan_result_check 
        CHECK (scan_result IN (
            'ENTRY_APPROVED',
            'DINNER_APPROVED',
            'ALREADY_USED',
            'ALREADY_CLAIMED_DINNER',
            'PAYMENT_NOT_VERIFIED',
            'INVALID_PASS',
            'PASS_CANCELLED',
            'GATE_ENTRY_NOT_DONE'
        ));

    -- 3. Add gate_identifier column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'entry_scans' AND column_name = 'gate_identifier'
    ) THEN
        ALTER TABLE entry_scans ADD COLUMN gate_identifier TEXT;
    END IF;

    -- 4. Add created_at column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'entry_scans' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE entry_scans ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
