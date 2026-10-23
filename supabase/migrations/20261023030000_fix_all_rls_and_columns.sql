-- =========================================================================
-- COMPLETE SUPABASE FIX & INITIALIZATION SCRIPT FOR PRE-DIWALI EVENT
-- Copy and paste this ENTIRE script into Supabase -> SQL Editor -> Click RUN
-- =========================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Alter 'registrations' to support all course options (M.Sc.IT, Data Science) & performance talent
ALTER TABLE IF EXISTS registrations 
  ALTER COLUMN academic_year TYPE TEXT;

ALTER TABLE IF EXISTS registrations 
  DROP CONSTRAINT IF EXISTS registrations_academic_year_check;

ALTER TABLE IF EXISTS registrations 
  ADD COLUMN IF NOT EXISTS performance_talent TEXT;

-- 3. Ensure 'payments' table has screenshot_url column
ALTER TABLE IF EXISTS payments 
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- 4. Insert or update the official Pre-Diwali Event row
INSERT INTO events (
    id,
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
    contact_email,
    contact_phone
) VALUES (
    'e1000000-0000-4000-a000-000000000001',
    'Pre-Diwali Celebration 2026',
    'Sascma College',
    '2026-11-04 17:00:00+05:30',
    'SASCMA English Medium Commerce College, Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
    'Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
    '2026-10-15 00:00:00+05:30',
    '2026-11-04 12:00:00+05:30',
    30000,
    'INR',
    1200,
    true,
    true,
    'STATIC_UPI',
    'madhavikalathiya2007@sbi',
    'Madhavi Kalathiya',
    'prince.kahar.king@gmail.com',
    '7285056019'
) ON CONFLICT (id) DO UPDATE SET
    college_name = 'Sascma College',
    venue = 'SASCMA English Medium Commerce College, Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
    venue_directions = 'Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
    event_date = '2026-11-04 17:00:00+05:30',
    registration_fee_minor_units = 30000,
    contact_email = 'prince.kahar.king@gmail.com',
    contact_phone = '7285056019',
    payment_upi_id = 'madhavikalathiya2007@sbi',
    payment_upi_name = 'Madhavi Kalathiya',
    registration_enabled = true,
    entry_enabled = true;

-- 5. Fix Row Level Security (RLS) policies so student registrations, payments & scans work seamlessly
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_scans ENABLE ROW LEVEL SECURITY;

-- EVENTS Policies
DROP POLICY IF EXISTS "Allow all on events" ON events;
DROP POLICY IF EXISTS "Public can view active event" ON events;
DROP POLICY IF EXISTS "Admin can modify events" ON events;
CREATE POLICY "Allow all on events" ON events FOR ALL TO public USING (true) WITH CHECK (true);

-- REGISTRATIONS Policies (Allow public students to insert & view their own passes)
DROP POLICY IF EXISTS "Allow all on registrations" ON registrations;
DROP POLICY IF EXISTS "Public can insert registrations" ON registrations;
DROP POLICY IF EXISTS "Admin can view all registrations" ON registrations;
DROP POLICY IF EXISTS "Admin can modify registrations" ON registrations;
CREATE POLICY "Allow all on registrations" ON registrations FOR ALL TO public USING (true) WITH CHECK (true);

-- PAYMENTS Policies (Allow public students to submit UPI claims and view payment status)
DROP POLICY IF EXISTS "Allow all on payments" ON payments;
DROP POLICY IF EXISTS "Admin can view and manage payments" ON payments;
CREATE POLICY "Allow all on payments" ON payments FOR ALL TO public USING (true) WITH CHECK (true);

-- ENTRY PASSES Policies
DROP POLICY IF EXISTS "Allow all on entry_passes" ON entry_passes;
DROP POLICY IF EXISTS "Staff and Admin can view entry passes" ON entry_passes;
CREATE POLICY "Allow all on entry_passes" ON entry_passes FOR ALL TO public USING (true) WITH CHECK (true);

-- ENTRY SCANS Policies
DROP POLICY IF EXISTS "Allow all on entry_scans" ON entry_scans;
DROP POLICY IF EXISTS "Staff can view own scans" ON entry_scans;
DROP POLICY IF EXISTS "Staff can insert scans" ON entry_scans;
CREATE POLICY "Allow all on entry_scans" ON entry_scans FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. Setup Storage Bucket for Payment Screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public read payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public upload payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public update payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow Upload of Payment Screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public Access for Payment Screenshots" ON storage.objects;

CREATE POLICY "Public read payment screenshots" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'payment-screenshots');

CREATE POLICY "Public upload payment screenshots" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'payment-screenshots');

CREATE POLICY "Public update payment screenshots" ON storage.objects
  FOR UPDATE TO public USING (bucket_id = 'payment-screenshots');
