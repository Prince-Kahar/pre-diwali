-- =========================================================================
-- College Pre-Diwali Celebration Database Migration
-- 1. Updates default payment UPI ID to madhavikalathiya2007@sbi
-- 2. Adds screenshot_url to payments table for verification audit
-- 3. Sets up Supabase Storage bucket 'payment-screenshots'
-- =========================================================================

-- 1. Update UPI ID in events
UPDATE events 
SET payment_upi_id = 'madhavikalathiya2007@sbi',
    payment_upi_name = 'Madhavi Kalathiya'
WHERE payment_upi_id IN ('college.prediwali@okaxis', 'prediwali2026@okhdfcbank')
   OR payment_upi_id IS NULL;

ALTER TABLE events ALTER COLUMN payment_upi_id SET DEFAULT 'madhavikalathiya2007@sbi';
ALTER TABLE events ALTER COLUMN payment_upi_name SET DEFAULT 'Madhavi Kalathiya';

-- 2. Add screenshot_url column to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- 3. Create Storage bucket for payment screenshots if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure public access policies exist for the payment-screenshots bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname = 'Public Access for Payment Screenshots'
    ) THEN
        CREATE POLICY "Public Access for Payment Screenshots"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'payment-screenshots');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname = 'Allow Upload of Payment Screenshots'
    ) THEN
        CREATE POLICY "Allow Upload of Payment Screenshots"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'payment-screenshots');
    END IF;
END $$;
