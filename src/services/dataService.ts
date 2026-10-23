import {
  EventSettings,
  UserProfile,
  Registration,
  PaymentRecord,
  EntryPass,
  EntryScanLog,
  AuditLog,
  StudentRegistrationInput,
  ScanVerificationResult,
  DashboardMetrics,
  PaymentStatus,
  PricingHistoryRecord,
  UpdatePricingInput,
} from '../types';
import { generatePassToken, hashToken, maskContactNumber } from '../lib/crypto';
import { normalizeRollNumber, normalizeContactNumber, registrationSchema, manualPaymentClaimSchema } from '../lib/validation';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_KEYS = {
  EVENT: 'prediwali_event_settings',
  REGISTRATIONS: 'prediwali_registrations',
  PAYMENTS: 'prediwali_payments',
  PASSES: 'prediwali_passes',
  SCANS: 'prediwali_scans',
  PROFILES: 'prediwali_profiles',
  AUDIT: 'prediwali_audit',
  PRICING_HISTORY: 'prediwali_pricing_history',
  ACTIVE_PASS_TOKENS: 'prediwali_client_pass_tokens', // maps registrationId -> raw token for client view
};

// Default seed event
const DEFAULT_EVENT: EventSettings = {
  id: 'e1000000-0000-4000-a000-000000000001',
  name: 'Pre-Diwali Celebration 2026',
  college_name: 'Sascma College',
  college_logo_url: '',
  event_date: '2026-11-04T17:00:00+05:30', // 4 Nov, 5:00 PM
  venue: 'SASCMA English Medium Commerce College, Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
  venue_directions: 'Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India',
  registration_opens_at: '2026-10-15T00:00:00+05:30',
  registration_closes_at: '2026-11-04T12:00:00+05:30',
  registration_fee_minor_units: 30000, // ₹300.00
  currency: 'INR',
  max_capacity: 1200,
  maximum_capacity: 1200,
  registration_enabled: true,
  entry_enabled: true,
  payment_mode: 'STATIC_UPI', // Static UPI only
  payment_upi_id: 'madhavikalathiya2007@sbi',
  payment_upi_name: 'Madhavi Kalathiya',
  student_instructions: '1. Carry your physical college ID card alongside this QR Pass.\n2. QR pass is strictly one-time entry only. Once scanned at gate, it cannot be reused.\n3. Food coupon will be distributed at designated food counters based on registered preference (Regular / Jain).\n4. Traditional festive attire is strongly encouraged.',
  contact_email: 'prince.kahar.king@gmail.com',
  contact_phone: '7285056019',
  allowed_academic_years: ['FY - M.Sc.IT', 'FY - Data Science', 'SY - M.Sc.IT', 'SY - Data Science'],
  food_options: ['Regular', 'Jain'],
  terms_and_conditions: '1. Entry passes are non-transferable and strictly bound to student roll number.\n2. Registration fees are non-refundable.\n3. Strict campus disciplinary code applies throughout celebration.',
  pass_branding_title: 'SASCMA FESTIVE ENTRY PASS',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Default Profiles
const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'p1000000-0000-4000-a000-000000000001',
    email: 'admin',
    display_name: 'Admin',
    role: 'ADMIN',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p1000000-0000-4000-a000-000000000002',
    email: 'staff',
    display_name: 'Staff Scanner',
    role: 'STAFF',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Helper to access memory / storage
class PreDiwaliDataStore {
  private event: EventSettings = { ...DEFAULT_EVENT };
  private profiles: UserProfile[] = [...DEFAULT_PROFILES];
  private registrations: Registration[] = [];
  private payments: PaymentRecord[] = [];
  private passes: EntryPass[] = [];
  private scans: EntryScanLog[] = [];
  private auditLogs: AuditLog[] = [];
  private pricingHistory: PricingHistoryRecord[] = [];
  private clientTokens: Record<string, string> = {}; // registrationId -> raw token

  // Mutex lock for atomic operations (concurrency safety)
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.loadFromStorage();
    if (this.pricingHistory.length === 0) {
      this.seedInitialPricingHistory();
    }
    if (this.isBrowser() && isSupabaseConfigured) {
      this.initSupabase().catch((err) => console.warn('Supabase init err:', err));
    }
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private loadFromStorage() {
    if (!this.isBrowser()) return;
    try {
      const e = localStorage.getItem(STORAGE_KEYS.EVENT);
      if (e) this.event = JSON.parse(e);

      // Automatic update to Sascma College & authoritative details
      this.event.college_name = 'Sascma College';
      this.event.venue = 'SASCMA English Medium Commerce College, Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India';
      this.event.venue_directions = 'Surat - Dumas Rd, Opp Govardhan-Temple(Haveli), Vesu, Surat, Gujarat 395007, India';
      this.event.event_date = '2026-11-04T17:00:00+05:30';
      this.event.contact_email = 'prince.kahar.king@gmail.com';
      this.event.contact_phone = '7285056019';
      this.event.payment_upi_id = 'madhavikalathiya2007@sbi';
      this.event.payment_upi_name = 'Madhavi Kalathiya';
      this.event.payment_mode = 'STATIC_UPI';
      this.event.registration_fee_minor_units = 30000;
      this.event.allowed_academic_years = ['FY - M.Sc.IT', 'FY - Data Science', 'SY - M.Sc.IT', 'SY - Data Science'];
      this.persist();

      // Profiles: Admin and Staff Scanner
      this.profiles = [...DEFAULT_PROFILES];

      const r = localStorage.getItem(STORAGE_KEYS.REGISTRATIONS);
      if (r) {
        this.registrations = JSON.parse(r)
          .filter((item: Registration) => !item.id.startsWith('reg-seed-'))
          .map((item: Registration) => {
            if (item.expected_amount_minor_units === 25000) {
              return { ...item, expected_amount_minor_units: 30000 };
            }
            return item;
          });
      }

      const p = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
      if (p) {
        this.payments = JSON.parse(p)
          .filter((item: PaymentRecord) => !item.id.startsWith('pay-seed-'))
          .map((item: PaymentRecord) => {
            if (item.expected_amount_minor_units === 25000) {
              return { ...item, expected_amount_minor_units: 30000 };
            }
            return item;
          });
      }

      const ps = localStorage.getItem(STORAGE_KEYS.PASSES);
      if (ps) {
        this.passes = JSON.parse(ps).filter((item: EntryPass) => !item.id.startsWith('pass-seed-'));
      }

      const s = localStorage.getItem(STORAGE_KEYS.SCANS);
      if (s) this.scans = JSON.parse(s);

      const a = localStorage.getItem(STORAGE_KEYS.AUDIT);
      if (a) this.auditLogs = JSON.parse(a);

      const ph = localStorage.getItem(STORAGE_KEYS.PRICING_HISTORY);
      if (ph) this.pricingHistory = JSON.parse(ph);

      const t = localStorage.getItem(STORAGE_KEYS.ACTIVE_PASS_TOKENS);
      if (t) this.clientTokens = JSON.parse(t);
    } catch (err) {
      console.warn('Could not load local storage:', err);
    }
  }

  private persist() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(STORAGE_KEYS.EVENT, JSON.stringify(this.event));
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(this.profiles));
      localStorage.setItem(STORAGE_KEYS.REGISTRATIONS, JSON.stringify(this.registrations));
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments));
      localStorage.setItem(STORAGE_KEYS.PASSES, JSON.stringify(this.passes));
      localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(this.scans));
      localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(this.auditLogs));
      localStorage.setItem(STORAGE_KEYS.PRICING_HISTORY, JSON.stringify(this.pricingHistory));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PASS_TOKENS, JSON.stringify(this.clientTokens));
    } catch (err) {
      console.warn('Storage persistence failed:', err);
    }
  }

  private async acquireLock(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(key, lockPromise);
    return () => {
      this.locks.delete(key);
      resolveLock();
    };
  }

  private async seedInitialRegistrations() {
    // No dummy registrations! Only genuine student registrations are saved and synced to Supabase.
  }

  private seedInitialPricingHistory() {
    const admin = this.profiles[0];
    const initialRecord: PricingHistoryRecord = {
      id: 'price-hist-seed-001',
      event_id: this.event.id,
      previous_fee_minor_units: this.event.registration_fee_minor_units,
      new_fee_minor_units: this.event.registration_fee_minor_units,
      currency: this.event.currency,
      change_reason: 'Initial event baseline fee establishment',
      changed_by: admin ? admin.id : 'system-seed',
      changed_by_name: admin ? admin.display_name : 'System Baseline',
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    };
    this.pricingHistory.push(initialRecord);
    this.persist();
  }

  // --- PUBLIC API METHODS ---

  public getEventSettings(): EventSettings {
    return { ...this.event };
  }

  public getPricingHistory(eventId?: string): PricingHistoryRecord[] {
    if (eventId) {
      return this.pricingHistory.filter((p) => p.event_id === eventId);
    }
    return [...this.pricingHistory];
  }

  public async updateRegistrationPricing(
    input: UpdatePricingInput,
    adminId: string
  ): Promise<{ event: EventSettings; historyRecord: PricingHistoryRecord }> {
    // 1. Authorize: only active administrator can modify pricing
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin || !admin.is_active) {
      throw new Error('Unauthorized: only authenticated and active administrators can update registration pricing');
    }

    // 2. Validate bounds & business logic
    if (!Number.isInteger(input.registration_fee_minor_units) || input.registration_fee_minor_units <= 0) {
      throw new Error('Registration fee must be a strictly positive integer amount (in paise)');
    }

    if (input.registration_fee_minor_units > 10000000) {
      throw new Error('Registration fee exceeds maximum allowable threshold (₹1,00,000)');
    }

    if (!Number.isInteger(input.maximum_capacity) || input.maximum_capacity <= 0) {
      throw new Error('Maximum capacity must be a positive whole number');
    }

    const opens = new Date(input.registration_opens_at).getTime();
    const closes = new Date(input.registration_closes_at).getTime();
    if (isNaN(opens) || isNaN(closes)) {
      throw new Error('Invalid registration opening or closing dates');
    }
    if (opens >= closes) {
      throw new Error('Registration opening date and time must be prior to closing date and time');
    }

    // 3. Concurrency Lock for atomic pricing modification
    const releaseLock = await this.acquireLock('pricing_update');
    try {
      const prevFee = this.event.registration_fee_minor_units;

      // Update event settings
      this.event = {
        ...this.event,
        registration_fee_minor_units: input.registration_fee_minor_units,
        registration_enabled: input.registration_enabled,
        registration_opens_at: input.registration_opens_at,
        registration_closes_at: input.registration_closes_at,
        max_capacity: input.maximum_capacity,
        maximum_capacity: input.maximum_capacity,
        updated_by: admin.id,
        updated_by_name: admin.display_name,
        updated_at: new Date().toISOString(),
      };

      // Create immutable pricing audit record
      const historyRecord: PricingHistoryRecord = {
        id: `price-hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        event_id: this.event.id,
        previous_fee_minor_units: prevFee,
        new_fee_minor_units: input.registration_fee_minor_units,
        currency: this.event.currency,
        change_reason: input.change_reason?.trim() || 'Administrative pricing adjustment',
        changed_by: admin.id,
        changed_by_name: admin.display_name,
        created_at: new Date().toISOString(),
      };

      this.pricingHistory.unshift(historyRecord);

      // Record in universal audit trail
      this.addAuditLog(
        admin.id,
        'UPDATE_REGISTRATION_PRICING',
        'event',
        this.event.id,
        `Updated registration fee from ₹${prevFee / 100} to ₹${input.registration_fee_minor_units / 100}. Reason: ${historyRecord.change_reason}`,
        {
          previous_fee_minor_units: prevFee,
          new_fee_minor_units: input.registration_fee_minor_units,
          pricing_history_id: historyRecord.id,
          registration_enabled: input.registration_enabled,
          maximum_capacity: input.maximum_capacity,
        }
      );

      this.persist();
      return { event: { ...this.event }, historyRecord };
    } finally {
      releaseLock();
    }
  }

  public updateEventSettings(updated: Partial<EventSettings>, actorId: string): EventSettings {
    this.event = {
      ...this.event,
      ...updated,
      updated_at: new Date().toISOString(),
    };
    this.addAuditLog(actorId, 'UPDATE_EVENT_SETTINGS', 'event', this.event.id, 'Updated event settings', updated);
    this.persist();
    return { ...this.event };
  }

  public getProfiles(): UserProfile[] {
    return [...this.profiles];
  }

  public createStaffUser(email: string, displayName: string, actorId: string): UserProfile {
    const existing = this.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('A staff account with this email already exists');
    }
    const staff: UserProfile = {
      id: `staff-${Date.now()}`,
      email: email.trim().toLowerCase(),
      display_name: displayName.trim(),
      role: 'STAFF',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.profiles.push(staff);
    this.addAuditLog(actorId, 'CREATE_STAFF_USER', 'profile', staff.id, `Created staff account for ${email}`);
    this.persist();
    return staff;
  }

  public toggleStaffStatus(staffId: string, isActive: boolean, actorId: string): UserProfile {
    const staff = this.profiles.find((p) => p.id === staffId);
    if (!staff) throw new Error('Staff account not found');
    staff.is_active = isActive;
    staff.updated_at = new Date().toISOString();
    this.addAuditLog(actorId, 'TOGGLE_STAFF_STATUS', 'profile', staffId, `Changed staff status to ${isActive}`);
    this.persist();
    return staff;
  }

  public async registerStudent(input: StudentRegistrationInput): Promise<{
    registration: Registration;
    alreadyRegistered: boolean;
    existingStatus?: PaymentStatus;
    existingRegistrationId?: string;
  }> {
    // 1. Zod input validation
    const parsed = registrationSchema.parse(input);

    // 2. Event Availability & Capacity Check
    if (!this.event.registration_enabled) {
      throw new Error('Registrations are currently closed by the college administration.');
    }
    const now = new Date();
    if (now < new Date(this.event.registration_opens_at)) {
      throw new Error('Registrations have not opened yet.');
    }
    if (now > new Date(this.event.registration_closes_at)) {
      throw new Error('Registration deadline has passed.');
    }

    const activeCount = this.registrations.filter((r) => r.payment_status === 'PAID').length;
    if (activeCount >= this.event.max_capacity) {
      throw new Error('Event capacity has been reached. No more registrations can be accepted.');
    }

    // 3. Normalized Roll Number Check (Strict Server-Side Unique Constraint)
    const normalizedRoll = normalizeRollNumber(parsed.roll_number);
    const existing = this.registrations.find(
      (r) => r.event_id === this.event.id && r.normalized_roll_number === normalizedRoll
    );

    if (existing) {
      if (existing.payment_status === 'PENDING' && existing.expected_amount_minor_units === 25000) {
        existing.expected_amount_minor_units = this.event.registration_fee_minor_units || 30000;
        this.persist();
      }
      return {
        registration: existing,
        alreadyRegistered: true,
        existingStatus: existing.payment_status,
        existingRegistrationId: existing.id,
      };
    }

    // 4. Create Immutable Registration Snapshot
    const cleanPhone = normalizeContactNumber(parsed.contact_number);
    const regId = generateUUID();

    const newReg: Registration = {
      id: regId,
      event_id: this.event.id,
      full_name: parsed.full_name.trim(),
      academic_year: parsed.academic_year,
      food_preference: parsed.food_preference,
      contact_number: cleanPhone,
      normalized_roll_number: normalizedRoll,
      consent_agreed: true,
      payment_status: 'PENDING',
      expected_amount_minor_units: this.event.registration_fee_minor_units,
      currency: this.event.currency,
      performance_talent: input.performance_talent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.registrations.push(newReg);
    this.persist();

    // Supabase Cloud Sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('registrations').insert({
          id: newReg.id,
          event_id: newReg.event_id,
          full_name: newReg.full_name,
          academic_year: newReg.academic_year,
          food_preference: newReg.food_preference,
          contact_number: newReg.contact_number,
          normalized_roll_number: newReg.normalized_roll_number,
          consent_agreed: newReg.consent_agreed,
          payment_status: newReg.payment_status,
          expected_amount_minor_units: newReg.expected_amount_minor_units,
          currency: newReg.currency,
          created_at: newReg.created_at,
          updated_at: newReg.updated_at,
        });
      } catch (err) {
        console.warn('Supabase registration insert sync notice:', err);
      }
    }

    return {
      registration: newReg,
      alreadyRegistered: false,
    };
  }

  public getRegistrationById(id: string): Registration | undefined {
    return this.registrations.find((r) => r.id === id);
  }

  public getRegistrationByRollNumber(rollNumber: string): Registration | undefined {
    const normalized = normalizeRollNumber(rollNumber);
    return this.registrations.find((r) => r.normalized_roll_number === normalized);
  }

  public getPaymentForRegistration(regId: string): PaymentRecord | undefined {
    return this.payments.find((p) => p.registration_id === regId);
  }

  public async submitManualPaymentClaim(
    registrationId: string,
    transactionReference: string,
    screenshotUrl?: string
  ): Promise<PaymentRecord> {
    const parsed = manualPaymentClaimSchema.parse({
      transaction_reference: transactionReference,
      screenshot_url: screenshotUrl,
    });
    const reg = this.getRegistrationById(registrationId);
    if (!reg) throw new Error('Registration record not found');

    if (reg.payment_status === 'PAID') {
      throw new Error('This registration has already been verified and paid.');
    }

    const ref = parsed.transaction_reference.toUpperCase();

    // Check if another payment has already used this reference ID
    const duplicateRef = this.payments.find(
      (p) => p.transaction_reference?.toUpperCase() === ref && p.registration_id !== registrationId
    );
    if (duplicateRef) {
      throw new Error('This transaction reference ID has already been submitted for another registration.');
    }

    if (reg.payment_status === 'PENDING' && reg.expected_amount_minor_units === 25000) {
      reg.expected_amount_minor_units = this.event.registration_fee_minor_units || 30000;
    }

    const cleanRef = ref.trim().slice(0, 12);
    let payment = this.getPaymentForRegistration(registrationId);
    const now = new Date().toISOString();

    if (!payment) {
      payment = {
        id: generateUUID(),
        registration_id: registrationId,
        provider: 'STATIC_UPI',
        transaction_reference: cleanRef,
        screenshot_url: screenshotUrl,
        expected_amount_minor_units: reg.expected_amount_minor_units,
        currency: reg.currency,
        status: 'PENDING',
        verification_method: 'MANUAL_ADMIN',
        created_at: now,
        updated_at: now,
      };
      this.payments.push(payment);
    } else {
      payment.transaction_reference = cleanRef;
      if (payment.expected_amount_minor_units === 25000) {
        payment.expected_amount_minor_units = reg.expected_amount_minor_units;
      }
      if (screenshotUrl) payment.screenshot_url = screenshotUrl;
      payment.status = 'PENDING';
      payment.updated_at = now;
      payment.rejection_reason = undefined;
    }

    reg.payment_status = 'PENDING';
    reg.updated_at = now;

    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('payments').upsert({
          id: payment.id,
          registration_id: payment.registration_id,
          provider: payment.provider,
          transaction_reference: payment.transaction_reference,
          screenshot_url: payment.screenshot_url || null,
          expected_amount_minor_units: payment.expected_amount_minor_units,
          currency: payment.currency,
          status: payment.status,
          verification_method: payment.verification_method,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        });

        await supabase
          .from('registrations')
          .update({ payment_status: 'PENDING', updated_at: now })
          .eq('id', registrationId);
      } catch (err) {
        console.warn('Supabase payment claim sync notice:', err);
      }
    }

    return payment;
  }

  public async recordGatewayPaymentSuccess(
    registrationId: string,
    orderId: string,
    paymentId: string
  ): Promise<PaymentRecord> {
    const reg = this.getRegistrationById(registrationId);
    if (!reg) throw new Error('Registration record not found');

    const now = new Date().toISOString();
    let payment = this.getPaymentForRegistration(registrationId);

    if (!payment) {
      payment = {
        id: `pay-${Date.now()}`,
        registration_id: registrationId,
        provider: 'RAZORPAY',
        provider_order_id: orderId,
        provider_payment_id: paymentId,
        expected_amount_minor_units: reg.expected_amount_minor_units,
        currency: reg.currency,
        status: 'PAID',
        verification_method: 'GATEWAY_SIGNATURE',
        verified_at: now,
        created_at: now,
        updated_at: now,
      };
      this.payments.push(payment);
    } else {
      payment.provider_order_id = orderId;
      payment.provider_payment_id = paymentId;
      payment.status = 'PAID';
      payment.verified_at = now;
      payment.updated_at = now;
    }

    reg.payment_status = 'PAID';
    reg.updated_at = now;

    // Automatically issue Entry Pass
    await this.issueEntryPass(registrationId);

    this.persist();
    return payment;
  }

  public async verifyManualPaymentAdmin(
    paymentId: string,
    adminId: string,
    notes?: string
  ): Promise<{ payment: PaymentRecord; pass: EntryPass }> {
    const payment = this.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Payment record not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized: only active admins can verify payments');

    const reg = this.getRegistrationById(payment.registration_id);
    if (!reg) throw new Error('Associated registration not found');

    const now = new Date().toISOString();
    payment.status = 'PAID';
    payment.verified_by = admin.id;
    payment.verified_by_name = admin.display_name;
    payment.verified_at = now;
    payment.admin_notes = notes || 'Verified manually against college bank UPI transaction records';
    payment.updated_at = now;

    reg.payment_status = 'PAID';
    reg.updated_at = now;

    // Issue Entry Pass
    const pass = await this.issueEntryPass(reg.id);

    this.addAuditLog(
      adminId,
      'VERIFY_MANUAL_PAYMENT',
      'payment',
      payment.id,
      `Verified payment of ₹${payment.expected_amount_minor_units / 100} for Roll: ${reg.normalized_roll_number}`
    );

    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('payments')
          .update({
            status: 'PAID',
            verified_at: now,
            admin_notes: payment.admin_notes,
            updated_at: now,
          })
          .eq('id', payment.id);

        await supabase
          .from('registrations')
          .update({
            payment_status: 'PAID',
            updated_at: now,
          })
          .eq('id', reg.id);

        await supabase
          .from('entry_passes')
          .upsert({
            id: pass.id,
            registration_id: pass.registration_id,
            token_hash: pass.token_hash,
            status: pass.status,
            issued_at: pass.issued_at,
          });
      } catch (err) {
        console.warn('Supabase verifyManualPaymentAdmin sync error:', err);
      }
    }

    return { payment, pass };
  }

  public async rejectManualPaymentAdmin(paymentId: string, adminId: string, reason: string): Promise<PaymentRecord> {
    const payment = this.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Payment record not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized: only active admins can reject payments');

    const reg = this.getRegistrationById(payment.registration_id);
    if (!reg) throw new Error('Associated registration not found');

    const now = new Date().toISOString();
    payment.status = 'REJECTED';
    payment.verified_by = admin.id;
    payment.verified_by_name = admin.display_name;
    payment.verified_at = now;
    payment.rejection_reason = reason.trim() || 'Payment details could not be verified against bank records';
    payment.updated_at = now;

    reg.payment_status = 'REJECTED';
    reg.updated_at = now;

    this.addAuditLog(
      adminId,
      'REJECT_MANUAL_PAYMENT',
      'payment',
      payment.id,
      `Rejected payment for Roll: ${reg.normalized_roll_number}. Reason: ${payment.rejection_reason}`
    );

    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('payments')
          .update({
            status: 'REJECTED',
            verified_at: now,
            rejection_reason: payment.rejection_reason,
            updated_at: now,
          })
          .eq('id', payment.id);

        await supabase
          .from('registrations')
          .update({
            payment_status: 'REJECTED',
            updated_at: now,
          })
          .eq('id', reg.id);
      } catch (err) {
        console.warn('Supabase rejectManualPaymentAdmin sync error:', err);
      }
    }

    return payment;
  }

  public async issueEntryPass(registrationId: string): Promise<EntryPass> {
    const reg = this.getRegistrationById(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.payment_status !== 'PAID') {
      throw new Error('Cannot issue entry pass for unpaid registration');
    }

    // Check if valid pass already exists
    const existing = this.passes.find((p) => p.registration_id === registrationId && p.status === 'VALID');
    if (existing) {
      return existing;
    }

    // Generate high-entropy opaque pass token and SHA-256 hash
    const rawToken = generatePassToken();
    const tokenHash = await hashToken(rawToken);

    const pass: EntryPass = {
      id: generateUUID(),
      registration_id: registrationId,
      token_hash: tokenHash,
      status: 'VALID',
      issued_at: new Date().toISOString(),
    };

    this.passes.push(pass);
    this.clientTokens[registrationId] = rawToken;

    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('entry_passes').upsert({
          id: pass.id,
          registration_id: pass.registration_id,
          token_hash: pass.token_hash,
          status: pass.status,
          issued_at: pass.issued_at,
        });
      } catch (err) {
        console.warn('Supabase issueEntryPass sync error:', err);
      }
    }

    return pass;
  }

  public getEntryPassByRegistration(registrationId: string): (EntryPass & { raw_token?: string }) | undefined {
    const pass = this.passes.find((p) => p.registration_id === registrationId);
    if (!pass) return undefined;
    const raw_token = this.clientTokens[registrationId];
    return { ...pass, raw_token };
  }

  public async revokePassAdmin(passId: string, adminId: string, reason: string): Promise<EntryPass> {
    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pass not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    pass.status = 'REVOKED';
    pass.revoked_at = new Date().toISOString();
    this.addAuditLog(adminId, 'REVOKE_PASS', 'entry_pass', passId, reason);
    this.persist();
    return pass;
  }

  public async reissuePassAdmin(oldPassId: string, adminId: string, reason: string): Promise<EntryPass> {
    const oldPass = this.passes.find((p) => p.id === oldPassId);
    if (!oldPass) throw new Error('Existing pass not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    // Revoke old pass
    oldPass.status = 'REVOKED';
    oldPass.revoked_at = new Date().toISOString();

    // Generate new pass
    const rawToken = generatePassToken();
    const tokenHash = await hashToken(rawToken);

    const newPass: EntryPass = {
      id: `pass-reissue-${Date.now()}`,
      registration_id: oldPass.registration_id,
      token_hash: tokenHash,
      status: 'VALID',
      issued_at: new Date().toISOString(),
      replacement_of_pass_id: oldPass.id,
    };

    this.passes.push(newPass);
    this.clientTokens[oldPass.registration_id] = rawToken;

    this.addAuditLog(adminId, 'REISSUE_PASS', 'entry_pass', newPass.id, `Reissued pass. Old Pass: ${oldPassId}. Reason: ${reason}`);
    this.persist();
    return newPass;
  }

  // -------------------------------------------------------------------------
  // STRICT ATOMIC ONE-TIME QR SCAN REDEMPTION
  // -------------------------------------------------------------------------
  public async redeemEntryPass(
    presentedTokenOrHash: string,
    staffUserId: string,
    requestId?: string
  ): Promise<ScanVerificationResult> {
    const staff = this.profiles.find((p) => p.id === staffUserId);
    if (!staff || !staff.is_active) {
      return {
        success: false,
        status: 'INVALID_PASS',
        message: 'Unauthorized: Staff member is not recognized or is inactive',
      };
    }

    if (!this.event.entry_enabled) {
      return {
        success: false,
        status: 'PASS_CANCELLED',
        message: 'Event entry is currently closed by the administration',
      };
    }

    // Determine token hash
    const cleanToken = presentedTokenOrHash.trim();
    const computedHash = cleanToken.startsWith('PREDIWALI_PASS_')
      ? await hashToken(cleanToken)
      : (cleanToken.length === 64 ? cleanToken.toLowerCase() : await hashToken(cleanToken));

    // Concurrency Lock on the specific token hash to eliminate race conditions
    const releaseLock = await this.acquireLock(`scan_${computedHash}`);

    try {
      let pass = this.passes.find((p) => p.token_hash === computedHash || p.id === cleanToken);

      // Roll Number fallback: Staff or student may enter/scan Roll Number
      if (!pass) {
        const normRoll = normalizeRollNumber(cleanToken);
        const regByRoll = this.registrations.find((r) => r.normalized_roll_number === normRoll);
        if (regByRoll) {
          pass = this.passes.find((p) => p.registration_id === regByRoll.id && p.status === 'VALID')
            || this.passes.find((p) => p.registration_id === regByRoll.id);
        }
      }

      // If not in local memory, check Supabase
      if (!pass && isSupabaseConfigured && supabase) {
        try {
          const { data: dbPass } = await supabase
            .from('entry_passes')
            .select('*')
            .eq('token_hash', computedHash)
            .maybeSingle();

          if (dbPass) {
            pass = dbPass as EntryPass;
            if (!this.passes.find((p) => p.id === pass!.id)) {
              this.passes.push(pass);
            }
          } else {
            // Check by roll number in Supabase
            const normRoll = normalizeRollNumber(cleanToken);
            const { data: dbReg } = await supabase
              .from('registrations')
              .select('*')
              .eq('normalized_roll_number', normRoll)
              .maybeSingle();

            if (dbReg) {
              if (!this.getRegistrationById(dbReg.id)) {
                this.registrations.push(dbReg as Registration);
              }
              const { data: regPass } = await supabase
                .from('entry_passes')
                .select('*')
                .eq('registration_id', dbReg.id)
                .maybeSingle();

              if (regPass) {
                pass = regPass as EntryPass;
                if (!this.passes.find((p) => p.id === pass!.id)) {
                  this.passes.push(pass);
                }
              }
            }
          }
        } catch (err) {
          console.warn('Supabase remote pass lookup notice:', err);
        }
      }

      // Case 1: Pass does not exist
      if (!pass) {
        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'INVALID_PASS',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: 'TOKEN_NOT_FOUND',
        });
        this.persist();

        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.from('entry_scans').insert({
              event_id: this.event.id,
              staff_user_id: staffUserId,
              scan_result: 'INVALID_PASS',
              request_id: requestId,
              reason_code: 'TOKEN_NOT_FOUND',
            });
          } catch (e) {
            console.warn('Supabase log invalid scan notice:', e);
          }
        }

        return {
          success: false,
          status: 'INVALID_PASS',
          message: 'ENTRY DENIED — INVALID PASS',
        };
      }

      let reg = this.getRegistrationById(pass.registration_id);
      if (!reg && isSupabaseConfigured && supabase) {
        try {
          const { data: dbReg } = await supabase
            .from('registrations')
            .select('*')
            .eq('id', pass.registration_id)
            .maybeSingle();

          if (dbReg) {
            reg = dbReg as Registration;
            if (!this.getRegistrationById(reg.id)) {
              this.registrations.push(reg);
            }
          }
        } catch (err) {
          console.warn('Supabase remote reg lookup notice:', err);
        }
      }

      if (!reg) {
        return {
          success: false,
          status: 'INVALID_PASS',
          message: 'ENTRY DENIED — INVALID PASS (NO REGISTRATION)',
        };
      }

      // Case 2: ALREADY USED
      if (pass.status === 'USED') {
        const prevStaff = this.profiles.find((p) => p.id === pass.redeemed_by);

        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'ALREADY_USED',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: 'PREVIOUSLY_REDEEMED',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
        });
        this.persist();

        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.from('entry_scans').insert({
              event_id: this.event.id,
              pass_id: pass.id,
              staff_user_id: staffUserId,
              scan_result: 'ALREADY_USED',
              request_id: requestId,
              reason_code: 'PREVIOUSLY_REDEEMED',
            });
          } catch (e) {
            console.warn('Supabase log duplicate scan notice:', e);
          }
        }

        return {
          success: false,
          status: 'ALREADY_USED',
          message: 'ENTRY DENIED — QR CODE ALREADY USED',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          previous_scan_at: pass.redeemed_at,
          previous_staff_name: prevStaff?.display_name || pass.redeemed_by_name || 'Staff Member',
        };
      }

      // Case 3: CANCELLED OR REVOKED
      if (pass.status === 'REVOKED' || pass.status === 'CANCELLED' || reg.cancelled_at) {
        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'PASS_CANCELLED',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: `PASS_${pass.status}`,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
        });
        this.persist();

        return {
          success: false,
          status: 'PASS_CANCELLED',
          message: 'ENTRY DENIED — PASS CANCELLED',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
        };
      }

      // Case 4: PAYMENT NOT VERIFIED
      if (reg.payment_status !== 'PAID') {
        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'PAYMENT_NOT_VERIFIED',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: `PAYMENT_${reg.payment_status}`,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
        });
        this.persist();

        return {
          success: false,
          status: 'PAYMENT_NOT_VERIFIED',
          message: 'ENTRY DENIED — PAYMENT NOT VERIFIED',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
        };
      }

      // Case 5: ENTRY APPROVED — ATOMIC ONE-TIME REDEMPTION
      const now = new Date().toISOString();
      pass.status = 'USED';
      pass.redeemed_at = now;
      pass.redeemed_by = staffUserId;
      pass.redeemed_by_name = staff.display_name;

      this.scans.unshift({
        id: `scan-${Date.now()}`,
        event_id: this.event.id,
        pass_id: pass.id,
        staff_user_id: staffUserId,
        staff_name: staff.display_name,
        scan_result: 'ENTRY_APPROVED',
        scanned_at: now,
        request_id: requestId,
        student_name: reg.full_name,
        roll_number: reg.normalized_roll_number,
      });

      this.persist();

      // Cloud sync to Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('entry_passes').update({
            status: 'USED',
            redeemed_at: now,
            updated_at: now,
          }).eq('id', pass.id);

          await supabase.from('entry_scans').insert({
            event_id: this.event.id,
            pass_id: pass.id,
            staff_user_id: staffUserId,
            scan_result: 'ENTRY_APPROVED',
            request_id: requestId,
          });
        } catch (e) {
          console.warn('Supabase scan sync exception:', e);
        }
      }

      return {
        success: true,
        status: 'ENTRY_APPROVED',
        message: 'ENTRY APPROVED — VALID FOR THIS ENTRY',
        student_name: reg.full_name,
        roll_number: reg.normalized_roll_number,
        academic_year: reg.academic_year,
        food_preference: reg.food_preference,
        scanned_at: now,
      };
    } finally {
      releaseLock();
    }
  }

  // --- REPORTING & METRICS ---

  public getDashboardMetrics(): DashboardMetrics {
    const totalRegistrations = this.registrations.length;
    const paidRegistrations = this.registrations.filter((r) => r.payment_status === 'PAID').length;
    const pendingVerifications = this.payments.filter((p) => p.status === 'PENDING').length;
    const failedOrRejected = this.registrations.filter(
      (r) => r.payment_status === 'FAILED' || r.payment_status === 'REJECTED'
    ).length;

    const validPassesIssued = this.passes.filter((p) => p.status === 'VALID' || p.status === 'USED').length;
    const totalEntries = this.passes.filter((p) => p.status === 'USED').length;
    const notCheckedIn = this.passes.filter((p) => p.status === 'VALID').length;

    // Filter by paid for food and academic counts
    const paidList = this.registrations.filter((r) => r.payment_status === 'PAID' && !r.cancelled_at);
    const fyCount = paidList.filter((r) => r.academic_year.startsWith('FY')).length;
    const syCount = paidList.filter((r) => r.academic_year.startsWith('SY')).length;
    const regularFoodCount = paidList.filter((r) => r.food_preference === 'Regular').length;
    const jainFoodCount = paidList.filter((r) => r.food_preference === 'Jain').length;
    const cancelledCount = this.registrations.filter((r) => !!r.cancelled_at).length;

    const totalRevenueMinorUnits = paidList.reduce((sum, r) => sum + r.expected_amount_minor_units, 0);

    return {
      totalRegistrations,
      paidRegistrations,
      pendingVerifications,
      failedOrRejected,
      validPassesIssued,
      totalEntries,
      notCheckedIn,
      fyCount,
      syCount,
      regularFoodCount,
      jainFoodCount,
      cancelledCount,
      totalRevenueMinorUnits,
    };
  }

  public getAllRegistrations(): Array<Registration & { payment?: PaymentRecord; pass?: EntryPass }> {
    return this.registrations.map((reg) => {
      const payment = this.getPaymentForRegistration(reg.id);
      const pass = this.passes.find((p) => p.registration_id === reg.id);
      return { ...reg, payment, pass };
    });
  }

  public getPendingPaymentsQueue(): Array<PaymentRecord & { registration?: Registration }> {
    return this.payments
      .filter((p) => p.status === 'PENDING')
      .map((p) => {
        const registration = this.getRegistrationById(p.registration_id);
        return { ...p, registration };
      });
  }

  public getScansList(staffId?: string): EntryScanLog[] {
    if (staffId) {
      return this.scans.filter((s) => s.staff_user_id === staffId);
    }
    return [...this.scans];
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  private addAuditLog(
    actorId: string | undefined,
    action: string,
    targetType: string,
    targetId?: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ) {
    const actor = this.profiles.find((p) => p.id === actorId);
    this.auditLogs.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actor_user_id: actorId,
      actor_name: actor?.display_name || 'System / Admin',
      event_id: this.event.id,
      action,
      target_type: targetType,
      target_id: targetId,
      reason,
      metadata,
      created_at: new Date().toISOString(),
    });
  }

  public async uploadPaymentScreenshot(
    file: File | Blob,
    registrationId: string
  ): Promise<string> {
    if (isSupabaseConfigured && supabase) {
      try {
        const fileExt = file instanceof File ? file.name.split('.').pop() : 'jpg';
        const fileName = `${registrationId}-${Date.now()}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('payment-screenshots')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (!error && data) {
          const { data: pubData } = supabase.storage
            .from('payment-screenshots')
            .getPublicUrl(fileName);
          if (pubData?.publicUrl) {
            return pubData.publicUrl;
          }
        } else if (error) {
          console.warn('Supabase storage upload error:', error.message);
        }
      } catch (err) {
        console.warn('Supabase upload exception, fallback to data URL:', err);
      }
    }

    // High reliability offline / local fallback: convert File/Blob to Base64 data URL
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to encode screenshot'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading screenshot file'));
      reader.readAsDataURL(file);
    });
  }

  public async initSupabase() {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      // 1. Fetch Event Settings from Supabase
      const { data: eventData } = await supabase.from('events').select('*').limit(1).maybeSingle();
      if (eventData) {
        this.event = {
          ...this.event,
          id: eventData.id || this.event.id,
          name: eventData.name || this.event.name,
          college_name: eventData.college_name || this.event.college_name,
          registration_fee_minor_units: 30000,
          currency: eventData.currency || this.event.currency,
          maximum_capacity: eventData.maximum_capacity || this.event.maximum_capacity,
          registration_enabled: eventData.registration_enabled !== undefined ? eventData.registration_enabled : this.event.registration_enabled,
          payment_upi_id: eventData.payment_upi_id || this.event.payment_upi_id,
          payment_upi_name: eventData.payment_upi_name || this.event.payment_upi_name,
        };
        if (eventData.registration_fee_minor_units !== 30000) {
          await supabase.from('events').update({ registration_fee_minor_units: 30000 }).eq('id', this.event.id);
        }
        this.persist();
      }

      // 2. Fetch Registrations from Supabase and sync
      const { data: regRows } = await supabase.from('registrations').select('*');
      if (regRows && regRows.length > 0) {
        for (const row of regRows) {
          const idx = this.registrations.findIndex((r) => r.id === row.id);
          const mappedReg: Registration = {
            id: row.id,
            event_id: row.event_id,
            full_name: row.full_name,
            academic_year: row.academic_year,
            food_preference: row.food_preference,
            contact_number: row.contact_number,
            normalized_roll_number: row.normalized_roll_number,
            consent_agreed: row.consent_agreed ?? true,
            payment_status: row.payment_status || 'PENDING',
            expected_amount_minor_units: 30000,
            currency: row.currency || 'INR',
            performance_talent: row.performance_talent || undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
          if (idx >= 0) {
            this.registrations[idx] = { ...this.registrations[idx], ...mappedReg };
          } else {
            this.registrations.push(mappedReg);
          }
        }
        this.persist();
      }

      // 3. Fetch Payments from Supabase and sync
      const { data: payRows } = await supabase.from('payments').select('*');
      if (payRows && payRows.length > 0) {
        for (const row of payRows) {
          const idx = this.payments.findIndex((p) => p.id === row.id);
          const mappedPay: PaymentRecord = {
            id: row.id,
            registration_id: row.registration_id,
            provider: row.provider || 'STATIC_UPI',
            provider_order_id: row.provider_order_id || undefined,
            provider_payment_id: row.provider_payment_id || undefined,
            transaction_reference: row.transaction_reference || undefined,
            screenshot_url: row.screenshot_url || undefined,
            expected_amount_minor_units: 30000,
            currency: row.currency || 'INR',
            status: row.status || 'PENDING',
            verification_method: row.verification_method || 'MANUAL_ADMIN',
            verified_by: row.verified_by || undefined,
            verified_by_name: row.verified_by_name || undefined,
            verified_at: row.verified_at || undefined,
            rejection_reason: row.rejection_reason || undefined,
            admin_notes: row.admin_notes || undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
          if (idx >= 0) {
            this.payments[idx] = { ...this.payments[idx], ...mappedPay };
          } else {
            this.payments.push(mappedPay);
          }
        }
        this.persist();
      }

      // 4. Fetch Entry Passes from Supabase
      const { data: passRows } = await supabase.from('entry_passes').select('*');
      if (passRows && passRows.length > 0) {
        for (const row of passRows) {
          const idx = this.passes.findIndex((p) => p.id === row.id);
          const mappedPass: EntryPass = {
            id: row.id,
            registration_id: row.registration_id,
            token_hash: row.token_hash,
            status: row.status || 'VALID',
            issued_at: row.issued_at,
            redeemed_at: row.redeemed_at || undefined,
            redeemed_by: row.redeemed_by || undefined,
            revoked_at: row.revoked_at || undefined,
            replacement_of_pass_id: row.replacement_of_pass_id || undefined,
          };
          if (idx >= 0) {
            this.passes[idx] = { ...this.passes[idx], ...mappedPass };
          } else {
            this.passes.push(mappedPass);
          }
        }
        this.persist();
      }

      // 5. Fetch Scans from Supabase
      const { data: scanRows } = await supabase.from('entry_scans').select('*');
      if (scanRows && scanRows.length > 0) {
        for (const row of scanRows) {
          if (!this.scans.find((s) => s.id === row.id)) {
            this.scans.push({
              id: row.id,
              event_id: row.event_id,
              pass_id: row.pass_id || undefined,
              staff_user_id: row.staff_user_id,
              staff_name: 'Staff Scanner',
              scan_result: row.scan_result,
              scanned_at: row.created_at || row.scanned_at || new Date().toISOString(),
              request_id: row.request_id || undefined,
            });
          }
        }
        this.persist();
      }
    } catch (err) {
      console.warn('Supabase initial sync notice:', err);
    }
  }
}

// Singleton Data Service instance
export const dataService = new PreDiwaliDataStore();
