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
  payment_upi_id: '7862039083@upi',
  payment_upi_name: 'Prince Kahar',
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
  private syncPromise: Promise<{ success: boolean; registrationsCount: number; paymentsCount: number }> | null = null;
  private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.event.payment_upi_id = this.event.payment_upi_id || '7862039083@upi';
      if (!this.event.payment_upi_name || this.event.payment_upi_name === 'Madhavi Kalathiya') {
        this.event.payment_upi_name = 'Prince Kahar';
      }
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
        const rawPasses: EntryPass[] = JSON.parse(ps);
        const paidRegIds = new Set(this.registrations.filter((r) => r.payment_status === 'PAID').map((r) => r.id));
        const seenRegIds = new Set<string>();
        this.passes = rawPasses
          .filter(
            (item: EntryPass) =>
              !item.id.startsWith('pass-seed-') &&
              !item.id.toLowerCase().includes('dummy') &&
              paidRegIds.has(item.registration_id)
          )
          .sort((a, b) => {
            const aUsed = a.status === 'USED' || Boolean(a.redeemed_at);
            const bUsed = b.status === 'USED' || Boolean(b.redeemed_at);
            if (aUsed && !bUsed) return -1;
            if (!aUsed && bUsed) return 1;
            return new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime();
          })
          .filter((item: EntryPass) => {
            if (seenRegIds.has(item.registration_id)) return false;
            seenRegIds.add(item.registration_id);
            return true;
          });
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

  public reloadFromStorage(): void {
    this.loadFromStorage();
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

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('prediwali_local_update'));
      }
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

  public async updateEventSettings(updated: Partial<EventSettings>, actorId: string): Promise<EventSettings> {
    this.event = {
      ...this.event,
      ...updated,
      updated_at: new Date().toISOString(),
    };
    this.addAuditLog(actorId, 'UPDATE_EVENT_SETTINGS', 'event', this.event.id, 'Updated event settings', updated);
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('events')
          .update({
            payment_upi_id: this.event.payment_upi_id,
            payment_upi_name: this.event.payment_upi_name,
            college_name: this.event.college_name,
            name: this.event.name,
            venue: this.event.venue,
            venue_directions: this.event.venue_directions,
            contact_email: this.event.contact_email,
            contact_phone: this.event.contact_phone,
            registration_fee_minor_units: this.event.registration_fee_minor_units,
            maximum_capacity: this.event.maximum_capacity,
            registration_enabled: this.event.registration_enabled,
            updated_at: this.event.updated_at,
          })
          .eq('id', this.event.id);
      } catch (err) {
        console.warn('Supabase updateEventSettings sync error:', err);
      }
    }

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

    // Prevent duplicate phone spam: 1 student registration per mobile number
    const existingPhone = this.registrations.find(
      (r) => r.event_id === this.event.id && r.contact_number === cleanPhone && r.normalized_roll_number !== normalizedRoll
    );
    if (existingPhone) {
      throw new Error(`Mobile number ${cleanPhone} is already registered with student "${existingPhone.full_name}" (Roll: ${existingPhone.normalized_roll_number}). Each student must use their own unique mobile number.`);
    }

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
      identity_photo_url: parsed.identity_photo_url,
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
    if (!reg) {
      throw new Error('Registration record not found. Entry pass cannot be generated.');
    }
    if (!reg.normalized_roll_number) {
      throw new Error('Invalid registration: Missing roll number.');
    }
    if (reg.payment_status !== 'PAID') {
      throw new Error(`Cannot issue entry pass: Student ${reg.full_name} (Roll: ${reg.normalized_roll_number}) has not completed verified payment.`);
    }

    // Check if pass already exists (VALID or USED) - strict one-time pass guarantee
    let existing = this.passes.find(
      (p) => p.registration_id === registrationId && (p.status === 'VALID' || p.status === 'USED')
    );
    if (!existing && isSupabaseConfigured && supabase) {
      try {
        const { data: dbPass } = await supabase
          .from('entry_passes')
          .select('*')
          .eq('registration_id', registrationId)
          .maybeSingle();
        if (dbPass) {
          existing = dbPass as EntryPass;
          if (!this.passes.some((p) => p.id === existing!.id)) {
            this.passes.push(existing);
          }
        }
      } catch (checkErr) {
        console.warn('issueEntryPass cloud pass check notice:', checkErr);
      }
    }
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
    const reg = this.registrations.find((r) => r.id === registrationId);
    if (!reg || reg.payment_status !== 'PAID') return undefined;

    let pass = this.passes.find((p) => p.registration_id === registrationId);
    if (!pass) return undefined;
    const raw_token = this.clientTokens[registrationId];
    pass = { ...pass, raw_token };

    // Authoritative check against registration internal_notes
    if (reg?.internal_notes) {
      try {
        const notes =
          typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')
            ? JSON.parse(reg.internal_notes)
            : typeof reg.internal_notes === 'object'
            ? (reg.internal_notes as Record<string, unknown>)
            : null;
        if (notes?.gate_entry_redeemed_at) {
          pass.redeemed_at = pass.redeemed_at || (notes.gate_entry_redeemed_at as string);
          pass.status = 'USED';
          pass.redeemed_by_name = pass.redeemed_by_name || (notes.gate_entry_redeemed_by as string);
        }
        if (notes?.dinner_redeemed_at) {
          pass.dinner_redeemed_at = pass.dinner_redeemed_at || (notes.dinner_redeemed_at as string);
          pass.dinner_redeemed_by_name = pass.dinner_redeemed_by_name || (notes.dinner_redeemed_by as string);
        }
      } catch {
        // ignore
      }
    }

    return pass;
  }

  // Instant 1-second real-time sync for single student's pass & registration status
  public async syncSinglePass(
    registrationId: string
  ): Promise<{ pass?: EntryPass & { raw_token?: string }; registration?: Registration }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: dbReg } = await supabase
          .from('registrations')
          .select('*')
          .eq('id', registrationId)
          .maybeSingle();

        if (dbReg) {
          const idx = this.registrations.findIndex((r) => r.id === registrationId);
          if (idx !== -1) {
            this.registrations[idx] = { ...this.registrations[idx], ...dbReg };
          } else {
            this.registrations.push(dbReg as Registration);
          }
        }

        const { data: dbPass } = await supabase
          .from('entry_passes')
          .select('*')
          .eq('registration_id', registrationId)
          .maybeSingle();

        if (dbPass) {
          const idx = this.passes.findIndex((p) => p.registration_id === registrationId);
          if (idx !== -1) {
            const prevDinner = this.passes[idx].dinner_redeemed_at;
            const prevDinnerBy = this.passes[idx].dinner_redeemed_by;
            const prevDinnerByName = this.passes[idx].dinner_redeemed_by_name;
            const prevRedeemedAt = this.passes[idx].redeemed_at;
            this.passes[idx] = {
              ...this.passes[idx],
              ...dbPass,
              dinner_redeemed_at: dbPass.dinner_redeemed_at || prevDinner,
              dinner_redeemed_by: dbPass.dinner_redeemed_by || prevDinnerBy,
              dinner_redeemed_by_name: prevDinnerByName,
              redeemed_at: dbPass.redeemed_at || prevRedeemedAt,
              status: (dbPass.redeemed_at || prevRedeemedAt || dbPass.status === 'USED') ? 'USED' : dbPass.status,
            };
          } else {
            this.passes.push(dbPass as EntryPass);
          }
        }

        const targetPass = this.passes.find((p) => p.registration_id === registrationId);
        if (targetPass && dbReg?.internal_notes) {
          try {
            const notes =
              typeof dbReg.internal_notes === 'string'
                ? JSON.parse(dbReg.internal_notes)
                : dbReg.internal_notes;
            if (notes.gate_entry_redeemed_at) {
              targetPass.redeemed_at = notes.gate_entry_redeemed_at;
              targetPass.status = 'USED';
              targetPass.redeemed_by_name = notes.gate_entry_redeemed_by;
            }
            if (notes.dinner_redeemed_at) {
              targetPass.dinner_redeemed_at = notes.dinner_redeemed_at;
              targetPass.dinner_redeemed_by_name = notes.dinner_redeemed_by;
            }
          } catch {
            // ignore
          }
        }

        this.persist();
      } catch (err) {
        console.warn('syncSinglePass error:', err);
      }
    }

    return {
      pass: this.getEntryPassByRegistration(registrationId),
      registration: this.getRegistrationById(registrationId),
    };
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

  public getPasses(): EntryPass[] {
    const paidRegIds = new Set(this.registrations.filter((r) => r.payment_status === 'PAID').map((r) => r.id));
    return this.passes.filter((p) => paidRegIds.has(p.registration_id));
  }

  public async clearAllScansAdmin(adminId: string): Promise<boolean> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');
    this.scans = [];
    this.persist();
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('entry_scans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Clear scans error:', e);
      }
    }
    return true;
  }

  public async deleteRegistrationAdmin(registrationId: string, adminId: string): Promise<boolean> {
    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    const reg = this.registrations.find((r) => r.id === registrationId);
    if (!reg) return false;

    const passIds = this.passes.filter((p) => p.registration_id === registrationId).map((p) => p.id);
    this.registrations = this.registrations.filter((r) => r.id !== registrationId);
    this.payments = this.payments.filter((p) => p.registration_id !== registrationId);
    this.passes = this.passes.filter((p) => p.registration_id !== registrationId);
    this.scans = this.scans.filter((s) => s.pass_id !== registrationId && !passIds.includes(s.pass_id || ''));

    this.addAuditLog(adminId, 'DELETE_REGISTRATION', 'registration', registrationId, `Admin deleted registration for Roll: ${reg.normalized_roll_number}`);
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        if (passIds.length > 0) {
          await supabase.from('entry_scans').delete().in('pass_id', [registrationId, ...passIds]);
        } else {
          await supabase.from('entry_scans').delete().eq('pass_id', registrationId);
        }
        await supabase.from('entry_passes').delete().eq('registration_id', registrationId);
        await supabase.from('payments').delete().eq('registration_id', registrationId);
        await supabase.from('registrations').delete().eq('id', registrationId);
      } catch (err) {
        console.warn('Supabase deleteRegistration error:', err);
      }
    }
    return true;
  }

  public async reactivateUsedPassAdmin(passId: string, adminId: string, reason: string = 'Admin allowed re-entry / pass re-use'): Promise<EntryPass> {
    const pass = this.passes.find((p) => p.id === passId || p.registration_id === passId);
    if (!pass) throw new Error('Pass not found');

    const admin = this.profiles.find((p) => p.id === adminId && p.role === 'ADMIN');
    if (!admin) throw new Error('Unauthorized');

    pass.status = 'VALID';
    pass.redeemed_at = undefined;
    pass.redeemed_by = undefined;
    pass.redeemed_by_name = undefined;

    // Remove previous ENTRY_APPROVED scan from local scans so it never blocks re-entry or triggers resurrection
    this.scans = this.scans.filter((s) => {
      const isThisPass = s.pass_id === pass.id || s.pass_id === pass.registration_id;
      return !(isThisPass && s.scan_result === 'ENTRY_APPROVED');
    });

    // Clear gate entry timestamp from registration internal_notes
    const matchingReg = this.registrations.find((r) => r.id === pass.registration_id);
    let updatedNotesStr: string | undefined = undefined;
    if (matchingReg) {
      let currentNotes: Record<string, unknown> = {};
      if (matchingReg.internal_notes) {
        try {
          if (typeof matchingReg.internal_notes === 'string' && matchingReg.internal_notes.startsWith('{')) {
            currentNotes = JSON.parse(matchingReg.internal_notes);
          }
        } catch {
          currentNotes = {};
        }
      }
      delete currentNotes.gate_entry_redeemed_at;
      delete currentNotes.gate_entry_redeemed_by;
      updatedNotesStr = JSON.stringify(currentNotes);
      matchingReg.internal_notes = updatedNotesStr;
    }

    this.addAuditLog(adminId, 'REACTIVATE_PASS', 'entry_pass', pass.id, reason);
    this.persist();

    // Supabase cloud sync
    if (isSupabaseConfigured && supabase) {
      try {
        if (isValidUUID(pass.id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'VALID',
              redeemed_at: null,
              redeemed_by: null,
            })
            .eq('id', pass.id);
        } else if (isValidUUID(pass.registration_id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'VALID',
              redeemed_at: null,
              redeemed_by: null,
            })
            .eq('registration_id', pass.registration_id);
        }

        // Delete old entry_approved scans from Supabase to prevent resurrection on next sync
        if (isValidUUID(pass.id)) {
          await supabase.from('entry_scans').delete().eq('pass_id', pass.id).eq('scan_result', 'ENTRY_APPROVED');
        }
        if (isValidUUID(pass.registration_id)) {
          await supabase.from('entry_scans').delete().eq('pass_id', pass.registration_id).eq('scan_result', 'ENTRY_APPROVED');
        }

        if (matchingReg && updatedNotesStr && isValidUUID(matchingReg.id)) {
          await supabase
            .from('registrations')
            .update({ internal_notes: updatedNotesStr, updated_at: new Date().toISOString() })
            .eq('id', matchingReg.id);
        }
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
    pass.dinner_redeemed_at = undefined;
    pass.dinner_redeemed_by = undefined;
    pass.dinner_redeemed_by_name = undefined;

    // Filter out previous dinner scan so it doesn't resurrect dinner redemption
    this.scans = this.scans.filter((s) => {
      const isThisPass = s.pass_id === pass.id || s.pass_id === pass.registration_id;
      return !(isThisPass && (s.scan_result === 'DINNER_APPROVED' || s.scan_type === 'DINNER'));
    });

    const matchingReg = this.registrations.find((r) => r.id === pass.registration_id);
    let updatedNotesStr: string | undefined = undefined;
    if (matchingReg) {
      let currentNotes: Record<string, unknown> = {};
      if (matchingReg.internal_notes) {
        try {
          if (typeof matchingReg.internal_notes === 'string' && matchingReg.internal_notes.startsWith('{')) {
            currentNotes = JSON.parse(matchingReg.internal_notes);
          }
        } catch {
          currentNotes = {};
        }
      }
      delete currentNotes.dinner_redeemed_at;
      delete currentNotes.dinner_redeemed_by;
      updatedNotesStr = JSON.stringify(currentNotes);
      matchingReg.internal_notes = updatedNotesStr;
    }

    this.addAuditLog(
      adminId,
      'RESET_DINNER_SCAN',
      'entry_pass',
      pass.id,
      reason || 'Admin reset dinner meal redemption status'
    );
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        if (isValidUUID(pass.id)) {
          await supabase.from('entry_passes').update({ dinner_redeemed_at: null, dinner_redeemed_by: null }).eq('id', pass.id);
        } else if (isValidUUID(pass.registration_id)) {
          await supabase.from('entry_passes').update({ dinner_redeemed_at: null, dinner_redeemed_by: null }).eq('registration_id', pass.registration_id);
        }

        if (isValidUUID(pass.id)) {
          await supabase.from('entry_scans').delete().eq('pass_id', pass.id).eq('scan_result', 'DINNER_APPROVED');
        }
        if (isValidUUID(pass.registration_id)) {
          await supabase.from('entry_scans').delete().eq('pass_id', pass.registration_id).eq('scan_result', 'DINNER_APPROVED');
        }

        if (matchingReg && updatedNotesStr && isValidUUID(matchingReg.id)) {
          await supabase
            .from('registrations')
            .update({ internal_notes: updatedNotesStr, updated_at: new Date().toISOString() })
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

    let pass = this.passes.find((p) => p.id === passId || p.registration_id === passId);
    if (!pass) {
      const reg = this.registrations.find((r) => r.id === passId);
      if (reg) {
        pass = {
          id: generateUUID(),
          registration_id: reg.id,
          token_hash: '',
          status: 'VALID',
          issued_at: new Date().toISOString(),
        };
        this.passes.push(pass);
      } else {
        throw new Error('Pass not found');
      }
    }

    const now = new Date().toISOString();
    pass.status = 'USED';
    pass.redeemed_at = now;
    pass.redeemed_by = adminId;
    pass.redeemed_by_name = admin.display_name || 'Admin Override';

    const matchingReg = this.registrations.find((r) => r.id === pass!.registration_id);
    let updatedNotesStr: string | undefined = undefined;
    if (matchingReg) {
      let currentNotes: Record<string, unknown> = {};
      if (matchingReg.internal_notes) {
        try {
          if (typeof matchingReg.internal_notes === 'string' && matchingReg.internal_notes.startsWith('{')) {
            currentNotes = JSON.parse(matchingReg.internal_notes);
          }
        } catch {
          currentNotes = {};
        }
      }
      currentNotes.gate_entry_redeemed_at = now;
      currentNotes.gate_entry_redeemed_by = admin.display_name || 'Admin Override';
      updatedNotesStr = JSON.stringify(currentNotes);
      matchingReg.internal_notes = updatedNotesStr;
    }

    // Add entry scan to local scans immediately so scanner activity and metrics update with 0ms delay
    const existingGateScan = this.scans.find(
      (s) => (s.pass_id === pass!.id || s.pass_id === pass!.registration_id) && s.scan_result === 'ENTRY_APPROVED'
    );
    if (!existingGateScan) {
      this.scans.unshift({
        id: `scan-${Date.now()}`,
        event_id: this.event.id,
        pass_id: pass.id,
        staff_user_id: adminId,
        staff_name: admin.display_name || 'Admin Override',
        scan_result: 'ENTRY_APPROVED',
        scanned_at: now,
        reason_code: 'MAIN_GATE',
        student_name: matchingReg?.full_name,
        roll_number: matchingReg ? formatRollWithCoursePrefix(matchingReg.normalized_roll_number, matchingReg.academic_year) : undefined,
        food_preference: matchingReg?.food_preference,
        scan_type: 'ENTRY',
      });
    }

    this.addAuditLog(adminId, 'MARK_GATE_ENTRY_DONE', 'entry_pass', pass.id, 'Admin manually marked gate entry as DONE');
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        if (isValidUUID(pass.id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'USED',
              redeemed_at: now,
              redeemed_by: isValidUUID(adminId) ? adminId : null,
              updated_at: now,
            })
            .eq('id', pass.id);
        } else if (isValidUUID(pass.registration_id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'USED',
              redeemed_at: now,
              redeemed_by: isValidUUID(adminId) ? adminId : null,
              updated_at: now,
            })
            .eq('registration_id', pass.registration_id);
        }

        const scanPassId = isValidUUID(pass.id) ? pass.id : (isValidUUID(pass.registration_id) ? pass.registration_id : null);
        await supabase.from('entry_scans').insert({
          id: generateUUID(),
          event_id: this.event.id,
          pass_id: scanPassId,
          staff_user_id: isValidUUID(adminId) ? adminId : null,
          scan_result: 'ENTRY_APPROVED',
          scanned_at: now,
          reason_code: 'MAIN_GATE',
        });

        if (matchingReg && updatedNotesStr && isValidUUID(matchingReg.id)) {
          await supabase
            .from('registrations')
            .update({ internal_notes: updatedNotesStr, updated_at: now })
            .eq('id', matchingReg.id);
        }
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

    let pass = this.passes.find((p) => p.id === passId || p.registration_id === passId);
    if (!pass) {
      const reg = this.registrations.find((r) => r.id === passId);
      if (reg) {
        pass = {
          id: generateUUID(),
          registration_id: reg.id,
          token_hash: '',
          status: 'VALID',
          issued_at: new Date().toISOString(),
        };
        this.passes.push(pass);
      } else {
        throw new Error('Pass not found');
      }
    }

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

    const matchingReg = this.registrations.find((r) => r.id === pass!.registration_id);
    let updatedNotesStr: string | undefined = undefined;
    if (matchingReg) {
      let currentNotes: Record<string, unknown> = {};
      if (matchingReg.internal_notes) {
        try {
          if (typeof matchingReg.internal_notes === 'string' && matchingReg.internal_notes.startsWith('{')) {
            currentNotes = JSON.parse(matchingReg.internal_notes);
          }
        } catch {
          currentNotes = {};
        }
      }
      currentNotes.dinner_redeemed_at = now;
      currentNotes.dinner_redeemed_by = admin.display_name;
      if (!currentNotes.gate_entry_redeemed_at) {
        currentNotes.gate_entry_redeemed_at = now;
        currentNotes.gate_entry_redeemed_by = admin.display_name;
      }
      updatedNotesStr = JSON.stringify(currentNotes);
      matchingReg.internal_notes = updatedNotesStr;
    }

    // Add dinner scan to local scans immediately so scanner activity and metrics update with 0ms delay
    const existingDinnerScan = this.scans.find(
      (s) => (s.pass_id === pass!.id || s.pass_id === pass!.registration_id) && s.scan_result === 'DINNER_APPROVED'
    );
    if (!existingDinnerScan) {
      this.scans.unshift({
        id: `scan-${Date.now()}`,
        event_id: this.event.id,
        pass_id: pass.id,
        staff_user_id: adminId,
        staff_name: admin.display_name || 'Admin Override',
        scan_result: 'DINNER_APPROVED',
        scanned_at: now,
        reason_code: 'DINNER_COUNTER',
        student_name: matchingReg?.full_name,
        roll_number: matchingReg ? formatRollWithCoursePrefix(matchingReg.normalized_roll_number, matchingReg.academic_year) : undefined,
        food_preference: matchingReg?.food_preference,
        scan_type: 'DINNER',
      });
    }

    this.addAuditLog(adminId, 'MARK_DINNER_SCAN_DONE', 'entry_pass', pass.id, 'Admin manually marked dinner scan as DONE');
    this.persist();

    if (isSupabaseConfigured && supabase) {
      try {
        if (isValidUUID(pass.id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'USED',
              redeemed_at: pass.redeemed_at,
              redeemed_by: isValidUUID(adminId) ? adminId : null,
              dinner_redeemed_at: now,
              dinner_redeemed_by: isValidUUID(adminId) ? adminId : null,
              updated_at: now,
            })
            .eq('id', pass.id);
        } else if (isValidUUID(pass.registration_id)) {
          await supabase
            .from('entry_passes')
            .update({
              status: 'USED',
              redeemed_at: pass.redeemed_at,
              redeemed_by: isValidUUID(adminId) ? adminId : null,
              dinner_redeemed_at: now,
              dinner_redeemed_by: isValidUUID(adminId) ? adminId : null,
              updated_at: now,
            })
            .eq('registration_id', pass.registration_id);
        }

        const scanPassId = isValidUUID(pass.id) ? pass.id : (isValidUUID(pass.registration_id) ? pass.registration_id : null);
        try {
          await supabase.from('entry_scans').insert({
            id: generateUUID(),
            event_id: this.event.id,
            pass_id: scanPassId,
            staff_user_id: isValidUUID(adminId) ? adminId : null,
            scan_result: 'DINNER_APPROVED',
            scanned_at: now,
            reason_code: 'DINNER_COUNTER',
          });
        } catch {
          await supabase.from('entry_scans').insert({
            id: generateUUID(),
            event_id: this.event.id,
            pass_id: scanPassId,
            staff_user_id: isValidUUID(adminId) ? adminId : null,
            scan_result: 'ENTRY_APPROVED',
            scanned_at: now,
            reason_code: 'DINNER_COUNTER',
          });
        }

        if (matchingReg && updatedNotesStr && isValidUUID(matchingReg.id)) {
          await supabase
            .from('registrations')
            .update({ internal_notes: updatedNotesStr, updated_at: now })
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

      // Remote cross-check: sync latest redemption status across devices in real time from Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          // 1. Fetch latest pass status from cloud
          let passQuery = supabase.from('entry_passes').select('*');
          if (isValidUUID(pass.id)) {
            passQuery = passQuery.or(`id.eq.${pass.id},token_hash.eq.${computedHash}`);
          } else {
            passQuery = passQuery.eq('token_hash', computedHash);
          }
          const { data: remotePass } = await passQuery.maybeSingle();
          if (remotePass) {
            if (remotePass.redeemed_at) {
              pass.redeemed_at = remotePass.redeemed_at;
              pass.status = 'USED';
            }
            if (remotePass.redeemed_by) pass.redeemed_by = remotePass.redeemed_by;
            if (remotePass.status === 'REVOKED' || remotePass.status === 'CANCELLED') {
              pass.status = remotePass.status;
            }
          }

          // 2. Fetch latest registration from cloud (authoritative internal_notes holding gate & dinner state)
          const { data: remoteReg } = await supabase
            .from('registrations')
            .select('*')
            .eq('id', pass.registration_id)
            .maybeSingle();

          if (remoteReg) {
            reg.payment_status = remoteReg.payment_status;
            reg.cancelled_at = remoteReg.cancelled_at;
            reg.internal_notes = remoteReg.internal_notes;
            if (remoteReg.food_preference) reg.food_preference = remoteReg.food_preference;
            if (remoteReg.identity_photo_url) reg.identity_photo_url = remoteReg.identity_photo_url;

            if (remoteReg.internal_notes) {
              try {
                const parsedNotes = typeof remoteReg.internal_notes === 'string'
                  ? JSON.parse(remoteReg.internal_notes)
                  : remoteReg.internal_notes;

                if (parsedNotes.gate_entry_redeemed_at) {
                  pass.redeemed_at = pass.redeemed_at || parsedNotes.gate_entry_redeemed_at;
                  pass.status = 'USED';
                  pass.redeemed_by_name = pass.redeemed_by_name || parsedNotes.gate_entry_redeemed_by;
                }
                if (parsedNotes.dinner_redeemed_at) {
                  pass.dinner_redeemed_at = pass.dinner_redeemed_at || parsedNotes.dinner_redeemed_at;
                  pass.dinner_redeemed_by_name = pass.dinner_redeemed_by_name || parsedNotes.dinner_redeemed_by;
                }
              } catch {
                // ignore
              }
            }
          }

          // 3. Check remote entry_scans for gate entry AND dinner using valid schema columns
          let scansQuery = supabase.from('entry_scans').select('*');
          if (isValidUUID(pass.id) && isValidUUID(pass.registration_id)) {
            scansQuery = scansQuery.or(`pass_id.eq.${pass.id},pass_id.eq.${pass.registration_id}`);
          } else if (isValidUUID(pass.id)) {
            scansQuery = scansQuery.eq('pass_id', pass.id);
          }

          const { data: dbScans } = await scansQuery;
          if (dbScans && dbScans.length > 0) {
            for (const s of dbScans) {
              const isDinner = s.reason_code === 'DINNER_APPROVED' || s.reason_code === 'DINNER_COUNTER' || s.scan_result === 'DINNER_APPROVED';
              const scanTime = s.scanned_at || s.created_at || new Date().toISOString();

              if (!this.scans.some((existing) => existing.id === s.id)) {
                this.scans.unshift({
                  id: s.id,
                  event_id: s.event_id,
                  pass_id: s.pass_id,
                  staff_user_id: s.staff_user_id,
                  staff_name: isDinner ? 'Dinner Volunteer' : 'Gate Volunteer',
                  scan_result: isDinner ? 'DINNER_APPROVED' : s.scan_result,
                  scanned_at: scanTime,
                });
              }

              if (isDinner) {
                pass.dinner_redeemed_at = pass.dinner_redeemed_at || scanTime;
                pass.dinner_redeemed_by = pass.dinner_redeemed_by || s.staff_user_id;
              } else if (s.scan_result === 'ENTRY_APPROVED') {
                pass.redeemed_at = pass.redeemed_at || scanTime;
                pass.status = 'USED';
              }
            }
          }
        } catch (e) {
          console.warn('Remote redemption live cross-check notice:', e);
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
      // MODE 1: ENTRY GATE SCAN (STRICT ONE-TIME USE)
      // =========================================================================
      if (scanType === 'ENTRY') {
        // Strict check: if redeemed_at is recorded, or marked USED, or logged in scans or internal_notes
        let isEntryAlreadyScanned =
          Boolean(pass.redeemed_at) ||
          pass.status === 'USED' ||
          this.scans.some((s) => (s.pass_id === pass!.id || s.pass_id === pass!.registration_id) && s.scan_result === 'ENTRY_APPROVED');

        if (!isEntryAlreadyScanned && reg.internal_notes) {
          try {
            const parsedNotes = typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')
              ? JSON.parse(reg.internal_notes)
              : (typeof reg.internal_notes === 'object' ? reg.internal_notes : null);
            if (parsedNotes?.gate_entry_redeemed_at) {
              isEntryAlreadyScanned = true;
              pass.redeemed_at = pass.redeemed_at || parsedNotes.gate_entry_redeemed_at;
              pass.status = 'USED';
              pass.redeemed_by_name = pass.redeemed_by_name || parsedNotes.gate_entry_redeemed_by;
            }
          } catch {
            // ignore
          }
        }

        if (isEntryAlreadyScanned) {
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
            previous_scan_at: pass.redeemed_at || now,
            previous_staff_name: prevStaff?.display_name || pass.redeemed_by_name || 'Gate Volunteer',
          };
        }

        // ATOMIC ENTRY APPROVED
        pass.status = 'USED';
        pass.redeemed_at = now;
        pass.redeemed_by = staffUserId;
        pass.redeemed_by_name = staff.display_name;

        // Mirror gate entry in registrations internal_notes for 100% persistent one-time guarantee across refreshes
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
          gate_entry_redeemed_at: now,
          gate_entry_redeemed_by: staff.display_name,
        };
        reg.internal_notes = JSON.stringify(updatedNotes);

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
            if (isValidUUID(pass.id)) {
              await supabase.from('entry_passes').update({
                status: 'USED',
                redeemed_at: now,
                redeemed_by: isValidUUID(staffUserId) ? staffUserId : null,
                updated_at: now,
              }).eq('id', pass.id);
            } else if (isValidUUID(pass.registration_id)) {
              await supabase.from('entry_passes').update({
                status: 'USED',
                redeemed_at: now,
                redeemed_by: isValidUUID(staffUserId) ? staffUserId : null,
                updated_at: now,
              }).eq('registration_id', pass.registration_id);
            }

            const scanPassId = isValidUUID(pass.id) ? pass.id : (isValidUUID(pass.registration_id) ? pass.registration_id : null);
            await supabase.from('entry_scans').insert({
              id: generateUUID(),
              event_id: this.event.id,
              pass_id: scanPassId,
              staff_user_id: isValidUUID(staffUserId) ? staffUserId : null,
              scan_result: 'ENTRY_APPROVED',
              scanned_at: now,
              reason_code: 'MAIN_GATE',
              request_id: requestId || `entry-${Date.now()}`,
            });

            await supabase
              .from('registrations')
              .update({
                internal_notes: JSON.stringify(updatedNotes),
                updated_at: now,
              })
              .eq('id', reg.id);
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
      // MODE 2: DINNER / FOOD SCAN (STRICT ONE-TIME USE)
      // =========================================================================
      if (scanType === 'DINNER') {
        // STRICT ENFORCEMENT: Gate Entry QR MUST be scanned at main gate first before dinner can be claimed!
        let hasCompletedGateEntry =
          Boolean(pass.redeemed_at) ||
          pass.status === 'USED' ||
          this.scans.some((s) => (s.pass_id === pass!.id || s.pass_id === pass!.registration_id) && s.scan_result === 'ENTRY_APPROVED');

        if (!hasCompletedGateEntry && reg.internal_notes) {
          try {
            const parsedNotes = typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')
              ? JSON.parse(reg.internal_notes)
              : (typeof reg.internal_notes === 'object' ? reg.internal_notes : null);
            if (parsedNotes?.gate_entry_redeemed_at) {
              hasCompletedGateEntry = true;
              pass.redeemed_at = pass.redeemed_at || parsedNotes.gate_entry_redeemed_at;
              pass.status = 'USED';
              pass.redeemed_by_name = pass.redeemed_by_name || parsedNotes.gate_entry_redeemed_by;
            }
          } catch {
            // ignore
          }
        }

        if (!hasCompletedGateEntry) {
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

        // Strict check: if dinner already claimed
        let isDinnerAlreadyClaimed =
          Boolean(pass.dinner_redeemed_at) ||
          this.scans.some((s) => (s.pass_id === pass!.id || s.pass_id === pass!.registration_id) && s.scan_result === 'DINNER_APPROVED');

        if (!isDinnerAlreadyClaimed && reg.internal_notes) {
          try {
            const parsedNotes = typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')
              ? JSON.parse(reg.internal_notes)
              : (typeof reg.internal_notes === 'object' ? reg.internal_notes : null);
            if (parsedNotes?.dinner_redeemed_at) {
              isDinnerAlreadyClaimed = true;
              pass.dinner_redeemed_at = pass.dinner_redeemed_at || parsedNotes.dinner_redeemed_at;
              pass.dinner_redeemed_by_name = pass.dinner_redeemed_by_name || parsedNotes.dinner_redeemed_by;
            }
          } catch {
            // ignore
          }
        }

        if (isDinnerAlreadyClaimed) {
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
            previous_scan_at: pass.dinner_redeemed_at || now,
            previous_staff_name: prevDinnerStaff?.display_name || pass.dinner_redeemed_by_name || 'Dinner Volunteer',
          };
        }

        // ATOMIC DINNER APPROVED
        pass.dinner_redeemed_at = now;
        pass.dinner_redeemed_by = staffUserId;
        pass.dinner_redeemed_by_name = staff.display_name;

        // Mirror dinner redemption in registrations internal_notes for 100% persistent one-time guarantee across refreshes
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
        reg.internal_notes = JSON.stringify(updatedNotes);

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
            const scanPassId = isValidUUID(pass.id) ? pass.id : (isValidUUID(pass.registration_id) ? pass.registration_id : null);
            try {
              await supabase.from('entry_scans').insert({
                id: generateUUID(),
                event_id: this.event.id,
                pass_id: scanPassId,
                staff_user_id: isValidUUID(staffUserId) ? staffUserId : null,
                scan_result: 'DINNER_APPROVED',
                scanned_at: now,
                reason_code: 'DINNER_COUNTER',
                request_id: requestId || `dinner-${Date.now()}`,
              });
            } catch {
              await supabase.from('entry_scans').insert({
                id: generateUUID(),
                event_id: this.event.id,
                pass_id: scanPassId,
                staff_user_id: isValidUUID(staffUserId) ? staffUserId : null,
                scan_result: 'ENTRY_APPROVED',
                scanned_at: now,
                reason_code: 'DINNER_COUNTER',
                request_id: requestId || `dinner-${Date.now()}`,
              });
            }

            try {
              if (isValidUUID(pass.id)) {
                await supabase
                  .from('entry_passes')
                  .update({
                    dinner_redeemed_at: now,
                    dinner_redeemed_by: isValidUUID(staffUserId) ? staffUserId : null,
                    updated_at: now,
                  })
                  .eq('id', pass.id);
              }
            } catch {
              // column might not exist in some schemas
            }

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

    const paidRegIds = new Set(this.registrations.filter((r) => r.payment_status === 'PAID').map((r) => r.id));
    const validPassesIssued = this.passes.filter(
      (p) => paidRegIds.has(p.registration_id) && (p.status === 'VALID' || p.status === 'USED')
    ).length;
    // Filter by paid for food and academic counts
    const paidList = this.registrations.filter((r) => r.payment_status === 'PAID' && !r.cancelled_at);

    // Gate entry tally
    let totalEntries = 0;
    for (const r of paidList) {
      const pass = this.passes.find((p) => p.registration_id === r.id);
      let isGateCheckedIn = Boolean(pass && (pass.status === 'USED' || Boolean(pass.redeemed_at)));
      if (!isGateCheckedIn && r.internal_notes) {
        try {
          const notes = JSON.parse(r.internal_notes);
          if (notes.gate_entry_redeemed_at) isGateCheckedIn = true;
        } catch {
          // ignore
        }
      }
      if (!isGateCheckedIn) {
        const passId = pass?.id;
        if (
          this.scans.some(
            (s) =>
              ((passId && s.pass_id === passId) || s.pass_id === r.id || s.roll_number === r.normalized_roll_number) &&
              s.scan_result === 'ENTRY_APPROVED'
          )
        ) {
          isGateCheckedIn = true;
        }
      }
      if (isGateCheckedIn) {
        totalEntries++;
      }
    }
    const notCheckedIn = Math.max(0, paidRegistrations - totalEntries);

    const fyCount = paidList.filter((r) => r.academic_year.startsWith('FY')).length;
    const syCount = paidList.filter((r) => r.academic_year.startsWith('SY')).length;
    const regularFoodCount = paidList.filter((r) => r.food_preference === 'Regular').length;
    const jainFoodCount = paidList.filter((r) => r.food_preference === 'Jain').length;
    const cancelledCount = this.registrations.filter((r) => !r.cancelled_at).length;

    // Dinner distribution tallies
    let totalDinnersClaimed = 0;
    let regularDinnersClaimed = 0;
    let jainDinnersClaimed = 0;

    for (const r of paidList) {
      const pass = this.passes.find((p) => p.registration_id === r.id);
      let isDinnerClaimed = Boolean(pass?.dinner_redeemed_at);
      if (!isDinnerClaimed && r.internal_notes) {
        try {
          const notes = JSON.parse(r.internal_notes);
          if (notes.dinner_redeemed_at) isDinnerClaimed = true;
        } catch {
          // ignore
        }
      }
      if (!isDinnerClaimed) {
        const passId = pass?.id;
        if (
          this.scans.some(
            (s) =>
              ((passId && s.pass_id === passId) || s.pass_id === r.id || s.roll_number === r.normalized_roll_number) &&
              (s.scan_result === 'DINNER_APPROVED' || s.reason_code === 'DINNER_COUNTER' || s.scan_type === 'DINNER')
          )
        ) {
          isDinnerClaimed = true;
        }
      }
      if (isDinnerClaimed) {
        totalDinnersClaimed++;
        if (r.food_preference === 'Jain') {
          jainDinnersClaimed++;
        } else {
          regularDinnersClaimed++;
        }
      }
    }
    const dinnersNotClaimed = Math.max(0, paidRegistrations - totalDinnersClaimed);

    const totalRevenueMinorUnits = paidList.reduce((sum, r) => sum + r.expected_amount_minor_units, 0);

    return {
      totalRegistrations,
      paidRegistrations,
      pendingVerifications,
      failedOrRejected,
      validPassesIssued,
      totalEntries,
      notCheckedIn,
      totalDinnersClaimed,
      dinnersNotClaimed,
      regularDinnersClaimed,
      jainDinnersClaimed,
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
      let pass: EntryPass | undefined = undefined;
      if (reg.payment_status === 'PAID') {
        pass = this.passes.find((p) => p.registration_id === reg.id);
        if (!pass) {
          pass = {
            id: `pass-${reg.id}`,
            registration_id: reg.id,
            token_hash: '',
            status: 'VALID',
            issued_at: reg.created_at,
          };
        }
      }
      if (pass) {
        pass = { ...pass };
        if (reg.internal_notes) {
          try {
            const notes =
              typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')
                ? JSON.parse(reg.internal_notes)
                : typeof reg.internal_notes === 'object'
                ? (reg.internal_notes as Record<string, unknown>)
                : null;
            if (notes?.gate_entry_redeemed_at) {
              pass.redeemed_at = pass.redeemed_at || (notes.gate_entry_redeemed_at as string);
              pass.status = 'USED';
              pass.redeemed_by_name = pass.redeemed_by_name || (notes.gate_entry_redeemed_by as string);
            }
            if (notes?.dinner_redeemed_at) {
              pass.dinner_redeemed_at = pass.dinner_redeemed_at || (notes.dinner_redeemed_at as string);
              pass.dinner_redeemed_by_name = pass.dinner_redeemed_by_name || (notes.dinner_redeemed_by as string);
            }
          } catch {
            // ignore
          }
        }
        // Also check scans list matching by pass ID, registration ID, or roll number!
        const dinnerScan = this.scans.find(
          (s) =>
            (s.pass_id === pass!.id || s.pass_id === reg.id || s.roll_number === reg.normalized_roll_number) &&
            s.scan_result === 'DINNER_APPROVED'
        );
        if (dinnerScan) {
          pass.dinner_redeemed_at = pass.dinner_redeemed_at || dinnerScan.scanned_at;
          pass.dinner_redeemed_by_name = pass.dinner_redeemed_by_name || dinnerScan.staff_name;
        }
        const entryScan = this.scans.find(
          (s) =>
            (s.pass_id === pass!.id || s.pass_id === reg.id || s.roll_number === reg.normalized_roll_number) &&
            s.scan_result === 'ENTRY_APPROVED'
        );
        if (entryScan) {
          pass.redeemed_at = pass.redeemed_at || entryScan.scanned_at;
          pass.status = 'USED';
          pass.redeemed_by_name = pass.redeemed_by_name || entryScan.staff_name;
        }
      }
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
    const unifiedScans: EntryScanLog[] = [];
    const seenScanKeys = new Set<string>();

    // 1. Explicit scan records in storage
    const rawList = staffId ? this.scans.filter((s) => s.staff_user_id === staffId) : this.scans;
    for (const scan of rawList) {
      const linkedPass = this.passes.find((p) => p.id === scan.pass_id || p.registration_id === scan.pass_id);
      const linkedReg = this.registrations.find(
        (r) => r.id === scan.pass_id || (linkedPass && r.id === linkedPass.registration_id)
      );

      const rollWithInfix = linkedReg
        ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year)
        : scan.roll_number;

      const isDinner = scan.scan_type === 'DINNER' || scan.scan_result === 'DINNER_APPROVED' || scan.reason_code === 'DINNER_COUNTER';
      const scanKey = `${linkedReg?.id || scan.pass_id || ''}_${isDinner ? 'DINNER' : 'GATE'}_${scan.scan_result}_${(scan.scanned_at || '').slice(0, 16)}`;
      seenScanKeys.add(scanKey);

      unifiedScans.push({
        ...scan,
        scan_type: isDinner ? 'DINNER' : 'ENTRY',
        student_name: scan.student_name || linkedReg?.full_name,
        roll_number: rollWithInfix,
        food_preference: scan.food_preference || linkedReg?.food_preference,
      });
    }

    // 2. Synthesize missing Gate Check-ins & Dinner claims from passes / registrations
    for (const pass of this.passes) {
      const linkedReg = this.registrations.find((r) => r.id === pass.registration_id);
      if (!linkedReg) continue;
      const rollWithInfix = formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year);

      // Gate Admission scan
      if (pass.redeemed_at || pass.status === 'USED') {
        const scanTime = pass.redeemed_at || linkedReg.updated_at || linkedReg.created_at;
        const gateKey = `${linkedReg.id}_GATE_ENTRY_APPROVED_${scanTime.slice(0, 16)}`;
        if (!seenScanKeys.has(gateKey)) {
          seenScanKeys.add(gateKey);
          unifiedScans.push({
            id: `scan-gate-${pass.id}`,
            event_id: this.event.id,
            pass_id: pass.id,
            scan_type: 'ENTRY',
            staff_user_id: pass.redeemed_by || 'staff-gate',
            staff_name: pass.redeemed_by_name || 'Gate Volunteer',
            scan_result: 'ENTRY_APPROVED',
            scanned_at: scanTime,
            request_id: `gate-${pass.id.slice(0, 8)}`,
            student_name: linkedReg.full_name,
            roll_number: rollWithInfix,
            food_preference: linkedReg.food_preference,
          });
        }
      }

      // Dinner Meal scan
      if (pass.dinner_redeemed_at) {
        const scanTime = pass.dinner_redeemed_at;
        const dinnerKey = `${linkedReg.id}_DINNER_DINNER_APPROVED_${scanTime.slice(0, 16)}`;
        if (!seenScanKeys.has(dinnerKey)) {
          seenScanKeys.add(dinnerKey);
          unifiedScans.push({
            id: `scan-din-${pass.id}`,
            event_id: this.event.id,
            pass_id: pass.id,
            scan_type: 'DINNER',
            staff_user_id: pass.dinner_redeemed_by || 'staff-dinner',
            staff_name: pass.dinner_redeemed_by_name || 'Dinner Volunteer',
            scan_result: 'DINNER_APPROVED',
            scanned_at: scanTime,
            request_id: `dinner-${pass.id.slice(0, 8)}`,
            student_name: linkedReg.full_name,
            roll_number: rollWithInfix,
            food_preference: linkedReg.food_preference,
          });
        }
      }
    }

    // Chronologically sort: latest scans first
    unifiedScans.sort((a, b) => new Date(b.scanned_at || 0).getTime() - new Date(a.scanned_at || 0).getTime());
    return unifiedScans;
  }

  public getAuditLogs(): AuditLog[] {
    const unifiedLogs: AuditLog[] = [];
    const seenLogKeys = new Set<string>();

    // 1. Explicit Administrative & System Audit Logs (from Supabase + local storage)
    for (const log of this.auditLogs) {
      if (!log.created_at) continue;
      const key = `${log.action}::${log.target_type}::${log.target_id || ''}::${log.created_at.slice(0, 16)}`;
      if (!seenLogKeys.has(key)) {
        seenLogKeys.add(key);
        unifiedLogs.push(log);
      }
    }

    // 2. Synthesize Historical & Live Events for Every Student Registration ("ab tak ki aur aage ki bhi")
    for (const reg of this.registrations) {
      if (!reg.created_at) continue;
      const formattedRoll = formatRollWithCoursePrefix(reg.normalized_roll_number, reg.academic_year);
      const regKey = `STUDENT_REGISTRATION::registration::${formattedRoll}::${reg.created_at.slice(0, 16)}`;
      if (!seenLogKeys.has(regKey)) {
        seenLogKeys.add(regKey);
        unifiedLogs.push({
          id: `synth-reg-${reg.id}`,
          actor_name: reg.full_name,
          event_id: reg.event_id || this.event.id,
          action: 'STUDENT_REGISTRATION',
          target_type: 'registration',
          target_id: formattedRoll,
          reason: `Student registered for ${reg.academic_year} | Meal: ${reg.food_preference} Dinner | Contact: ${reg.contact_number}${reg.performance_talent ? ` | Talent: ${reg.performance_talent}` : ''}`,
          metadata: {
            registration_id: reg.id,
            roll_number: reg.normalized_roll_number,
            academic_year: reg.academic_year,
            food_preference: reg.food_preference,
            contact_number: reg.contact_number,
          },
          created_at: reg.created_at,
        });
      }
    }

    // 3. Synthesize Historical & Live Payment Submissions & Verifications
    for (const pay of this.payments) {
      const linkedReg = this.registrations.find((r) => r.id === pay.registration_id);
      const studentName = linkedReg?.full_name || 'Student';
      const formattedRoll = linkedReg
        ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year)
        : pay.registration_id;
      const amountRupees = (pay.expected_amount_minor_units / 100).toFixed(0);

      // 3a. Payment Submission Event
      if (pay.created_at) {
        const subKey = `PAYMENT_SUBMITTED::payment::${pay.transaction_reference || pay.id}::${pay.created_at.slice(0, 16)}`;
        if (!seenLogKeys.has(subKey)) {
          seenLogKeys.add(subKey);
          unifiedLogs.push({
            id: `synth-pay-sub-${pay.id}`,
            actor_name: studentName,
            event_id: this.event.id,
            action: 'PAYMENT_SUBMITTED',
            target_type: 'payment',
            target_id: pay.transaction_reference ? `UTR: ${pay.transaction_reference}` : formattedRoll,
            reason: `Submitted ₹${amountRupees} payment claim (${pay.provider || 'UPI'})${pay.transaction_reference ? ` with UTR ${pay.transaction_reference}` : ''} for Roll ${formattedRoll}`,
            metadata: {
              payment_id: pay.id,
              registration_id: pay.registration_id,
              transaction_reference: pay.transaction_reference,
              expected_amount_minor_units: pay.expected_amount_minor_units,
              screenshot_url: pay.screenshot_url,
            },
            created_at: pay.created_at,
          });
        }
      }

      // 3b. Payment Verified / Approved Event
      if (pay.status === 'PAID' || linkedReg?.payment_status === 'PAID') {
        const verifyTimestamp = pay.verified_at || pay.updated_at || pay.created_at;
        const verKey = `PAYMENT_VERIFIED::payment::${formattedRoll}::${verifyTimestamp.slice(0, 16)}`;
        if (!seenLogKeys.has(verKey)) {
          seenLogKeys.add(verKey);
          unifiedLogs.push({
            id: `synth-pay-ver-${pay.id}`,
            actor_name: pay.verified_by_name || pay.verified_by || 'Admin',
            event_id: this.event.id,
            action: 'PAYMENT_VERIFIED',
            target_type: 'payment',
            target_id: formattedRoll,
            reason: `Payment verified & approved (₹${amountRupees}). Official QR Pass issued for ${studentName} (${formattedRoll})${pay.transaction_reference ? ` [UTR: ${pay.transaction_reference}]` : ''}`,
            metadata: {
              payment_id: pay.id,
              registration_id: pay.registration_id,
              transaction_reference: pay.transaction_reference,
            },
            created_at: verifyTimestamp,
          });
        }
      } else if (pay.status === 'REJECTED') {
        // 3c. Payment Rejected Event
        const rejTimestamp = pay.updated_at || pay.created_at;
        const rejKey = `PAYMENT_REJECTED::payment::${pay.transaction_reference || pay.id}::${rejTimestamp.slice(0, 16)}`;
        if (!seenLogKeys.has(rejKey)) {
          seenLogKeys.add(rejKey);
          unifiedLogs.push({
            id: `synth-pay-rej-${pay.id}`,
            actor_name: 'Admin',
            event_id: this.event.id,
            action: 'PAYMENT_REJECTED',
            target_type: 'payment',
            target_id: pay.transaction_reference ? `UTR: ${pay.transaction_reference}` : formattedRoll,
            reason: `Payment claim rejected for ${studentName} (${formattedRoll}). ${pay.rejection_reason ? `Reason: ${pay.rejection_reason}` : 'UTR reference mismatch or invalid proof.'}`,
            metadata: {
              payment_id: pay.id,
              registration_id: pay.registration_id,
              rejection_reason: pay.rejection_reason,
            },
            created_at: rejTimestamp,
          });
        }
      }
    }

    // 4. Synthesize Gate Check-ins & Dinner Scans
    for (const scan of this.scans) {
      if (!scan.scanned_at) continue;
      const isDinner = scan.scan_type === 'DINNER' || scan.scan_result === 'DINNER_APPROVED' || scan.reason_code === 'DINNER_APPROVED';
      const actionName = isDinner
        ? 'DINNER_MEAL_CLAIMED'
        : (scan.scan_result === 'ENTRY_APPROVED' ? 'GATE_ENTRY_APPROVED' : (scan.scan_result || 'GATE_ENTRY_SCAN'));
      const scanKey = `${actionName}::${isDinner ? 'food_coupon' : 'entry_pass'}::${scan.roll_number || scan.pass_id || ''}::${scan.scanned_at.slice(0, 16)}`;

      if (!seenLogKeys.has(scanKey)) {
        seenLogKeys.add(scanKey);
        unifiedLogs.push({
          id: `synth-scan-${scan.id}`,
          actor_name: scan.staff_name || (isDinner ? 'Dinner Volunteer' : 'Gate Volunteer'),
          event_id: scan.event_id || this.event.id,
          action: actionName,
          target_type: isDinner ? 'food_coupon' : 'entry_pass',
          target_id: scan.roll_number || 'Pass Scan',
          reason: isDinner
            ? `Dinner meal claimed by ${scan.student_name || 'Student'} (${scan.food_preference || 'Regular'} Dinner)`
            : `Gate check-in recorded for ${scan.student_name || 'Student'} (${scan.roll_number || 'Roll'}). Scan Result: ${scan.scan_result}`,
          metadata: {
            scan_id: scan.id,
            roll_number: scan.roll_number,
            student_name: scan.student_name,
            scan_result: scan.scan_result,
          },
          created_at: scan.scanned_at,
        });
      }
    }

    // 5. Synthesize Pricing History Adjustments
    for (const ph of this.pricingHistory) {
      if (!ph.created_at) continue;
      const priceKey = `PRICE_ADJUSTED::pricing::${ph.id}::${ph.created_at.slice(0, 16)}`;
      if (!seenLogKeys.has(priceKey)) {
        seenLogKeys.add(priceKey);
        unifiedLogs.push({
          id: `synth-price-${ph.id}`,
          actor_name: ph.changed_by_name || 'System Admin',
          event_id: ph.event_id || this.event.id,
          action: 'PRICE_ADJUSTED',
          target_type: 'pricing',
          target_id: `₹${(ph.new_fee_minor_units / 100).toFixed(0)}`,
          reason: `Registration price modified from ₹${(ph.previous_fee_minor_units / 100).toFixed(0)} to ₹${(ph.new_fee_minor_units / 100).toFixed(0)}. Justification: ${ph.change_reason || 'Administrative pricing adjustment'}`,
          metadata: {
            pricing_id: ph.id,
            previous_fee: ph.previous_fee_minor_units,
            new_fee: ph.new_fee_minor_units,
          },
          created_at: ph.created_at,
        });
      }
    }

    // 6. Chronologically Sort: Newest First
    unifiedLogs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    return unifiedLogs;
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
    const newLog: AuditLog = {
      id: generateUUID(),
      actor_user_id: actorId,
      actor_name: actor?.display_name || 'System / Admin',
      event_id: this.event.id,
      action,
      target_type: targetType,
      target_id: targetId,
      reason,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(newLog);
    this.persist();

    // Asynchronously insert into Supabase audit_logs table
    if (isSupabaseConfigured && supabase) {
      (async () => {
        try {
          const { error } = await supabase.from('audit_logs').insert({
            id: newLog.id,
            actor_user_id: actorId && actorId.length === 36 ? actorId : null,
            event_id: this.event.id && this.event.id.length === 36 ? this.event.id : null,
            action: newLog.action,
            target_type: newLog.target_type,
            target_id: newLog.target_id || null,
            reason: newLog.reason || null,
            metadata: newLog.metadata || {},
            created_at: newLog.created_at,
          });
          if (error) console.warn('Supabase audit_log insert error:', error.message);
        } catch (err: unknown) {
          console.warn('Supabase audit_log insert exception:', err);
        }
      })();
    }
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
    if (this.syncPromise) {
      return this.syncPromise;
    }
    this.syncPromise = this.doInitSupabase().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async doInitSupabase(): Promise<{ success: boolean; registrationsCount: number; paymentsCount: number }> {
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
            internal_notes: row.internal_notes, // Authoritative gate and dinner redemption state
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        }

        // Authoritative Database Sync: Supabase is the single source of truth when online.
        // If a registration was deleted from Supabase, remove it locally so it disappears from the dashboard.
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

        // Authoritative Database Sync for Payments: only keep payments belonging to existing registrations
        this.payments = fetchedPays.filter((p) => this.registrations.some((r) => r.id === p.registration_id));
      }

      // 4. Fetch Entry Passes from Supabase
      const { data: passRows } = await supabase.from('entry_passes').select('*');
      const fetchedPasses: EntryPass[] = [];
      if (passRows) {
        for (const row of passRows) {
          if (row.id.toLowerCase().includes('dummy') || row.id.startsWith('pass-seed-')) continue;
          const existingLocal = this.passes.find((p) => p.id === row.id || p.registration_id === row.registration_id);
          fetchedPasses.push({
            id: row.id,
            registration_id: row.registration_id,
            token_hash: row.token_hash,
            status: (row.status === 'USED' || row.redeemed_at || existingLocal?.redeemed_at) ? 'USED' : (row.status || 'VALID'),
            issued_at: row.issued_at,
            redeemed_at: row.redeemed_at || existingLocal?.redeemed_at || undefined,
            redeemed_by: row.redeemed_by || existingLocal?.redeemed_by || undefined,
            dinner_redeemed_at: row.dinner_redeemed_at || existingLocal?.dinner_redeemed_at || undefined,
            dinner_redeemed_by: row.dinner_redeemed_by || existingLocal?.dinner_redeemed_by || undefined,
            dinner_redeemed_by_name: existingLocal?.dinner_redeemed_by_name || undefined,
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
          const isDinner = row.reason_code === 'DINNER_APPROVED' || row.reason_code === 'DINNER_COUNTER' || row.scan_result === 'DINNER_APPROVED';

          // Match scan pass_id with fetchedPasses or registrations
          const linkedPass = fetchedPasses.find((p) => p.id === row.pass_id || p.registration_id === row.pass_id) || this.passes.find((p) => p.id === row.pass_id || p.registration_id === row.pass_id);
          const linkedReg = this.registrations.find(
            (r) => r.id === row.pass_id || (linkedPass && r.id === linkedPass.registration_id)
          );

          // If the student registration was deleted in Supabase, DO NOT keep the orphaned scan!
          if (row.pass_id && !linkedReg) {
            continue;
          }

          const staffUser = this.profiles.find((p) => p.id === row.staff_user_id);
          const rollWithInfix = linkedReg
            ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year)
            : undefined;

          fetchedScans.push({
            id: row.id,
            event_id: row.event_id,
            pass_id: row.pass_id || undefined,
            staff_user_id: row.staff_user_id,
            staff_name: staffUser?.display_name || (isDinner ? 'Dinner Volunteer' : 'Gate Volunteer'),
            scan_result: isDinner ? 'DINNER_APPROVED' : row.scan_result,
            scanned_at: row.scanned_at || row.created_at || new Date().toISOString(),
            request_id: row.request_id || undefined,
            student_name: linkedReg?.full_name,
            roll_number: rollWithInfix,
            food_preference: linkedReg?.food_preference,
            scan_type: isDinner ? 'DINNER' : 'ENTRY',
          });
        }
        // Authoritative scan sync: only keep scans belonging to existing registrations in the database
        this.scans = fetchedScans.filter((s) => {
          if (!s.pass_id) return false;
          return this.registrations.some(
            (r) => r.id === s.pass_id || fetchedPasses.some((p) => p.registration_id === r.id && p.id === s.pass_id)
          );
        });
      }

      // 5b. Fetch Cloud Audit Logs from Supabase
      try {
        const { data: auditRows } = await supabase.from('audit_logs').select('*');
        if (auditRows && auditRows.length > 0) {
          for (const row of auditRows) {
            if (!this.auditLogs.some((a) => a.id === row.id)) {
              const staffUser = this.profiles.find((p) => p.id === row.actor_user_id);
              this.auditLogs.push({
                id: row.id,
                actor_user_id: row.actor_user_id,
                actor_name: row.actor_name || staffUser?.display_name || 'System / Admin',
                event_id: row.event_id,
                action: row.action,
                target_type: row.target_type,
                target_id: row.target_id,
                reason: row.reason,
                metadata: row.metadata,
                created_at: row.created_at || new Date().toISOString(),
              });
            }
          }
        }
      } catch (auditFetchErr) {
        console.warn('Supabase audit_logs sync notice:', auditFetchErr);
      }

      // 6. Cross-link Dinner & Gate Redemptions onto passes from scans, local state, and registration notes
      for (const pass of fetchedPasses) {
        // Check existing local pass state to guarantee no reset on page refresh
        const existingLocal = this.passes.find((p) => p.id === pass.id || p.registration_id === pass.registration_id);
        if (existingLocal?.dinner_redeemed_at && !pass.dinner_redeemed_at) {
          pass.dinner_redeemed_at = existingLocal.dinner_redeemed_at;
          pass.dinner_redeemed_by = existingLocal.dinner_redeemed_by;
          pass.dinner_redeemed_by_name = existingLocal.dinner_redeemed_by_name;
        }
        if (pass.status !== 'VALID' && existingLocal?.redeemed_at && !pass.redeemed_at) {
          pass.redeemed_at = existingLocal.redeemed_at;
          pass.status = 'USED';
          pass.redeemed_by_name = existingLocal.redeemed_by_name;
        }

        const dinnerScan = fetchedScans.find((s) => (s.pass_id === pass.id || s.pass_id === pass.registration_id) && s.scan_result === 'DINNER_APPROVED');
        if (dinnerScan) {
          pass.dinner_redeemed_at = pass.dinner_redeemed_at || dinnerScan.scanned_at;
          pass.dinner_redeemed_by = pass.dinner_redeemed_by || dinnerScan.staff_user_id;
        }

        const linkedReg = this.registrations.find((r) => r.id === pass.registration_id);
        if (linkedReg?.internal_notes) {
          try {
            if (typeof linkedReg.internal_notes === 'string' && linkedReg.internal_notes.startsWith('{')) {
              const parsed = JSON.parse(linkedReg.internal_notes);
              if (parsed.dinner_redeemed_at) {
                pass.dinner_redeemed_at = parsed.dinner_redeemed_at;
                pass.dinner_redeemed_by = parsed.dinner_redeemed_by;
                pass.dinner_redeemed_by_name = parsed.dinner_redeemed_by;
              }
              if (parsed.gate_entry_redeemed_at) {
                pass.redeemed_at = parsed.gate_entry_redeemed_at;
                pass.status = 'USED';
                pass.redeemed_by_name = parsed.gate_entry_redeemed_by;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!pass.redeemed_at) {
          const entryScan = fetchedScans.find((s) => (s.pass_id === pass.id || s.pass_id === pass.registration_id) && s.scan_result === 'ENTRY_APPROVED');
          if (entryScan) {
            pass.redeemed_at = entryScan.scanned_at;
            pass.status = 'USED';
          }
        }
      }

      // Authoritative pass list: keep strictly 1 pass per verified PAID registration
      const paidRegMap = new Map<string, Registration>();
      for (const reg of this.registrations) {
        if (reg.payment_status === 'PAID') {
          paidRegMap.set(reg.id, reg);
        }
      }

      // Group passes by registration_id and deduplicate (prefer USED / redeemed or latest issued)
      const passesByReg = new Map<string, EntryPass[]>();
      const surplusPassIds: string[] = [];

      for (const p of fetchedPasses as EntryPass[]) {
        if (!paidRegMap.has(p.registration_id)) {
          // Pass does not belong to a verified PAID registration -> mark for cleanup
          surplusPassIds.push(p.id);
          continue;
        }
        if (!passesByReg.has(p.registration_id)) {
          passesByReg.set(p.registration_id, []);
        }
        passesByReg.get(p.registration_id)!.push(p);
      }

      const deduplicatedPasses: EntryPass[] = [];
      passesByReg.forEach((regPasses) => {
        regPasses.sort((a, b) => {
          const aUsed = a.status === 'USED' || Boolean(a.redeemed_at);
          const bUsed = b.status === 'USED' || Boolean(b.redeemed_at);
          if (aUsed && !bUsed) return -1;
          if (!aUsed && bUsed) return 1;
          return new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime();
        });
        deduplicatedPasses.push(regPasses[0]);
        for (let i = 1; i < regPasses.length; i++) {
          surplusPassIds.push(regPasses[i].id);
        }
      });

      this.passes = deduplicatedPasses;

      // Clean up surplus duplicate pass rows from cloud database asynchronously
      if (surplusPassIds.length > 0 && isSupabaseConfigured && supabase) {
        try {
          for (let i = 0; i < surplusPassIds.length; i += 50) {
            const batch = surplusPassIds.slice(i, i + 50);
            await supabase.from('entry_passes').delete().in('id', batch);
          }
        } catch (cleanErr) {
          console.warn('Surplus duplicate passes cleanup notice:', cleanErr);
        }
      }

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

  // High-frequency lightweight live poller (runs in ~40ms without heavy initSupabase)
  public async syncLiveScanStatuses(): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const [scansRes, passesRes, regsRes] = await Promise.all([
        supabase
          .from('entry_scans')
          .select('id, event_id, pass_id, staff_user_id, scan_result, scanned_at, reason_code')
          .order('scanned_at', { ascending: false })
          .limit(100),
        supabase
          .from('entry_passes')
          .select('id, registration_id, status, redeemed_at, dinner_redeemed_at, redeemed_by, dinner_redeemed_by'),
        supabase
          .from('registrations')
          .select('id, internal_notes, payment_status'),
      ]);

      let stateChanged = false;

      // 1. Synchronize passes
      if (passesRes.data) {
        for (const row of passesRes.data) {
          const pass = this.passes.find((p) => p.id === row.id || p.registration_id === row.registration_id);
          if (pass) {
            const rowRedeemed = row.redeemed_at || undefined;
            const rowDinner = row.dinner_redeemed_at || undefined;
            const rowStatus = row.status || pass.status;

            if (pass.status !== rowStatus || pass.redeemed_at !== rowRedeemed || pass.dinner_redeemed_at !== rowDinner) {
              pass.status = rowStatus;
              pass.redeemed_at = rowRedeemed;
              pass.dinner_redeemed_at = rowDinner;
              if (row.redeemed_by) pass.redeemed_by = row.redeemed_by;
              if (row.dinner_redeemed_by) pass.dinner_redeemed_by = row.dinner_redeemed_by;
              stateChanged = true;
            }
          }
        }
      }

      // 2. Synchronize registrations
      if (regsRes.data) {
        for (const row of regsRes.data) {
          const reg = this.registrations.find((r) => r.id === row.id);
          if (reg) {
            if (reg.payment_status !== row.payment_status) {
              reg.payment_status = row.payment_status;
              stateChanged = true;
            }
            if (reg.internal_notes !== row.internal_notes) {
              reg.internal_notes = row.internal_notes;
              stateChanged = true;
            }
          }
        }
      }

      // 3. Synchronize scans
      if (scansRes.data) {
        for (const row of scansRes.data) {
          if (row.id.toLowerCase().includes('dummy') || row.id.startsWith('scan-seed-')) continue;
          if (!this.scans.some((s) => s.id === row.id)) {
            const isDinner =
              row.reason_code === 'DINNER_APPROVED' ||
              row.reason_code === 'DINNER_COUNTER' ||
              row.scan_result === 'DINNER_APPROVED';
            const linkedReg = this.registrations.find(
              (r) => r.id === row.pass_id || this.passes.some((p) => p.registration_id === r.id && p.id === row.pass_id)
            );
            const staffUser = this.profiles.find((p) => p.id === row.staff_user_id);
            const rollWithInfix = linkedReg
              ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year)
              : undefined;

            this.scans.unshift({
              id: row.id,
              event_id: row.event_id || this.event.id,
              pass_id: row.pass_id || undefined,
              staff_user_id: row.staff_user_id,
              staff_name: staffUser?.display_name || (isDinner ? 'Dinner Volunteer' : 'Gate Volunteer'),
              scan_result: isDinner ? 'DINNER_APPROVED' : (row.scan_result || 'ENTRY_APPROVED'),
              scanned_at: row.scanned_at || new Date().toISOString(),
              student_name: linkedReg?.full_name,
              roll_number: rollWithInfix,
              food_preference: linkedReg?.food_preference,
              scan_type: isDinner ? 'DINNER' : 'ENTRY',
            });
            stateChanged = true;
          }
        }
      }

      if (stateChanged) {
        this.persist();
      }

      return stateChanged;
    } catch (err) {
      console.warn('syncLiveScanStatuses poll notice:', err);
      return false;
    }
  }

  public subscribeToRealtimeChanges(callback: () => void): (() => void) | undefined {
    if (!isSupabaseConfigured || !supabase) return undefined;
    try {
      const handleRealtimePayload = (table: string, payload: { eventType: string; new?: any; old?: any }) => {
        try {
          const eventType = payload.eventType;
          const newRow = payload.new;
          const oldRow = payload.old;

          if (table === 'entry_scans') {
            if (eventType === 'INSERT' && newRow) {
              const isDinner =
                newRow.reason_code === 'DINNER_APPROVED' ||
                newRow.reason_code === 'DINNER_COUNTER' ||
                newRow.scan_result === 'DINNER_APPROVED';
              const linkedReg = this.registrations.find(
                (r) => r.id === newRow.pass_id || this.passes.some((p) => p.registration_id === r.id && p.id === newRow.pass_id)
              );
              const linkedPass = this.passes.find((p) => p.id === newRow.pass_id || p.registration_id === newRow.pass_id);
              const staffUser = this.profiles.find((p) => p.id === newRow.staff_user_id);

              const scanObj: EntryScanLog = {
                id: newRow.id,
                event_id: newRow.event_id || this.event.id,
                pass_id: newRow.pass_id || undefined,
                staff_user_id: newRow.staff_user_id,
                staff_name: staffUser?.display_name || (isDinner ? 'Dinner Volunteer' : 'Gate Volunteer'),
                scan_result: isDinner ? 'DINNER_APPROVED' : (newRow.scan_result || 'ENTRY_APPROVED'),
                scanned_at: newRow.scanned_at || newRow.created_at || new Date().toISOString(),
                request_id: newRow.request_id || undefined,
                student_name: linkedReg?.full_name,
                roll_number: linkedReg ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year) : undefined,
                food_preference: linkedReg?.food_preference,
                scan_type: isDinner ? 'DINNER' : 'ENTRY',
              };

              const existingIdx = this.scans.findIndex((s) => s.id === newRow.id);
              if (existingIdx >= 0) {
                this.scans[existingIdx] = scanObj;
              } else {
                this.scans.unshift(scanObj);
              }

              if (linkedPass) {
                if (isDinner) {
                  linkedPass.dinner_redeemed_at = linkedPass.dinner_redeemed_at || scanObj.scanned_at;
                  linkedPass.dinner_redeemed_by = linkedPass.dinner_redeemed_by || scanObj.staff_user_id;
                  linkedPass.dinner_redeemed_by_name = linkedPass.dinner_redeemed_by_name || scanObj.staff_name;
                } else if (scanObj.scan_result === 'ENTRY_APPROVED') {
                  linkedPass.redeemed_at = linkedPass.redeemed_at || scanObj.scanned_at;
                  linkedPass.redeemed_by = linkedPass.redeemed_by || scanObj.staff_user_id;
                  linkedPass.redeemed_by_name = linkedPass.redeemed_by_name || scanObj.staff_name;
                  linkedPass.status = 'USED';
                }
              }

              if (linkedReg) {
                let notes: Record<string, unknown> = {};
                if (linkedReg.internal_notes) {
                  try {
                    notes = typeof linkedReg.internal_notes === 'string' ? JSON.parse(linkedReg.internal_notes) : linkedReg.internal_notes;
                  } catch {
                    notes = {};
                  }
                }
                if (isDinner) {
                  notes.dinner_redeemed_at = scanObj.scanned_at;
                  notes.dinner_redeemed_by = scanObj.staff_name;
                } else if (scanObj.scan_result === 'ENTRY_APPROVED') {
                  notes.gate_entry_redeemed_at = scanObj.scanned_at;
                  notes.gate_entry_redeemed_by = scanObj.staff_name;
                }
                linkedReg.internal_notes = JSON.stringify(notes);
              }
            } else if (eventType === 'DELETE' && oldRow) {
              this.scans = this.scans.filter((s) => s.id !== oldRow.id);
            }
          } else if (table === 'entry_passes') {
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
              const pass = this.passes.find((p) => p.id === newRow.id || p.registration_id === newRow.registration_id);
              if (pass) {
                pass.status = newRow.status || pass.status;
                pass.redeemed_at = newRow.redeemed_at || undefined;
                pass.redeemed_by = newRow.redeemed_by || undefined;
                if (newRow.dinner_redeemed_at !== undefined) {
                  pass.dinner_redeemed_at = newRow.dinner_redeemed_at || undefined;
                }
                if (newRow.dinner_redeemed_by !== undefined) {
                  pass.dinner_redeemed_by = newRow.dinner_redeemed_by || undefined;
                }
              }
            }
          } else if (table === 'registrations') {
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
              const regIdx = this.registrations.findIndex((r) => r.id === newRow.id);
              if (regIdx >= 0) {
                this.registrations[regIdx] = {
                  ...this.registrations[regIdx],
                  ...newRow,
                };
                if (newRow.internal_notes) {
                  try {
                    const notes = JSON.parse(newRow.internal_notes);
                    const pass = this.passes.find((p) => p.registration_id === newRow.id);
                    if (pass) {
                      if (notes.gate_entry_redeemed_at) {
                        pass.redeemed_at = notes.gate_entry_redeemed_at;
                        pass.status = 'USED';
                      }
                      if (notes.dinner_redeemed_at) {
                        pass.dinner_redeemed_at = notes.dinner_redeemed_at;
                      }
                    }
                  } catch {
                    // ignore
                  }
                }
              } else if (eventType === 'INSERT') {
                this.registrations.unshift(newRow);
              }
            } else if (eventType === 'DELETE' && oldRow) {
              this.registrations = this.registrations.filter((r) => r.id !== oldRow.id);
            }
          } else if (table === 'payments') {
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRow) {
              const payIdx = this.payments.findIndex((p) => p.id === newRow.id);
              if (payIdx >= 0) {
                this.payments[payIdx] = { ...this.payments[payIdx], ...newRow };
              } else {
                this.payments.unshift(newRow);
              }
            } else if (eventType === 'DELETE' && oldRow) {
              this.payments = this.payments.filter((p) => p.id !== oldRow.id);
            }
          }

          this.persist();
        } catch (e) {
          console.warn('Realtime payload fast-sync notice:', e);
        }

        // Instant callback without delay for immediate DOM reactivity!
        callback();
      };

      const channel = supabase
        .channel('realtime_event_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, (payload) => handleRealtimePayload('registrations', payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload) => handleRealtimePayload('payments', payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_passes' }, (payload) => handleRealtimePayload('entry_passes', payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_scans' }, (payload) => handleRealtimePayload('entry_scans', payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, (payload) => handleRealtimePayload('audit_logs', payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_history' }, (payload) => handleRealtimePayload('pricing_history', payload))
        .subscribe();

      return () => {
        try {
          if (this.realtimeDebounceTimer) {
            clearTimeout(this.realtimeDebounceTimer);
          }
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
