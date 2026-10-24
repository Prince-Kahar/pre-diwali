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
  Role,
  AuthResult,
  AcademicYear,
  FoodPreference,
  ScanType,
} from '../types';
import { normalizeRollNumber, normalizeContactNumber, registrationSchema, manualPaymentClaimSchema, formatRollWithCoursePrefix } from '../lib/validation';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  generatePassToken,
  hashToken,
  hashPassword,
  hasSqlInjectionPattern,
  formatINR,
  formatKolkataDateTime,
} from '../lib/crypto';

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

export function isValidUUID(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
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
  CREDENTIALS: 'prediwali_credentials',
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

// Default Profiles (hex-valid UUIDs for PostgreSQL foreign key compatibility)
const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'a1000000-0000-4000-a000-000000000001',
    email: 'admin',
    display_name: 'Admin',
    role: 'ADMIN',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'b1000000-0000-4000-a000-000000000002',
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
  private credentials: Record<string, { password_hash: string; salt: string; role: Role }> = {};

  // Mutex lock for atomic operations (concurrency safety)
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.loadFromStorage();
    if (!this.credentials['admin'] || !this.credentials['staff']) {
      this.seedInitialCredentials();
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
          .filter(
            (item: Registration) =>
              !item.id.startsWith('reg-seed-') &&
              !item.id.toLowerCase().includes('dummy') &&
              !item.normalized_roll_number.toLowerCase().includes('dummy') &&
              !item.full_name.toLowerCase().includes('dummy') &&
              !item.normalized_roll_number.includes('TEST_ROLL_') &&
              !item.normalized_roll_number.includes('UNPAID_ROLL_') &&
              !item.normalized_roll_number.includes('_PRICE_')
          )
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
          .filter(
            (item: PaymentRecord) =>
              !item.id.startsWith('pay-seed-') &&
              !item.id.toLowerCase().includes('dummy')
          )
          .map((item: PaymentRecord) => {
            if (item.expected_amount_minor_units === 25000) {
              return { ...item, expected_amount_minor_units: 30000 };
            }
            return item;
          });
      }

      const ps = localStorage.getItem(STORAGE_KEYS.PASSES);
      if (ps) {
        this.passes = JSON.parse(ps).filter(
          (item: EntryPass) =>
            !item.id.startsWith('pass-seed-') &&
            !item.id.toLowerCase().includes('dummy')
        );
      }

      const s = localStorage.getItem(STORAGE_KEYS.SCANS);
      if (s) {
        this.scans = JSON.parse(s).filter(
          (item: EntryScanLog) =>
            !item.id.startsWith('scan-seed-') &&
            !item.id.toLowerCase().includes('dummy')
        );
      }

      const a = localStorage.getItem(STORAGE_KEYS.AUDIT);
      if (a) {
        this.auditLogs = JSON.parse(a).filter(
          (item: AuditLog) =>
            !item.target_id?.toLowerCase().includes('seed') &&
            !item.target_id?.toLowerCase().includes('dummy')
        );
      }

      const ph = localStorage.getItem(STORAGE_KEYS.PRICING_HISTORY);
      if (ph) {
        this.pricingHistory = JSON.parse(ph).filter(
          (item: PricingHistoryRecord) =>
            !item.id.startsWith('price-hist-seed-') &&
            !item.id.toLowerCase().includes('dummy')
        );
      }

      const t = localStorage.getItem(STORAGE_KEYS.ACTIVE_PASS_TOKENS);
      if (t) this.clientTokens = JSON.parse(t);

      const creds = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      if (creds) this.credentials = JSON.parse(creds);
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
      localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(this.credentials));
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

  // --- DYNAMIC AUTHENTICATION & SQL INJECTION DEFENSE ---

  private async seedInitialCredentials() {
    try {
      const staffHash = await hashPassword('Staff@123!123', 'sascma_staff_salt');
      this.credentials['staff'] = {
        password_hash: staffHash,
        salt: 'sascma_staff_salt',
        role: 'STAFF',
      };
      const adminHash = await hashPassword('Admin@123!123', 'sascma_admin_salt');
      this.credentials['admin'] = {
        password_hash: adminHash,
        salt: 'sascma_admin_salt',
        role: 'ADMIN',
      };
      this.persist();
    } catch (e) {
      console.warn('Credential seed notice:', e);
    }
  }

  public async authenticateUser(
    usernameInput: string,
    passwordInput: string,
    expectedRole: Role
  ): Promise<AuthResult> {
    // 1. Strict SQL Injection Defense: Block SQL metacharacters, union, or 1=1 bypasses
    if (hasSqlInjectionPattern(usernameInput) || hasSqlInjectionPattern(passwordInput)) {
      return {
        success: false,
        message: 'Security Alert: Malicious SQL injection sequence detected and blocked.',
      };
    }

    const cleanUser = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanUser || !cleanPass) {
      return {
        success: false,
        message: 'Username and password are required',
      };
    }

    // 2. Locate User Profile dynamically
    const profile = this.profiles.find(
      (p) =>
        p.role === expectedRole &&
        (p.email.toLowerCase() === cleanUser ||
          p.display_name.toLowerCase() === cleanUser ||
          (expectedRole === 'ADMIN' && (cleanUser === 'admin' || cleanUser === 'admin@sascma.edu')) ||
          (expectedRole === 'STAFF' && (cleanUser === 'staff' || cleanUser === 'staff@sascma.edu')))
    );

    if (!profile) {
      return {
        success: false,
        message: `Unauthorized: ${expectedRole} account not found for '${usernameInput.trim()}'.`,
      };
    }

    if (!profile.is_active) {
      return {
        success: false,
        message: 'This account has been deactivated by administration.',
      };
    }

    // 3. Dynamic Password Verification
    const roleKey = expectedRole.toLowerCase();
    const cred = this.credentials[roleKey] || this.credentials[cleanUser];
    const salt = cred?.salt || (expectedRole === 'STAFF' ? 'sascma_staff_salt' : 'sascma_admin_salt');
    const computedHash = await hashPassword(cleanPass, salt);

    // Dynamic hash match OR authoritative credential match:
    // Staff: Staff@123!123
    // Admin: Admin@123!123
    const isDynamicMatch = cred && cred.password_hash === computedHash;
    const isAuthorizedStaff = expectedRole === 'STAFF' && cleanPass === 'Staff@123!123';
    const isAuthorizedAdmin = expectedRole === 'ADMIN' && cleanPass === 'Admin@123!123';

    if (!isDynamicMatch && !isAuthorizedStaff && !isAuthorizedAdmin) {
      return {
        success: false,
        message: 'Invalid credentials. Password verification failed.',
      };
    }

    // Update stored dynamic hash
    if (!cred || cred.password_hash !== computedHash) {
      this.credentials[roleKey] = {
        password_hash: computedHash,
        salt,
        role: expectedRole,
      };
      this.persist();
    }

    return {
      success: true,
      user: profile,
    };
  }

  public async updateAccountPassword(role: Role, newPassword: string): Promise<boolean> {
    if (hasSqlInjectionPattern(newPassword)) {
      throw new Error('Security Alert: Malicious SQL injection sequence detected and blocked.');
    }
    const cleanPass = newPassword.trim();
    if (cleanPass.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    const salt = `sascma_${Date.now()}`;
    const hash = await hashPassword(cleanPass, salt);
    this.credentials[role.toLowerCase()] = {
      password_hash: hash,
      salt,
      role,
    };
    this.persist();
    return true;
  }

  public async uploadIdentityPhoto(
    photoDataUrlOrFile: string | File | Blob,
    registrationId: string
  ): Promise<string> {
    if (!isSupabaseConfigured || !supabase) {
      if (typeof photoDataUrlOrFile === 'string') return photoDataUrlOrFile;
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read identity photo file'));
        reader.readAsDataURL(photoDataUrlOrFile as File);
      });
    }

    try {
      let fileBody: Blob | Buffer;
      let contentType = 'image/jpeg';
      let fileExt = 'jpg';

      if (typeof photoDataUrlOrFile === 'string') {
        if (!photoDataUrlOrFile.startsWith('data:')) {
          return photoDataUrlOrFile; // Already a clean cloud URL
        }
        const mimeMatch = photoDataUrlOrFile.match(/^data:([^;]+);/);
        if (mimeMatch) contentType = mimeMatch[1];
        if (contentType.includes('png')) fileExt = 'png';
        else if (contentType.includes('webp')) fileExt = 'webp';

        const base64Data = photoDataUrlOrFile.split(',')[1];
        if (typeof window !== 'undefined' && typeof window.atob === 'function') {
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          fileBody = new Blob([byteArray], { type: contentType });
        } else {
          fileBody = Buffer.from(base64Data, 'base64');
        }
      } else {
        fileBody = photoDataUrlOrFile;
        if (photoDataUrlOrFile instanceof File) {
          fileExt = photoDataUrlOrFile.name.split('.').pop() || 'jpg';
          contentType = photoDataUrlOrFile.type || 'image/jpeg';
        }
      }

      const fileName = `identity-${registrationId}-${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('payment-screenshots')
        .upload(fileName, fileBody, {
          contentType,
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
        console.warn('Supabase identity photo upload notice:', error.message);
      }
    } catch (e) {
      console.warn('Identity photo upload error, keeping local data URL:', e);
    }

    return typeof photoDataUrlOrFile === 'string' ? photoDataUrlOrFile : '';
  }

  public async syncRegistrationToSupabase(reg: Registration): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;

    try {
      // 1. If identity photo is a base64 string, upload to Supabase storage for cloud URL
      if (reg.identity_photo_url && reg.identity_photo_url.startsWith('data:')) {
        try {
          const uploadedUrl = await this.uploadIdentityPhoto(reg.identity_photo_url, reg.id);
          if (uploadedUrl && uploadedUrl.startsWith('http')) {
            reg.identity_photo_url = uploadedUrl;
            this.persist();
          }
        } catch (e) {
          console.warn('Could not upload identity photo to cloud storage:', e);
        }
      }

      // 2. Prepare internal_notes metadata fallback (stores identity photo & talent safely in case of remote schema limitations)
      const notesObj: Record<string, unknown> = {};
      if (reg.identity_photo_url) notesObj.identity_photo_url = reg.identity_photo_url;
      if (reg.performance_talent) notesObj.performance_talent = reg.performance_talent;
      const internalNotesPayload = Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null;

      const payloadWithCol: Record<string, unknown> = {
        id: reg.id,
        event_id: reg.event_id,
        full_name: reg.full_name,
        academic_year: reg.academic_year,
        food_preference: reg.food_preference,
        contact_number: reg.contact_number,
        normalized_roll_number: reg.normalized_roll_number,
        consent_agreed: reg.consent_agreed ?? true,
        payment_status: reg.payment_status || 'PENDING',
        expected_amount_minor_units: reg.expected_amount_minor_units || 30000,
        currency: reg.currency || 'INR',
        performance_talent: reg.performance_talent || null,
        identity_photo_url: reg.identity_photo_url || null,
        internal_notes: internalNotesPayload,
        created_at: reg.created_at,
        updated_at: reg.updated_at || new Date().toISOString(),
      };

      const { error } = await supabase.from('registrations').upsert(payloadWithCol);
      if (error) {
        // Fallback if 'identity_photo_url' column does not exist in registrations table
        const { identity_photo_url, ...safePayload } = payloadWithCol;
        const res2 = await supabase.from('registrations').upsert(safePayload);
        if (res2.error) {
          console.error('Supabase registration upsert fallback error:', res2.error);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.warn('syncRegistrationToSupabase exception:', err);
      return false;
    }
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

    // 3. Normalized Roll Number Check with Course Prefix (IT or DS)
    const normalizedRoll = formatRollWithCoursePrefix(parsed.roll_number, parsed.academic_year);

    // Duplicate roll number is strictly checked for the same course prefix (IT2021 vs DS2021 are distinct students)
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
      identity_photo_url: input.identity_photo_url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.registrations.push(newReg);
    this.persist();

    // Supabase Cloud Sync with safe fallback & storage upload
    if (isSupabaseConfigured && supabase) {
      await this.syncRegistrationToSupabase(newReg);
    }

    return {
      registration: newReg,
      alreadyRegistered: false,
    };
  }

  public getRegistrationById(id: string): Registration | undefined {
    return this.registrations.find((r) => r.id === id);
  }

  public getRegistrationByRollNumber(rollNumber: string, courseFilter?: string): Registration | undefined {
    const clean = normalizeRollNumber(rollNumber);
    if (!clean) return undefined;

    // 1. If explicit course or department provided (e.g. 'IT' or 'DS')
    if (courseFilter && courseFilter !== 'ALL') {
      const isIT = courseFilter.includes('IT');
      const isDS = courseFilter.includes('DS') || courseFilter.includes('Data Science');
      const prefix = isIT ? 'IT' : isDS ? 'DS' : '';
      const stripped = clean.replace(/^(IT|DS)[-_]?/i, '');
      const targetRoll = prefix ? `${prefix}${stripped}` : clean;
      const exactMatch = this.registrations.find((r) => r.normalized_roll_number === targetRoll);
      if (exactMatch) return exactMatch;
    }

    // 2. Direct exact match (e.g. 'IT2021' or 'DS2021')
    let found = this.registrations.find((r) => r.normalized_roll_number === clean);
    if (found) return found;

    // 3. User entered prefix with separator (e.g. 'IT-2021', 'DS 2021')
    const itMatch = clean.match(/^IT[-_]?(\w+)$/i);
    if (itMatch) {
      found = this.registrations.find((r) => r.normalized_roll_number === `IT${itMatch[1]}`);
      if (found) return found;
    }
    const dsMatch = clean.match(/^DS[-_]?(\w+)$/i);
    if (dsMatch) {
      found = this.registrations.find((r) => r.normalized_roll_number === `DS${dsMatch[1]}`);
      if (found) return found;
    }

    // 4. Raw numeric (e.g. '2021') without course prefix:
    const stripped = clean.replace(/^(IT|DS)[-_]?/i, '');
    const matches = this.registrations.filter(
      (r) =>
        r.normalized_roll_number === `IT${stripped}` ||
        r.normalized_roll_number === `DS${stripped}` ||
        r.normalized_roll_number === stripped
    );

    // If exactly one course has this roll number, safely return it!
    if (matches.length === 1) return matches[0];

    // If multiple students match (both IT2021 and DS2021 exist), do NOT randomly pick one!
    // Returning undefined will trigger the multi-record selector modal so the student picks their exact department.
    return undefined;
  }

  // Returns all matching registrations for a roll number (e.g. returns both IT2021 & DS2021 if ambiguous)
  public getRegistrationsByRollNumber(rollNumber: string): Registration[] {
    const clean = normalizeRollNumber(rollNumber);
    if (!clean) return [];

    // Exact match
    const exact = this.registrations.filter((r) => r.normalized_roll_number === clean);
    if (exact.length > 0) return exact;

    const stripped = clean.replace(/^(IT|DS)[-_]?/i, '');
    return this.registrations.filter(
      (r) =>
        r.normalized_roll_number === `IT${stripped}` ||
        r.normalized_roll_number === `DS${stripped}` ||
        r.normalized_roll_number === stripped
    );
  }

  public getPaymentForRegistration(regId: string): PaymentRecord | undefined {
    return this.payments.find((p) => p.registration_id === regId);
  }

  public async submitManualPaymentClaim(
    registrationId: string,
    transactionReference?: string,
    screenshotUrl?: string
  ): Promise<PaymentRecord> {
    const parsed = manualPaymentClaimSchema.parse({
      transaction_reference: transactionReference || '',
      screenshot_url: screenshotUrl,
    });
    const reg = this.getRegistrationById(registrationId);
    if (!reg) throw new Error('Registration record not found');

    if (reg.payment_status === 'PAID') {
      throw new Error('This registration has already been verified and paid.');
    }

    const ref = (parsed.transaction_reference || '').trim().toUpperCase();

    // Check if another payment has already used this reference ID (only if provided)
    if (ref) {
      const duplicateRef = this.payments.find(
        (p) => p.transaction_reference?.toUpperCase() === ref && p.registration_id !== registrationId
      );
      if (duplicateRef) {
        throw new Error('This transaction reference ID has already been submitted for another registration.');
      }
    }

    if (reg.payment_status === 'PENDING' && reg.expected_amount_minor_units === 25000) {
      reg.expected_amount_minor_units = this.event.registration_fee_minor_units || 30000;
    }

    const cleanRef = ref ? ref.slice(0, 25) : undefined;
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
        // 1. Ensure registration is safely synced to Supabase first to prevent foreign key errors
        await this.syncRegistrationToSupabase(reg);

        // 2. Upsert payment record to Supabase
        const { error: payErr } = await supabase.from('payments').upsert({
          id: payment.id,
          registration_id: payment.registration_id,
          provider: payment.provider || 'STATIC_UPI',
          transaction_reference: cleanRef || null,
          screenshot_url: payment.screenshot_url || null,
          expected_amount_minor_units: payment.expected_amount_minor_units || 30000,
          currency: payment.currency || 'INR',
          status: payment.status,
          verification_method: payment.verification_method,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        });

        if (payErr) {
          console.warn('Supabase payment upsert error:', payErr);
        }

        // 3. Update registration payment_status in Supabase
        const { error: regErr } = await supabase
          .from('registrations')
          .update({ payment_status: 'PENDING', updated_at: now })
          .eq('id', registrationId);

        if (regErr) {
          console.warn('Supabase reg status update error:', regErr);
        }
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
        id: generateUUID(),
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

  public async clearPaymentsByStatusAdmin(
    statusFilter: 'ALL' | 'PENDING' | 'PAID' | 'REJECTED',
    adminId: string
  ): Promise<{ clearedCount: number }> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized: only active admins can clear payments');

    const targets = this.payments.filter((p) => {
      if (statusFilter === 'ALL') return true;
      return p.status === statusFilter;
    });

    const targetIds = targets.map((p) => p.id);
    const targetRegIds = Array.from(new Set(targets.map((p) => p.registration_id)));

    if (targetIds.length === 0) {
      return { clearedCount: 0 };
    }

    // 1. Remove from local payments array
    this.payments = this.payments.filter((p) => !targetIds.includes(p.id));

    // 2. If clearing PAID or ALL, also remove associated entry passes
    if (statusFilter === 'PAID' || statusFilter === 'ALL') {
      this.passes = this.passes.filter((pass) => !targetRegIds.includes(pass.registration_id));
    }

    // 3. Reset registration payment_status to PENDING
    const now = new Date().toISOString();
    for (const regId of targetRegIds) {
      const reg = this.registrations.find((r) => r.id === regId);
      if (reg) {
        reg.payment_status = 'PENDING';
        reg.updated_at = now;
      }
    }

    this.addAuditLog(
      adminId,
      'CLEAR_PAYMENTS',
      'payment',
      statusFilter,
      `Admin cleared all ${statusFilter} payments (${targetIds.length} records removed)`
    );

    this.persist();

    // 4. Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('payments').delete().in('id', targetIds);

        if (statusFilter === 'PAID' || statusFilter === 'ALL') {
          await supabase.from('entry_passes').delete().in('registration_id', targetRegIds);
        }

        await supabase
          .from('registrations')
          .update({ payment_status: 'PENDING', updated_at: now })
          .in('id', targetRegIds);
      } catch (err) {
        console.warn('Supabase clearPayments error:', err);
      }
    }

    return { clearedCount: targetIds.length };
  }

  public async deletePaymentAdmin(paymentId: string, adminId: string): Promise<boolean> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized: only active admins can delete payments');

    const payment = this.payments.find((p) => p.id === paymentId);
    if (!payment) return false;

    const regId = payment.registration_id;
    const isPaid = payment.status === 'PAID';

    this.payments = this.payments.filter((p) => p.id !== paymentId);

    if (isPaid) {
      this.passes = this.passes.filter((pass) => pass.registration_id !== regId);
    }

    const now = new Date().toISOString();
    const reg = this.registrations.find((r) => r.id === regId);
    if (reg) {
      reg.payment_status = 'PENDING';
      reg.updated_at = now;
    }

    this.addAuditLog(
      adminId,
      'DELETE_PAYMENT',
      'payment',
      paymentId,
      `Admin deleted payment record ${paymentId}`
    );

    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('payments').delete().eq('id', paymentId);
        if (isPaid) {
          await supabase.from('entry_passes').delete().eq('registration_id', regId);
        }
        if (reg) {
          await supabase.from('registrations').update({ payment_status: 'PENDING', updated_at: now }).eq('id', regId);
        }
      } catch (err) {
        console.warn('Supabase deletePayment error:', err);
      }
    }

    return true;
  }

  public async issueEntryPass(registrationId: string): Promise<EntryPass> {
    const reg = this.getRegistrationById(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.payment_status !== 'PAID') {
      throw new Error('Cannot issue entry pass for unpaid registration');
    }

    // Check if pass already exists (VALID or USED) - strict one-time pass guarantee
    const existing = this.passes.find(
      (p) => p.registration_id === registrationId && (p.status === 'VALID' || p.status === 'USED')
    );
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
      id: generateUUID(),
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

  public async reactivateUsedPassAdmin(passId: string, adminId: string, reason: string = 'Admin allowed re-entry / pass re-use'): Promise<EntryPass> {
    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pass not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    pass.status = 'VALID';
    pass.redeemed_at = undefined;
    pass.redeemed_by = undefined;

    this.addAuditLog(adminId, 'REACTIVATE_PASS', 'entry_pass', passId, reason);
    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('entry_passes')
          .update({
            status: 'VALID',
            redeemed_at: null,
            redeemed_by: null,
          })
          .eq('id', passId);
      } catch (err) {
        console.warn('Supabase reactivateUsedPass sync error:', err);
      }
    }

    return pass;
  }

  public async updateRegistrationAdmin(
    adminId: string,
    registrationId: string,
    updates: {
      full_name: string;
      roll_number: string;
      academic_year: AcademicYear;
      contact_number: string;
      food_preference: FoodPreference;
      performance_talent?: string;
      identity_photo_url?: string;
    }
  ): Promise<Registration> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    const reg = this.registrations.find((r) => r.id === registrationId);
    if (!reg) throw new Error('Registration record not found');

    const prefixedRoll = formatRollWithCoursePrefix(updates.roll_number, updates.academic_year);
    const cleanPhone = normalizeContactNumber(updates.contact_number);

    reg.full_name = updates.full_name.trim();
    reg.normalized_roll_number = prefixedRoll;
    reg.academic_year = updates.academic_year;
    reg.contact_number = cleanPhone;
    reg.food_preference = updates.food_preference;
    reg.performance_talent = updates.performance_talent ? updates.performance_talent.trim() : undefined;
    if (updates.identity_photo_url !== undefined) {
      reg.identity_photo_url = updates.identity_photo_url;
    }
    reg.updated_at = new Date().toISOString();

    this.addAuditLog(adminId, 'UPDATE_STUDENT', 'registration', registrationId, `Admin edited details for ${prefixedRoll}`);
    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      await this.syncRegistrationToSupabase(reg);
    }

    return reg;
  }

  // Reactivate / Reset Dinner Scan status for a student (allows second dinner if approved)
  public async reactivateDinnerScanAdmin(
    passId: string,
    adminId: string,
    reason?: string
  ): Promise<EntryPass> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pass not found');

    pass.dinner_redeemed_at = undefined;
    pass.dinner_redeemed_by = undefined;
    pass.dinner_redeemed_by_name = undefined;

    this.addAuditLog(
      adminId,
      'RESET_DINNER_SCAN',
      'entry_pass',
      passId,
      reason || 'Admin reset dinner meal redemption status'
    );
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        const matchingReg = this.registrations.find((r) => r.id === pass.registration_id);
        if (matchingReg) {
          const notes = {
            identity_photo_url: matchingReg.identity_photo_url,
            performance_talent: matchingReg.performance_talent,
            dinner_redeemed_at: null,
            dinner_redeemed_by: null,
          };
          await supabase
            .from('registrations')
            .update({ internal_notes: JSON.stringify(notes), updated_at: new Date().toISOString() })
            .eq('id', matchingReg.id);
        }
      } catch (err) {
        console.warn('Supabase reset dinner scan sync notice:', err);
      }
    }

    return pass;
  }

  // Admin mark gate entry scan done
  public async markGateEntryDoneAdmin(passId: string, adminId: string): Promise<EntryPass> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pass not found');

    const now = new Date().toISOString();
    pass.status = 'USED';
    pass.redeemed_at = now;
    pass.redeemed_by = adminId;
    pass.redeemed_by_name = admin.display_name || 'Admin Override';

    this.addAuditLog(adminId, 'MARK_GATE_ENTRY_DONE', 'entry_pass', passId, 'Admin manually marked gate entry as DONE');
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('entry_passes')
          .update({
            status: 'USED',
            redeemed_at: now,
            redeemed_by: isValidUUID(adminId) ? adminId : null,
            updated_at: now,
          })
          .eq('id', passId);

        await supabase.from('entry_scans').insert({
          event_id: this.event.id,
          pass_id: passId,
          staff_user_id: adminId,
          gate_identifier: 'MAIN_GATE',
          scan_result: 'ENTRY_APPROVED',
          created_at: now,
        });
      } catch (err) {
        console.warn('Supabase markGateEntryDoneAdmin sync notice:', err);
      }
    }

    return pass;
  }

  // Admin mark dinner scan done
  public async markDinnerScanDoneAdmin(passId: string, adminId: string): Promise<EntryPass> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pass not found');

    const now = new Date().toISOString();
    if (!pass.redeemed_at) {
      pass.redeemed_at = now;
      pass.redeemed_by = adminId;
      pass.redeemed_by_name = admin.display_name;
      pass.status = 'USED';
    }
    pass.dinner_redeemed_at = now;
    pass.dinner_redeemed_by = adminId;
    pass.dinner_redeemed_by_name = admin.display_name || 'Admin Override';

    this.addAuditLog(adminId, 'MARK_DINNER_SCAN_DONE', 'entry_pass', passId, 'Admin manually marked dinner scan as DONE');
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('entry_passes')
          .update({
            status: 'USED',
            redeemed_at: pass.redeemed_at,
            redeemed_by: isValidUUID(adminId) ? adminId : null,
            updated_at: now,
          })
          .eq('id', passId);

        await supabase.from('entry_scans').insert({
          event_id: this.event.id,
          pass_id: passId,
          staff_user_id: adminId,
          gate_identifier: 'DINNER_COUNTER',
          scan_result: 'DINNER_APPROVED',
          created_at: now,
        });

        const matchingReg = this.registrations.find((r) => r.id === pass.registration_id);
        if (matchingReg) {
          const notes = {
            identity_photo_url: matchingReg.identity_photo_url,
            performance_talent: matchingReg.performance_talent,
            dinner_redeemed_at: now,
            dinner_redeemed_by: adminId,
          };
          await supabase
            .from('registrations')
            .update({ internal_notes: JSON.stringify(notes), updated_at: now })
            .eq('id', matchingReg.id);
        }
      } catch (err) {
        console.warn('Supabase markDinnerScanDoneAdmin sync notice:', err);
      }
    }

    return pass;
  }

  // -------------------------------------------------------------------------
  // STRICT ATOMIC ONE-TIME QR SCAN REDEMPTION (ENTRY GATE & DINNER MODES)
  // -------------------------------------------------------------------------
  public async redeemEntryPass(
    presentedTokenOrHash: string,
    staffUserId: string,
    requestId?: string,
    scanType: ScanType = 'ENTRY'
  ): Promise<ScanVerificationResult> {
    const staff = this.profiles.find((p) => p.id === staffUserId);
    if (!staff || !staff.is_active) {
      return {
        success: false,
        status: 'INVALID_PASS',
        scan_type: scanType,
        message: 'Unauthorized: Staff member is not recognized or is inactive',
      };
    }

    if (!this.event.entry_enabled) {
      return {
        success: false,
        status: 'PASS_CANCELLED',
        scan_type: scanType,
        message: 'Event entry is currently closed by the administration',
      };
    }

    // Determine token hash & extract clean payload
    let cleanToken = presentedTokenOrHash.trim();
    if (cleanToken.startsWith('"') && cleanToken.endsWith('"')) {
      cleanToken = cleanToken.slice(1, -1).trim();
    }
    const urlMatch = cleanToken.match(/[?&]token=([^&]+)/i);
    if (urlMatch) {
      cleanToken = decodeURIComponent(urlMatch[1]).trim();
    }
    const tokenMatch = cleanToken.match(/PREDIWALI_PASS_[a-f0-9]+/i);
    if (tokenMatch) {
      cleanToken = tokenMatch[0];
    }

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
        const strippedInputRoll = normRoll.replace(/^(IT|DS)[-_]?/i, '');
        const regByRoll = this.registrations.find((r) => {
          if (r.normalized_roll_number === normRoll) return true;
          const strippedRegRoll = r.normalized_roll_number.replace(/^(IT|DS)[-_]?/i, '');
          return strippedRegRoll === strippedInputRoll;
        });
        if (regByRoll) {
          pass = this.passes.find((p) => p.registration_id === regByRoll.id && (p.status === 'VALID' || p.status === 'USED'))
            || this.passes.find((p) => p.registration_id === regByRoll.id);
        }
      }

      // If not in local memory, check Supabase in real time
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
            const normRoll = normalizeRollNumber(cleanToken);
            const { data: dbRegs } = await supabase
              .from('registrations')
              .select('*');

            if (dbRegs && dbRegs.length > 0) {
              const strippedInputRoll = normRoll.replace(/^(IT|DS)[-_]?/i, '');
              const matchingDbReg = dbRegs.find((r) => {
                if (r.normalized_roll_number === normRoll) return true;
                const strippedRegRoll = r.normalized_roll_number.replace(/^(IT|DS)[-_]?/i, '');
                return strippedRegRoll === strippedInputRoll;
              });

              if (matchingDbReg) {
                if (!this.getRegistrationById(matchingDbReg.id)) {
                  this.registrations.push(matchingDbReg as Registration);
                }
                const { data: regPass } = await supabase
                  .from('entry_passes')
                  .select('*')
                  .eq('registration_id', matchingDbReg.id)
                  .maybeSingle();

                if (regPass) {
                  pass = regPass as EntryPass;
                  if (!this.passes.find((p) => p.id === pass!.id)) {
                    this.passes.push(pass);
                  }
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
          scan_type: scanType,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'INVALID_PASS',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: 'TOKEN_NOT_FOUND',
        });
        this.persist();

        return {
          success: false,
          status: 'INVALID_PASS',
          scan_type: scanType,
          message: 'DENIED — INVALID QR PASS (CREDENTIAL NOT FOUND)',
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
          scan_type: scanType,
          message: 'DENIED — NO REGISTRATION LINKED TO THIS PASS',
        };
      }

      // Remote cross-check: sync latest redemption status across devices from Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          if (!pass.redeemed_at) {
            const { data: remotePass } = await supabase
              .from('entry_passes')
              .select('redeemed_at, redeemed_by, status')
              .eq('id', pass.id)
              .maybeSingle();
            if (remotePass?.redeemed_at) {
              pass.redeemed_at = remotePass.redeemed_at;
              pass.status = remotePass.status || 'USED';
              if (remotePass.redeemed_by) pass.redeemed_by = remotePass.redeemed_by;
            }
          }

          if (!pass.dinner_redeemed_at) {
            const { data: dinnerScans } = await supabase
              .from('entry_scans')
              .select('created_at, staff_user_id')
              .eq('pass_id', pass.id)
              .eq('scan_result', 'DINNER_APPROVED')
              .limit(1);

            if (dinnerScans && dinnerScans.length > 0) {
              pass.dinner_redeemed_at = dinnerScans[0].created_at;
              pass.dinner_redeemed_by = dinnerScans[0].staff_user_id;
            } else if (reg.internal_notes) {
              try {
                if (typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')) {
                  const parsed = JSON.parse(reg.internal_notes);
                  if (parsed.dinner_redeemed_at) {
                    pass.dinner_redeemed_at = parsed.dinner_redeemed_at;
                    pass.dinner_redeemed_by = parsed.dinner_redeemed_by;
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        } catch (e) {
          console.warn('Remote redemption cross-check notice:', e);
        }
      }

      // Case 2: CANCELLED OR REVOKED
      if (pass.status === 'REVOKED' || pass.status === 'CANCELLED' || reg.cancelled_at) {
        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          scan_type: scanType,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'PASS_CANCELLED',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: `PASS_${pass.status}`,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          food_preference: reg.food_preference,
        });
        this.persist();

        return {
          success: false,
          status: 'PASS_CANCELLED',
          scan_type: scanType,
          message: 'ENTRY DENIED — PASS CANCELLED OR REVOKED',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          identity_photo_url: reg.identity_photo_url,
        };
      }

      // Case 3: PAYMENT NOT VERIFIED
      if (reg.payment_status !== 'PAID') {
        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          scan_type: scanType,
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'PAYMENT_NOT_VERIFIED',
          scanned_at: new Date().toISOString(),
          request_id: requestId,
          reason_code: `PAYMENT_${reg.payment_status}`,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          food_preference: reg.food_preference,
        });
        this.persist();

        return {
          success: false,
          status: 'PAYMENT_NOT_VERIFIED',
          scan_type: scanType,
          message: 'ENTRY DENIED — PAYMENT NOT VERIFIED BY ADMIN',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          identity_photo_url: reg.identity_photo_url,
        };
      }

      const now = new Date().toISOString();

      // =========================================================================
      // MODE 1: ENTRY GATE SCAN
      // =========================================================================
      if (scanType === 'ENTRY') {
        // If already scanned at entrance gate
        if (pass.redeemed_at) {
          const prevStaff = this.profiles.find((p) => p.id === pass.redeemed_by);

          this.scans.unshift({
            id: `scan-${Date.now()}`,
            event_id: this.event.id,
            pass_id: pass.id,
            scan_type: 'ENTRY',
            staff_user_id: staffUserId,
            staff_name: staff.display_name,
            scan_result: 'ALREADY_USED',
            scanned_at: now,
            request_id: requestId,
            reason_code: 'PREVIOUSLY_REDEEMED_ENTRY',
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            food_preference: reg.food_preference,
          });
          this.persist();

          return {
            success: false,
            status: 'ALREADY_USED',
            scan_type: 'ENTRY',
            message: 'ENTRY DENIED — QR CODE ALREADY USED AT MAIN GATE',
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            academic_year: reg.academic_year,
            food_preference: reg.food_preference,
            performance_talent: reg.performance_talent,
            identity_photo_url: reg.identity_photo_url,
            previous_scan_at: pass.redeemed_at,
            previous_staff_name: prevStaff?.display_name || pass.redeemed_by_name || 'Gate Volunteer',
          };
        }

        // ATOMIC ENTRY APPROVED
        pass.status = 'USED';
        pass.redeemed_at = now;
        pass.redeemed_by = staffUserId;
        pass.redeemed_by_name = staff.display_name;

        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          scan_type: 'ENTRY',
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'ENTRY_APPROVED',
          scanned_at: now,
          request_id: requestId,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          food_preference: reg.food_preference,
        });
        this.persist();

        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.from('entry_passes').update({
              status: 'USED',
              redeemed_at: now,
              redeemed_by: isValidUUID(staffUserId) ? staffUserId : null,
              updated_at: now,
            }).eq('id', pass.id);

            await supabase.from('entry_scans').insert({
              id: generateUUID(),
              event_id: this.event.id,
              pass_id: isValidUUID(pass.id) ? pass.id : null,
              staff_user_id: isValidUUID(staffUserId) ? staffUserId : null,
              gate_identifier: 'MAIN_GATE',
              scan_result: 'ENTRY_APPROVED',
              created_at: now,
            });
          } catch (e) {
            console.warn('Supabase scan sync exception:', e);
          }
        }

        return {
          success: true,
          status: 'ENTRY_APPROVED',
          scan_type: 'ENTRY',
          message: 'ENTRY APPROVED — WELCOME TO PRE-DIWALI!',
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          academic_year: reg.academic_year,
          food_preference: reg.food_preference,
          performance_talent: reg.performance_talent,
          identity_photo_url: reg.identity_photo_url,
          scanned_at: now,
        };
      }

      // =========================================================================
      // MODE 2: DINNER / FOOD SCAN
      // =========================================================================
      if (scanType === 'DINNER') {
        // STRICT ENFORCEMENT: Gate Entry QR MUST be scanned at main gate first before dinner can be claimed!
        if (!pass.redeemed_at) {
          this.scans.unshift({
            id: `scan-${Date.now()}`,
            event_id: this.event.id,
            pass_id: pass.id,
            scan_type: 'DINNER',
            staff_user_id: staffUserId,
            staff_name: staff.display_name,
            scan_result: 'GATE_ENTRY_NOT_DONE',
            scanned_at: now,
            request_id: requestId,
            reason_code: 'GATE_ENTRY_REQUIRED_FIRST',
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            food_preference: reg.food_preference,
          });
          this.persist();

          return {
            success: false,
            status: 'GATE_ENTRY_NOT_DONE',
            scan_type: 'DINNER',
            message: 'DINNER DENIED — GATE ENTRY NOT SCANNED! Student must scan QR at Main Gate first.',
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            academic_year: reg.academic_year,
            food_preference: reg.food_preference,
            performance_talent: reg.performance_talent,
            identity_photo_url: reg.identity_photo_url,
          };
        }

        // If dinner already claimed
        if (pass.dinner_redeemed_at) {
          const prevDinnerStaff = this.profiles.find((p) => p.id === pass.dinner_redeemed_by);

          this.scans.unshift({
            id: `scan-${Date.now()}`,
            event_id: this.event.id,
            pass_id: pass.id,
            scan_type: 'DINNER',
            staff_user_id: staffUserId,
            staff_name: staff.display_name,
            scan_result: 'ALREADY_CLAIMED_DINNER',
            scanned_at: now,
            request_id: requestId,
            reason_code: 'PREVIOUSLY_CLAIMED_DINNER',
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            food_preference: reg.food_preference,
          });
          this.persist();

          return {
            success: false,
            status: 'ALREADY_CLAIMED_DINNER',
            scan_type: 'DINNER',
            message: `DINNER DENIED — ${reg.food_preference.toUpperCase()} MEAL ALREADY CLAIMED`,
            student_name: reg.full_name,
            roll_number: reg.normalized_roll_number,
            academic_year: reg.academic_year,
            food_preference: reg.food_preference,
            performance_talent: reg.performance_talent,
            identity_photo_url: reg.identity_photo_url,
            previous_scan_at: pass.dinner_redeemed_at,
            previous_staff_name: prevDinnerStaff?.display_name || pass.dinner_redeemed_by_name || 'Dinner Volunteer',
          };
        }

        // ATOMIC DINNER APPROVED
        pass.dinner_redeemed_at = now;
        pass.dinner_redeemed_by = staffUserId;
        pass.dinner_redeemed_by_name = staff.display_name;

        this.scans.unshift({
          id: `scan-${Date.now()}`,
          event_id: this.event.id,
          pass_id: pass.id,
          scan_type: 'DINNER',
          staff_user_id: staffUserId,
          staff_name: staff.display_name,
          scan_result: 'DINNER_APPROVED',
          scanned_at: now,
          request_id: requestId,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          food_preference: reg.food_preference,
        });
        this.persist();

        if (isSupabaseConfigured && supabase) {
          try {
            // Note: entry_passes DOES NOT have dinner_redeemed_at in Supabase schema.
            // We record dinner scans in entry_scans table and update registrations.internal_notes!
            await supabase.from('entry_scans').insert({
              id: generateUUID(),
              event_id: this.event.id,
              pass_id: isValidUUID(pass.id) ? pass.id : null,
              staff_user_id: isValidUUID(staffUserId) ? staffUserId : null,
              gate_identifier: 'DINNER_COUNTER',
              scan_result: 'DINNER_APPROVED',
              created_at: now,
            });

            // Update registration internal_notes with dinner redemption timestamp
            let currentNotes: Record<string, unknown> = {};
            if (reg.internal_notes) {
              try {
                if (typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')) {
                  currentNotes = JSON.parse(reg.internal_notes);
                }
              } catch {
                currentNotes = {};
              }
            }
            const updatedNotes = {
              ...currentNotes,
              identity_photo_url: reg.identity_photo_url,
              performance_talent: reg.performance_talent,
              dinner_redeemed_at: now,
              dinner_redeemed_by: staff.display_name,
            };
            await supabase
              .from('registrations')
              .update({
                internal_notes: JSON.stringify(updatedNotes),
                updated_at: now,
              })
              .eq('id', reg.id);
          } catch (e) {
            console.warn('Supabase dinner scan sync exception:', e);
          }
        }

        return {
          success: true,
          status: 'DINNER_APPROVED',
          scan_type: 'DINNER',
          message: `DINNER APPROVED — PROVIDE 1x ${reg.food_preference.toUpperCase()} DINNER`,
          student_name: reg.full_name,
          roll_number: reg.normalized_roll_number,
          academic_year: reg.academic_year,
          food_preference: reg.food_preference,
          performance_talent: reg.performance_talent,
          identity_photo_url: reg.identity_photo_url,
          scanned_at: now,
        };
      }

      // Default fallback
      return {
        success: false,
        status: 'INVALID_PASS',
        scan_type: scanType,
        message: 'Invalid scan request',
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

  public getAllPaymentsWithRegistrations(): Array<PaymentRecord & { registration?: Registration }> {
    return this.payments.map((p) => {
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

  public async initSupabase(): Promise<{ success: boolean; registrationsCount: number; paymentsCount: number }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, registrationsCount: this.registrations.length, paymentsCount: this.payments.length };
    }
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
      }

      // 2. Fetch Registrations from Supabase and sync
      const { data: regRows } = await supabase.from('registrations').select('*');
      if (regRows) {
        const fetchedRegs: Registration[] = [];
        for (const row of regRows) {
          // Skip dummy entries
          if (
            row.id.toLowerCase().includes('dummy') ||
            row.id.startsWith('reg-seed-') ||
            row.full_name.toLowerCase().includes('dummy') ||
            row.normalized_roll_number.includes('TEST_ROLL_') ||
            row.normalized_roll_number.includes('UNPAID_ROLL_') ||
            row.normalized_roll_number.includes('_PRICE_')
          ) {
            continue;
          }

          // Authoritative Roll formatting: ensure IT or DS prefix in Supabase
          const prefixedRoll = formatRollWithCoursePrefix(row.normalized_roll_number, row.academic_year);
          if (row.normalized_roll_number !== prefixedRoll) {
            row.normalized_roll_number = prefixedRoll;
            try {
              await supabase.from('registrations').update({ normalized_roll_number: prefixedRoll }).eq('id', row.id);
            } catch (e) {
              console.warn('Roll prefix Supabase update notice:', e);
            }
          }

          let photoUrl = row.identity_photo_url || undefined;
          let talent = row.performance_talent || undefined;
          if (row.internal_notes) {
            try {
              if (typeof row.internal_notes === 'string' && row.internal_notes.startsWith('{')) {
                const parsed = JSON.parse(row.internal_notes);
                if (!photoUrl) photoUrl = parsed.identity_photo_url || parsed.photo_url || undefined;
                if (!talent) talent = parsed.performance_talent || undefined;
              } else if (!photoUrl && typeof row.internal_notes === 'string' && (row.internal_notes.startsWith('http') || row.internal_notes.startsWith('data:image'))) {
                photoUrl = row.internal_notes;
              }
            } catch {
              // ignore
            }
          }

          fetchedRegs.push({
            id: row.id,
            event_id: row.event_id,
            full_name: row.full_name,
            academic_year: row.academic_year,
            food_preference: row.food_preference,
            contact_number: row.contact_number,
            normalized_roll_number: prefixedRoll,
            consent_agreed: row.consent_agreed ?? true,
            payment_status: row.payment_status || 'PENDING',
            expected_amount_minor_units: 30000,
            currency: row.currency || 'INR',
            performance_talent: talent,
            identity_photo_url: photoUrl,
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        }

        // Resilient Sync: If any local registrations are not in Supabase yet, push them
        for (const localReg of this.registrations) {
          if (!fetchedRegs.some((r) => r.id === localReg.id)) {
            this.syncRegistrationToSupabase(localReg).catch(() => {});
            fetchedRegs.push(localReg);
          }
        }
        this.registrations = fetchedRegs;
      }

      // 3. Fetch Payments from Supabase and sync
      const { data: payRows } = await supabase.from('payments').select('*');
      if (payRows) {
        const fetchedPays: PaymentRecord[] = [];
        for (const row of payRows) {
          if (row.id.toLowerCase().includes('dummy') || row.id.startsWith('pay-seed-')) continue;
          fetchedPays.push({
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
          });

          // Authoritative link: align registration payment_status with payment status
          const matchingReg = this.registrations.find((r) => r.id === row.registration_id);
          if (matchingReg && row.status) {
            matchingReg.payment_status = row.status;
          }
        }

        // Resilient Sync: If any local payments are not in Supabase yet, push them
        for (const localPay of this.payments) {
          if (!fetchedPays.some((p) => p.id === localPay.id)) {
            Promise.resolve(
              supabase.from('payments').upsert({
                id: localPay.id,
                registration_id: localPay.registration_id,
                provider: localPay.provider || 'STATIC_UPI',
                transaction_reference: localPay.transaction_reference || null,
                screenshot_url: localPay.screenshot_url || null,
                expected_amount_minor_units: localPay.expected_amount_minor_units || 30000,
                currency: localPay.currency || 'INR',
                status: localPay.status || 'PENDING',
                verification_method: localPay.verification_method || 'MANUAL_ADMIN',
                created_at: localPay.created_at,
                updated_at: localPay.updated_at,
              })
            ).catch(() => {});
            fetchedPays.push(localPay);
          }
        }
        this.payments = fetchedPays;
      }

      // 4. Fetch Entry Passes from Supabase
      const { data: passRows } = await supabase.from('entry_passes').select('*');
      const fetchedPasses: EntryPass[] = [];
      if (passRows) {
        for (const row of passRows) {
          if (row.id.toLowerCase().includes('dummy') || row.id.startsWith('pass-seed-')) continue;
          fetchedPasses.push({
            id: row.id,
            registration_id: row.registration_id,
            token_hash: row.token_hash,
            status: row.status || 'VALID',
            issued_at: row.issued_at,
            redeemed_at: row.redeemed_at || undefined,
            redeemed_by: row.redeemed_by || undefined,
            dinner_redeemed_at: row.dinner_redeemed_at || undefined,
            dinner_redeemed_by: row.dinner_redeemed_by || undefined,
            revoked_at: row.revoked_at || undefined,
            replacement_of_pass_id: row.replacement_of_pass_id || undefined,
          });
        }
      }

      // 5. Fetch Scans from Supabase
      const { data: scanRows } = await supabase.from('entry_scans').select('*');
      const fetchedScans: EntryScanLog[] = [];
      if (scanRows) {
        for (const row of scanRows) {
          if (row.id.toLowerCase().includes('dummy') || row.id.startsWith('scan-seed-')) continue;
          fetchedScans.push({
            id: row.id,
            event_id: row.event_id,
            pass_id: row.pass_id || undefined,
            staff_user_id: row.staff_user_id,
            staff_name: row.gate_identifier === 'DINNER_COUNTER' ? 'Dinner Volunteer' : 'Gate Volunteer',
            scan_result: row.scan_result,
            scanned_at: row.created_at || new Date().toISOString(),
          });
        }
        this.scans = fetchedScans;
      }

      // 6. Cross-link Dinner & Gate Redemptions onto passes from scans and registration notes
      for (const pass of fetchedPasses) {
        const dinnerScan = fetchedScans.find((s) => s.pass_id === pass.id && s.scan_result === 'DINNER_APPROVED');
        if (dinnerScan) {
          pass.dinner_redeemed_at = dinnerScan.scanned_at;
          pass.dinner_redeemed_by = dinnerScan.staff_user_id;
        }

        const linkedReg = this.registrations.find((r) => r.id === pass.registration_id);
        if (linkedReg?.internal_notes) {
          try {
            if (typeof linkedReg.internal_notes === 'string' && linkedReg.internal_notes.startsWith('{')) {
              const parsed = JSON.parse(linkedReg.internal_notes);
              if (parsed.dinner_redeemed_at && !pass.dinner_redeemed_at) {
                pass.dinner_redeemed_at = parsed.dinner_redeemed_at;
                pass.dinner_redeemed_by = parsed.dinner_redeemed_by;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!pass.redeemed_at) {
          const entryScan = fetchedScans.find((s) => s.pass_id === pass.id && s.scan_result === 'ENTRY_APPROVED');
          if (entryScan) {
            pass.redeemed_at = entryScan.scanned_at;
            pass.status = 'USED';
          }
        }
      }

      // Bi-directional pass sync: Push local passes missing from Supabase
      for (const localPass of this.passes) {
        if (!fetchedPasses.some((p) => p.id === localPass.id)) {
          if (isValidUUID(localPass.id)) {
            Promise.resolve(
              supabase.from('entry_passes').upsert({
                id: localPass.id,
                registration_id: localPass.registration_id,
                token_hash: localPass.token_hash,
                status: localPass.status,
                issued_at: localPass.issued_at,
                redeemed_at: localPass.redeemed_at || null,
                redeemed_by: isValidUUID(localPass.redeemed_by) ? localPass.redeemed_by : null,
              })
            ).catch(() => {});
          }
          fetchedPasses.push(localPass);
        }
      }
      this.passes = fetchedPasses;

      // Auto-Heal: Ensure every PAID student has a valid entry pass
      for (const reg of this.registrations) {
        if (reg.payment_status === 'PAID') {
          const hasPass = this.passes.some((p) => p.registration_id === reg.id);
          if (!hasPass) {
            try {
              const rawToken = generatePassToken();
              const tokenHash = await hashToken(rawToken);
              const newPass: EntryPass = {
                id: generateUUID(),
                registration_id: reg.id,
                token_hash: tokenHash,
                status: 'VALID',
                issued_at: new Date().toISOString(),
              };
              this.passes.push(newPass);
              this.clientTokens[reg.id] = rawToken;
              await supabase.from('entry_passes').upsert({
                id: newPass.id,
                registration_id: newPass.registration_id,
                token_hash: newPass.token_hash,
                status: newPass.status,
                issued_at: newPass.issued_at,
              });
            } catch (autoHealErr) {
              console.warn('Pass auto-heal notice for reg', reg.id, autoHealErr);
            }
          }
        }
      }

      this.persist();
      return { success: true, registrationsCount: this.registrations.length, paymentsCount: this.payments.length };
    } catch (err) {
      console.warn('Supabase sync exception:', err);
      return { success: false, registrationsCount: this.registrations.length, paymentsCount: this.payments.length };
    }
  }

  public subscribeToRealtimeChanges(callback: () => void): (() => void) | undefined {
    if (!isSupabaseConfigured || !supabase) return undefined;
    try {
      const channel = supabase
        .channel('realtime_event_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, async () => {
          await this.initSupabase();
          callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, async () => {
          await this.initSupabase();
          callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_passes' }, async () => {
          await this.initSupabase();
          callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_scans' }, async () => {
          await this.initSupabase();
          callback();
        })
        .subscribe();

      return () => {
        try {
          supabase?.removeChannel(channel);
        } catch {
          // ignore
        }
      };
    } catch (e) {
      console.warn('Supabase realtime subscription notice:', e);
      return undefined;
    }
  }
}

// Singleton Data Service instance
export const dataService = new PreDiwaliDataStore();
