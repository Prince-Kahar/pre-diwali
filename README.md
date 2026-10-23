# College Pre-Diwali Celebration — Registration & One-Time QR Entry System

A production-ready, secure, responsive web application designed for college Pre-Diwali celebrations. Features student registration with food preferences (Regular/Jain), duplicate roll-number prevention, admin-configurable payments (Static UPI QR verification queue & Payment Gateway), cryptographic one-time QR entry pass generation, and real-time staff entry scanning with atomic database locking.

---

## 🌟 Architecture & Key Features

### 1. Student Registration Portal
- **Festive Diwali UI**: Deep royal purple, gold, and warm ivory palette with traditional diya lamps and rangoli motifs.
- **Dynamic Configuration**: Event title, college branding, venue, dates, registration fee, and instructions managed dynamically from the admin dashboard.
- **Mandatory Fields**:
  - Full Name (trimmed and validated)
  - Academic Year (`FY` or `SY`)
  - Food Preference (`Regular` or `Jain`)
  - Contact Number (Indian mobile format validated, masked for public privacy)
  - Roll Number (alphanumeric, case-insensitive server-side duplicate prevention)
  - Consent agreement to event guidelines
- **Confirmation Screen**: Allows students to review all details before proceeding to payment.
- **Pass Lookup**: Students can look up their registration and download their pass using their Roll Number anytime.

### 2. Dual Payment Modes
- **Mode 1: Static UPI QR Code**:
  - Displays dynamic UPI intent QR code (`upi://pay?pa=...&pn=...&am=250&cu=INR`)
  - Students scan via GPay, PhonePe, Paytm, or BHIM and submit their 12-digit UPI reference ID (UTR).
  - Status enters `PENDING` verification queue; admins authoritatively reconcile against college bank records.
  - Prevents duplicate reference crediting across registrations.
- **Mode 2: Payment Gateway (Razorpay)**:
  - Backend creates order snapshots with exact minor units.
  - Instant server-side signature verification and automated entry pass issuance.

### 3. Unique QR Entry Pass
- **Cryptographic High-Entropy Token**: Passes use opaque tokens prefixed with `PREDIWALI_PASS_`; only the SHA-256 hash is stored in the database.
- **Pass Layout**: Displays event title, college name, student name, roll number, academic year, food preference coupon badge, masked mobile number, and event date/venue.
- **Download & Export**:
  - Download pass as PDF (via `jsPDF` & `html2canvas`)
  - Download high-res QR code PNG
  - Print pass directly
  - Festive celebration confetti on issue!

### 4. Strict Atomic One-Time QR Scanning
- **Dedicated Staff Portal**: Minimal, distraction-free mobile scanner.
- **Live Camera Scanning**: Rear-camera preference (`facingMode: 'environment'`), camera permissions guidance, torch/flashlight toggle where supported, and cooldown protection against accidental double reads.
- **Manual Token Fallback**: Allows typing or pasting pass tokens if student's phone screen is cracked or damaged.
- **Atomic Database Locks**:
  - Executed via PostgreSQL stored procedure `redeem_entry_pass(p_token_hash, p_staff_user_id)` using `FOR UPDATE` row-level locks.
  - Guarantees that concurrent scans at multiple entrance gates result in **strictly one approval**.
- **Clear Visual States**:
  - **GREEN — ENTRY APPROVED**: Valid pass, displays student name, roll number, year, and food preference (Regular / Jain) for food coupon distribution.
  - **RED — ALREADY USED**: Denies entry and displays original scan timestamp and staff member who scanned it.
  - **RED — PAYMENT NOT VERIFIED**: Denies entry for pending/unpaid claims.
  - **RED — INVALID PASS**: Denies forged or unrecognized tokens.
  - **RED — PASS CANCELLED**: Denies revoked passes.

### 5. Admin Dashboard
- **Real-Time Summary Metrics**:
  - Total registrations, paid registrations, pending payment verifications, failed/rejected payments.
  - Valid passes issued, total gate entries checked in, students still expected.
  - Academic count (FY vs SY) and Catering food count (Regular vs Jain).
  - Total revenue collected in INR.
- **Registration Management**: Searchable and filterable table (by FY/SY, Food, Payment Status, Attendance). Actions to revoke passes, reissue credentials, view details, and export to CSV.
- **Payment Verification Queue**: Dedicated section to approve or reject submitted UPI transaction references.
- **Event Settings**: Full control over fees, dates, capacity, venue, registration toggle, gate scanning toggle, and payment UPI IDs.
- **Staff Management**: Create staff accounts, view scans per staff member, and toggle active/inactive access immediately.
- **Catering & Attendance Reports**: Real-time counts for kitchen and stage preparation.
- **Audit Logging**: Immutable record of all administrative actions.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js (v18+ or v20+)
- npm

### Installation
```bash
# Clone or navigate to repository
cd "e:\Event Prediwali"

# Install dependencies
npm install

# Start development server
npm run dev
```

### Running Automated Test Suite
The project includes a comprehensive Vitest automated test suite covering form validation, phone normalization, cryptographic token hashing, duplicate roll prevention, manual UPI claim workflows, atomic one-time scan enforcement, concurrent scan race conditions, and food count calculations:

```bash
# Run tests
npx vitest run
```

### Building for Production
```bash
npm run build
```

---

## 🗄️ Database Setup & Migrations (Supabase)

1. Create a project at [Supabase](https://supabase.com).
2. Open the **SQL Editor** in the Supabase Dashboard.
3. Open `supabase/migrations/20261023000000_prediwali_schema.sql` and execute the complete script.
4. The script creates:
   - Tables: `events`, `profiles`, `registrations`, `payments`, `entry_passes`, `entry_scans`, `payment_webhook_events`, `audit_logs`
   - Indexes and unique constraints (`(event_id, normalized_roll_number)`, `token_hash`, `transaction_reference`)
   - Atomic Stored Procedure: `redeem_entry_pass` with `FOR UPDATE` row lock
   - Row-Level Security (RLS) policies protecting student privacy.
5. Copy your **Supabase URL** and **Anon Key** to your `.env` file (see `.env.example`).

---

## 🔑 Default Credentials for Demo / Gate Testing

- **Admin Account**:
  - Email: `admin@college.edu`
  - Password: `any` (or configured Supabase auth)
- **Staff Scanner Accounts**:
  - Gate 1: `gate1.staff@college.edu`
  - Gate 2: `gate2.staff@college.edu`
  - PIN: `1234` (or quick switch)
- **Sample Seed Students**:
  - `FYCS101` (Aarav Patel - FY - Regular Food - Paid)
  - `SYIT205` (Priya Shah - SY - Jain Food - Paid)
  - `FYCS102` (Rohan Deshmukh - FY - Regular Food - Paid)

---

## 🛡️ Production Security Checklist

- [x] Strict server-side input validation with Zod.
- [x] Normalized Roll Numbers enforcing case-insensitive unique constraints.
- [x] Opaque random high-entropy pass tokens; only SHA-256 hashes stored in database.
- [x] Atomic row-level locking (`FOR UPDATE`) for one-time scan enforcement.
- [x] Contact numbers masked (`******3210`) to protect student privacy.
- [x] Webhook idempotency table (`payment_webhook_events`) with HMAC-SHA256 signature verification.
- [x] Money stored as integer minor units (`25000` = ₹250.00) to prevent floating-point errors.
- [x] RLS policies preventing unauthenticated users from viewing all student records or audit trails.
