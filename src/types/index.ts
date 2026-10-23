// Core Domain & Database Types for College Pre-Diwali Celebration System

export type Role = 'ADMIN' | 'STAFF';

export type AcademicYear =
  | 'FY - M.Sc.IT'
  | 'FY - Data Science'
  | 'SY - M.Sc.IT'
  | 'SY - Data Science';

export type FoodPreference = 'Regular' | 'Jain';

export type PaymentStatus = 
  | 'NOT_STARTED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REJECTED'
  | 'REFUNDED';

export type PaymentMode = 'GATEWAY' | 'STATIC_UPI';

export type PassStatus = 'VALID' | 'USED' | 'REVOKED' | 'CANCELLED';

export type ScanResultCode = 
  | 'ENTRY_APPROVED'
  | 'ALREADY_USED'
  | 'PAYMENT_NOT_VERIFIED'
  | 'INVALID_PASS'
  | 'PASS_CANCELLED';

export interface EventSettings {
  id: string;
  name: string;
  college_name: string;
  college_logo_url?: string;
  event_date: string;
  venue: string;
  venue_directions?: string;
  registration_opens_at: string;
  registration_closes_at: string;
  registration_fee_minor_units: number; // e.g. 25000 = ₹250.00
  currency: string;
  max_capacity: number;
  maximum_capacity?: number; // Alias for schema completeness
  registration_enabled: boolean;
  entry_enabled: boolean;
  payment_mode: PaymentMode;
  payment_upi_id: string;
  payment_upi_name: string;
  payment_qr_image_url?: string;
  student_instructions: string;
  contact_email: string;
  contact_phone: string;
  allowed_academic_years: AcademicYear[];
  food_options: FoodPreference[];
  terms_and_conditions: string;
  pass_branding_title: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface PricingHistoryRecord {
  id: string;
  event_id: string;
  previous_fee_minor_units: number;
  new_fee_minor_units: number;
  currency: string;
  change_reason?: string;
  changed_by: string;
  changed_by_name?: string;
  created_at: string;
}

export interface UpdatePricingInput {
  registration_fee_minor_units: number;
  registration_enabled: boolean;
  registration_opens_at: string;
  registration_closes_at: string;
  maximum_capacity: number;
  change_reason?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCredential {
  username: string;
  role: Role;
  password_hash: string;
  salt: string;
  updated_at: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  message?: string;
}

export interface Registration {
  id: string;
  event_id: string;
  full_name: string;
  academic_year: AcademicYear;
  food_preference: FoodPreference;
  contact_number: string;
  normalized_roll_number: string;
  consent_agreed: boolean;
  payment_status: PaymentStatus;
  expected_amount_minor_units: number;
  currency: string;
  performance_talent?: string;
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
}

export interface PaymentRecord {
  id: string;
  registration_id: string;
  provider: 'RAZORPAY' | 'STATIC_UPI';
  provider_order_id?: string;
  provider_payment_id?: string;
  transaction_reference?: string;
  expected_amount_minor_units: number;
  currency: string;
  status: PaymentStatus;
  verification_method: 'GATEWAY_SIGNATURE' | 'MANUAL_ADMIN';
  verified_by?: string;
  verified_by_name?: string;
  verified_at?: string;
  rejection_reason?: string;
  admin_notes?: string;
  screenshot_url?: string;
  created_at: string;
  updated_at: string;
}

export interface EntryPass {
  id: string;
  registration_id: string;
  token_hash: string;
  raw_token?: string; // Only delivered directly to verified student on issue
  status: PassStatus;
  issued_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
  redeemed_by_name?: string;
  revoked_at?: string;
  replacement_of_pass_id?: string;
}

export interface EntryScanLog {
  id: string;
  event_id: string;
  pass_id?: string;
  staff_user_id: string;
  staff_name?: string;
  scan_result: ScanResultCode;
  scanned_at: string;
  request_id?: string;
  reason_code?: string;
  student_name?: string;
  roll_number?: string;
}

export interface AuditLog {
  id: string;
  actor_user_id?: string;
  actor_name?: string;
  event_id?: string;
  action: string;
  target_type: string;
  target_id?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Request and Response payloads
export interface StudentRegistrationInput {
  full_name: string;
  academic_year: AcademicYear;
  food_preference: FoodPreference;
  contact_number: string;
  roll_number: string;
  consent_agreed: boolean;
  performance_talent?: string;
}

export interface ScanVerificationResult {
  success: boolean;
  status: ScanResultCode;
  message: string;
  student_name?: string;
  roll_number?: string;
  academic_year?: AcademicYear;
  food_preference?: FoodPreference;
  scanned_at?: string;
  previous_scan_at?: string;
  previous_staff_name?: string;
}

export interface DashboardMetrics {
  totalRegistrations: number;
  paidRegistrations: number;
  pendingVerifications: number;
  failedOrRejected: number;
  validPassesIssued: number;
  totalEntries: number;
  notCheckedIn: number;
  fyCount: number;
  syCount: number;
  regularFoodCount: number;
  jainFoodCount: number;
  cancelledCount: number;
  totalRevenueMinorUnits: number;
}
