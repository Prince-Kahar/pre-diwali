import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeRollNumber, normalizeContactNumber, registrationSchema, manualPaymentClaimSchema, formatRollWithCoursePrefix } from '../src/lib/validation';
import { hashToken, generatePassToken, maskContactNumber, formatINR } from '../src/lib/crypto';
import { dataService } from '../src/services/dataService';

describe('Pre-Diwali Celebration Core Logic & Security Tests', () => {
  beforeEach(() => {
    // Reset test state if needed
  });

  describe('1. Form Validation & Data Normalization', () => {
    it('normalizes roll number cleanly (trim, uppercase, remove interior spaces)', () => {
      expect(normalizeRollNumber(' fycs 101 ')).toBe('FYCS101');
      expect(normalizeRollNumber('sy-it-205')).toBe('SY-IT-205');
      expect(normalizeRollNumber('  007  ')).toBe('007');
    });

    it('normalizes Indian phone numbers with country code or leading zero', () => {
      expect(normalizeContactNumber('+91 98765 43210')).toBe('9876543210');
      expect(normalizeContactNumber('09876543210')).toBe('9876543210');
      expect(normalizeContactNumber('9876543210')).toBe('9876543210');
    });

    it('validates mandatory registration fields correctly', () => {
      const validPayload = {
        full_name: 'Ananya Sharma',
        academic_year: 'FY - M.Sc.IT',
        food_preference: 'Jain',
        contact_number: '9876543210',
        roll_number: 'FY-CS-099',
        consent_agreed: true,
      };

      const result = registrationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid names, invalid phones, or missing consent', () => {
      // Missing consent
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'FY - M.Sc.IT',
          food_preference: 'Jain',
          contact_number: '9876543210',
          roll_number: 'FY099',
          consent_agreed: false,
        }).success
      ).toBe(false);

      // Invalid Indian phone number (starts with 3)
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'FY - M.Sc.IT',
          food_preference: 'Jain',
          contact_number: '3123456789',
          roll_number: 'FY099',
          consent_agreed: true,
        }).success
      ).toBe(false);

      // Invalid year option
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'TY',
          food_preference: 'Jain',
          contact_number: '9876543210',
          roll_number: 'FY099',
          consent_agreed: true,
        }).success
      ).toBe(false);
    });

    it('validates optional talent/stage performance field', () => {
      // Optional: without talent
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'FY - M.Sc.IT',
          food_preference: 'Jain',
          contact_number: '9876543210',
          roll_number: 'FY099',
          consent_agreed: true,
        }).success
      ).toBe(true);

      // Optional: with Dance
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'FY - M.Sc.IT',
          food_preference: 'Jain',
          contact_number: '9876543210',
          roll_number: 'FY099',
          consent_agreed: true,
          performance_talent: 'Dance',
        }).success
      ).toBe(true);

      // Optional: with Other
      expect(
        registrationSchema.safeParse({
          full_name: 'Ananya Sharma',
          academic_year: 'FY - M.Sc.IT',
          food_preference: 'Jain',
          contact_number: '9876543210',
          roll_number: 'FY099',
          consent_agreed: true,
          performance_talent: 'Other: Beatboxing and Mimicry',
        }).success
      ).toBe(true);
    });

    it('validates manual UPI transaction ID format (max 12 digits)', () => {
      expect(manualPaymentClaimSchema.safeParse({ transaction_reference: '123456789012' }).success).toBe(true); // exact 12 digits
      expect(manualPaymentClaimSchema.safeParse({ transaction_reference: 'UPI12345678' }).success).toBe(true); // 11 chars
      expect(manualPaymentClaimSchema.safeParse({ transaction_reference: '1234567890123' }).success).toBe(false); // > 12 digits rejected
      expect(manualPaymentClaimSchema.safeParse({ transaction_reference: '123' }).success).toBe(false); // too short (<8)
      expect(manualPaymentClaimSchema.safeParse({ transaction_reference: 'UPI@#$123' }).success).toBe(false); // special chars
    });
  });

  describe('2. Cryptographic Security & Privacy', () => {
    it('generates high entropy tokens and deterministic SHA-256 hashes', async () => {
      const token1 = generatePassToken();
      const token2 = generatePassToken();
      expect(token1).not.toBe(token2);
      expect(token1.startsWith('PREDIWALI_PASS_')).toBe(true);

      const hash1 = await hashToken(token1);
      const hash1Repeat = await hashToken(token1);
      expect(hash1.length).toBe(64); // SHA-256 is 64 hex characters
      expect(hash1).toBe(hash1Repeat);
    });

    it('masks phone numbers properly to protect student privacy', () => {
      expect(maskContactNumber('9876543210')).toBe('******3210');
    });

    it('formats Indian currency (INR) accurately', () => {
      expect(formatINR(25000, 'INR')).toContain('250');
      expect(formatINR(50000, 'INR')).toContain('500');
    });
  });

  describe('3. Registration & Server-Side Duplicate Prevention', () => {
    it('registers a student and blocks subsequent duplicate roll registrations', async () => {
      const roll = `TEST_ROLL_${Date.now()}`;
      const regInput = {
        full_name: 'Vikramaditya Rao',
        academic_year: 'SY - Data Science' as const,
        food_preference: 'Regular' as const,
        contact_number: '9811122233',
        roll_number: roll,
        consent_agreed: true,
      };

      // First registration should succeed with course prefix (DS for Data Science)
      const reg1 = await dataService.registerStudent(regInput);
      expect(reg1.alreadyRegistered).toBe(false);
      expect(reg1.registration.normalized_roll_number).toBe(formatRollWithCoursePrefix(roll, regInput.academic_year));
      expect(reg1.registration.payment_status).toBe('PENDING');

      // Student can find/login with their own raw roll number
      const lookedUp = dataService.getRegistrationByRollNumber(roll);
      expect(lookedUp?.id).toBe(reg1.registration.id);

      // Duplicate registration attempt with same roll (different casing and spaces)
      const duplicateInput = {
        ...regInput,
        roll_number: `  ${roll.toLowerCase()}  `,
        full_name: 'Imposter Student',
      };
      const reg2 = await dataService.registerStudent(duplicateInput);
      expect(reg2.alreadyRegistered).toBe(true);
      expect(reg2.existingRegistrationId).toBe(reg1.registration.id);
      expect(reg2.registration.full_name).toBe('Vikramaditya Rao'); // Original student intact!
    });
  });

  describe('4. Payment Verification & Pass Issuance', () => {
    it('requires payment verification before pass issuance', async () => {
      const roll = `UNPAID_ROLL_${Date.now()}`;
      const regRes = await dataService.registerStudent({
        full_name: 'Unpaid Candidate',
        academic_year: 'FY - M.Sc.IT',
        food_preference: 'Regular',
        contact_number: '9822233344',
        roll_number: roll,
        consent_agreed: true,
      });

      // Pass issuance must fail for unpaid registration
      await expect(dataService.issueEntryPass(regRes.registration.id)).rejects.toThrow(
        'Cannot issue entry pass for unpaid registration'
      );
    });

    it('submits manual UPI claim and allows admin to verify', async () => {
      const roll = `UT_${Date.now()}_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const regRes = await dataService.registerStudent({
        full_name: 'Kavita Sengupta',
        academic_year: 'SY - M.Sc.IT',
        food_preference: 'Jain',
        contact_number: '9833344455',
        roll_number: roll,
        consent_agreed: true,
      });

      const txRef = `12${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const screenshotUrl = 'https://example.com/receipts/kavita-upi.png';
      const payment = await dataService.submitManualPaymentClaim(regRes.registration.id, txRef, screenshotUrl);
      expect(payment.status).toBe('PENDING');
      expect(payment.transaction_reference).toBe(txRef);
      expect(payment.screenshot_url).toBe(screenshotUrl);

      // Verify as Admin
      const adminProfile = dataService.getProfiles().find((p) => p.role === 'ADMIN')!;
      const verified = await dataService.verifyManualPaymentAdmin(payment.id, adminProfile.id, 'Verified against bank');
      expect(verified.payment.status).toBe('PAID');
      expect(verified.pass.status).toBe('VALID');

      // Check registration status is updated
      const updatedReg = dataService.getRegistrationById(regRes.registration.id)!;
      expect(updatedReg.payment_status).toBe('PAID');
    });
  });

  describe('5. Strict One-Time QR Scanning Enforcement', () => {
    it('approves first scan and strictly rejects second duplicate scan with previous scan details', async () => {
      const roll = `SO_${Date.now()}_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const regRes = await dataService.registerStudent({
        full_name: 'Devendra Jha',
        academic_year: 'FY - Data Science',
        food_preference: 'Regular',
        contact_number: '9844455566',
        roll_number: roll,
        consent_agreed: true,
      });

      // Confirm payment
      const payment = await dataService.submitManualPaymentClaim(
        regRes.registration.id,
        `22${Math.floor(1000000000 + Math.random() * 9000000000)}`
      );
      const adminProfile = dataService.getProfiles().find((p) => p.role === 'ADMIN')!;
      await dataService.verifyManualPaymentAdmin(payment.id, adminProfile.id);

      // Retrieve entry pass and raw token
      const passDetails = dataService.getEntryPassByRegistration(regRes.registration.id)!;
      expect(passDetails).toBeDefined();
      expect(passDetails.raw_token).toBeDefined();

      const staff1 = dataService.getProfiles().find((p) => p.role === 'STAFF')!;

      // --- FIRST SCAN ---
      const scan1 = await dataService.redeemEntryPass(passDetails.raw_token!, staff1.id, 'req-001');
      expect(scan1.success).toBe(true);
      expect(scan1.status).toBe('ENTRY_APPROVED');
      expect(scan1.student_name).toBe('Devendra Jha');
      expect(scan1.food_preference).toBe('Regular');

      // --- SECOND SCAN (Same or different gate) ---
      const staff2 = dataService.getProfiles().find((p) => p.id !== staff1.id && p.role === 'STAFF') || staff1;
      const scan2 = await dataService.redeemEntryPass(passDetails.raw_token!, staff2.id, 'req-002');
      expect(scan2.success).toBe(false);
      expect(scan2.status).toBe('ALREADY_USED');
      expect(scan2.message).toContain('ALREADY USED');
      expect(scan2.previous_scan_at).toBeDefined();
      expect(scan2.previous_staff_name).toBeDefined();
    });

    it('rejects invalid or forged pass tokens without affecting genuine passes', async () => {
      const staff = dataService.getProfiles().find((p) => p.role === 'STAFF')!;
      const forgedToken = 'PREDIWALI_PASS_FORGED_HACKER_TOKEN_99999';

      const scanResult = await dataService.redeemEntryPass(forgedToken, staff.id, 'req-forged');
      expect(scanResult.success).toBe(false);
      expect(scanResult.status).toBe('INVALID_PASS');
      expect(scanResult.message).toContain('INVALID PASS');
    });

    it('safely handles concurrent scans so exactly ONE succeeds', async () => {
      const roll = `CC_${Date.now()}_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const regRes = await dataService.registerStudent({
        full_name: 'Simran Gill',
        academic_year: 'SY - Data Science',
        food_preference: 'Jain',
        contact_number: '9855566677',
        roll_number: roll,
        consent_agreed: true,
      });

      const payment = await dataService.submitManualPaymentClaim(
        regRes.registration.id,
        `32${Math.floor(1000000000 + Math.random() * 9000000000)}`
      );
      const admin = dataService.getProfiles().find((p) => p.role === 'ADMIN')!;
      await dataService.verifyManualPaymentAdmin(payment.id, admin.id);

      const pass = dataService.getEntryPassByRegistration(regRes.registration.id)!;
      const staff = dataService.getProfiles().find((p) => p.role === 'STAFF')!;

      // Simulate simultaneous redemption requests at Gate 1 and Gate 2
      const [res1, res2] = await Promise.all([
        dataService.redeemEntryPass(pass.raw_token!, staff.id, 'gate-1-req'),
        dataService.redeemEntryPass(pass.raw_token!, staff.id, 'gate-2-req'),
      ]);

      const successes = [res1, res2].filter((r) => r.status === 'ENTRY_APPROVED');
      const alreadyUseds = [res1, res2].filter((r) => r.status === 'ALREADY_USED');

      // Exactly ONE request must succeed!
      expect(successes.length).toBe(1);
      expect(alreadyUseds.length).toBe(1);
    });
  });

  describe('6. Food Count & Reporting Aggregations', () => {
    it('accurately tallies FY vs SY and Regular vs Jain meals for paid students', () => {
      const metrics = dataService.getDashboardMetrics();
      expect(metrics.totalRegistrations).toBeGreaterThanOrEqual(3);
      expect(metrics.paidRegistrations).toBeGreaterThanOrEqual(3);
      expect(metrics.regularFoodCount + metrics.jainFoodCount).toBe(metrics.paidRegistrations);
      expect(metrics.fyCount + metrics.syCount).toBe(metrics.paidRegistrations);
    });
  });

  describe('7. Dynamic Registration Pricing & Immutable Fee Snapshot', () => {
    it('admin can change fee and new fee applies to new registrations without altering previous registrations', async () => {
      const admin = dataService.getProfiles().find((p) => p.role === 'ADMIN')!;
      const initialFee = dataService.getEventSettings().registration_fee_minor_units;

      // 1. Register student before price change
      const rollOld = `OLD_PRICE_${Date.now()}`;
      const regBefore = await dataService.registerStudent({
        full_name: 'Tarun Mehra',
        academic_year: 'FY - M.Sc.IT',
        food_preference: 'Regular',
        contact_number: '9866677788',
        roll_number: rollOld,
        consent_agreed: true,
      });

      expect(regBefore.registration.expected_amount_minor_units).toBe(initialFee);

      // 2. Admin updates the fee to ₹350 (35000 paise)
      const newFee = 35000;
      const historyBeforeCount = dataService.getPricingHistory().length;

      const pricingResult = await dataService.updateRegistrationPricing(
        {
          registration_fee_minor_units: newFee,
          registration_enabled: true,
          registration_opens_at: new Date(Date.now() - 86400000).toISOString(),
          registration_closes_at: new Date(Date.now() + 86400000 * 7).toISOString(),
          maximum_capacity: 1500,
          change_reason: 'Regular tier price adjustment',
        },
        admin.id
      );

      expect(pricingResult.event.registration_fee_minor_units).toBe(newFee);
      expect(pricingResult.historyRecord.previous_fee_minor_units).toBe(initialFee);
      expect(pricingResult.historyRecord.new_fee_minor_units).toBe(newFee);
      expect(pricingResult.historyRecord.change_reason).toBe('Regular tier price adjustment');
      expect(pricingResult.historyRecord.changed_by).toBe(admin.id);

      // Check pricing history is append-only and grew by 1
      const historyAfter = dataService.getPricingHistory();
      expect(historyAfter.length).toBe(historyBeforeCount + 1);

      // 3. Register another student AFTER price change
      const rollNew = `NEW_PRICE_${Date.now()}`;
      const regAfter = await dataService.registerStudent({
        full_name: 'Sneha Kulkarni',
        academic_year: 'SY - Data Science',
        food_preference: 'Jain',
        contact_number: '9877788899',
        roll_number: rollNew,
        consent_agreed: true,
      });

      // New registration MUST receive the new fee
      expect(regAfter.registration.expected_amount_minor_units).toBe(newFee);

      // OLD registration MUST retain its original immutable fee snapshot!
      const fetchedOldReg = dataService.getRegistrationById(regBefore.registration.id)!;
      expect(fetchedOldReg.expected_amount_minor_units).toBe(initialFee);
      expect(fetchedOldReg.expected_amount_minor_units).not.toBe(newFee);

      // 4. Verify that payment creation for old registration uses its stored snapshot
      const txRef = `42${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const paymentOld = await dataService.submitManualPaymentClaim(fetchedOldReg.id, txRef);
      expect(paymentOld.expected_amount_minor_units).toBe(initialFee);
    });

    it('rejects pricing updates by non-admin or inactive staff members', async () => {
      const staff = dataService.getProfiles().find((p) => p.role === 'STAFF')!;

      await expect(
        dataService.updateRegistrationPricing(
          {
            registration_fee_minor_units: 30000,
            registration_enabled: true,
            registration_opens_at: new Date().toISOString(),
            registration_closes_at: new Date(Date.now() + 86400000).toISOString(),
            maximum_capacity: 1000,
          },
          staff.id
        )
      ).rejects.toThrow('Unauthorized: only authenticated and active administrators can update registration pricing');
    });

    it('rejects invalid, negative, zero, or fractional pricing inputs on the server', async () => {
      const admin = dataService.getProfiles().find((p) => p.role === 'ADMIN')!;

      // Zero or negative
      await expect(
        dataService.updateRegistrationPricing(
          {
            registration_fee_minor_units: 0,
            registration_enabled: true,
            registration_opens_at: new Date().toISOString(),
            registration_closes_at: new Date(Date.now() + 86400000).toISOString(),
            maximum_capacity: 1000,
          },
          admin.id
        )
      ).rejects.toThrow('Registration fee must be a strictly positive integer amount');

      // Fractional / non-integer
      await expect(
        dataService.updateRegistrationPricing(
          {
            registration_fee_minor_units: 250.5,
            registration_enabled: true,
            registration_opens_at: new Date().toISOString(),
            registration_closes_at: new Date(Date.now() + 86400000).toISOString(),
            maximum_capacity: 1000,
          },
          admin.id
        )
      ).rejects.toThrow('Registration fee must be a strictly positive integer amount');

      // Exceeds business threshold
      await expect(
        dataService.updateRegistrationPricing(
          {
            registration_fee_minor_units: 20000000, // ₹2,00,000 exceeds ₹1,00,000
            registration_enabled: true,
            registration_opens_at: new Date().toISOString(),
            registration_closes_at: new Date(Date.now() + 86400000).toISOString(),
            maximum_capacity: 1000,
          },
          admin.id
        )
      ).rejects.toThrow('Registration fee exceeds maximum allowable threshold');

      // Inverted schedule dates (opens >= closes)
      await expect(
        dataService.updateRegistrationPricing(
          {
            registration_fee_minor_units: 25000,
            registration_enabled: true,
            registration_opens_at: new Date(Date.now() + 86400000).toISOString(),
            registration_closes_at: new Date(Date.now()).toISOString(),
            maximum_capacity: 1000,
          },
          admin.id
        )
      ).rejects.toThrow('Registration opening date and time must be prior to closing date and time');
    });
  });

  describe('8. UPI ID, Compulsory Payment Screenshot & Supabase Integration', () => {
    it('sets authoritative event settings (UPI ID, Surat venue, 5:00 PM time, and contact email)', () => {
      const event = dataService.getEventSettings();
      expect(event.payment_upi_id).toBe('madhavikalathiya2007@sbi');
      expect(event.contact_email).toBe('prince.kahar.king@gmail.com');
      expect(event.event_date).toContain('17:00:00');
      expect(event.venue).toContain('Surat');
    });

    it('stores and retrieves compulsory payment screenshot on payment claim', async () => {
      const roll = `SS_${Date.now()}_${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const reg = await dataService.registerStudent({
        full_name: 'Pooja Patel',
        academic_year: 'FY - M.Sc.IT',
        food_preference: 'Regular',
        contact_number: '9877788899',
        roll_number: roll,
        consent_agreed: true,
      });

      const tx = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      const screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const payment = await dataService.submitManualPaymentClaim(reg.registration.id, tx, screenshotDataUrl);
      expect(payment.screenshot_url).toBe(screenshotDataUrl);
      expect(payment.status).toBe('PENDING');

      // Verify that admin sees the screenshot in the pending queue
      const queue = dataService.getPendingPaymentsQueue();
      const inQueue = queue.find((p) => p.id === payment.id);
      expect(inQueue).toBeDefined();
      expect(inQueue?.screenshot_url).toBe(screenshotDataUrl);
    });

    it('has Supabase storage and synchronization methods available', () => {
      expect(typeof dataService.uploadPaymentScreenshot).toBe('function');
      expect(typeof dataService.initSupabase).toBe('function');
    });
  });

  describe('9. Dynamic Authentication & SQL Injection Defense', () => {
    it('authenticates Staff with dynamic credentials', async () => {
      const res = await dataService.authenticateUser('Staff', 'Staff@123!123', 'STAFF');
      expect(res.success).toBe(true);
      expect(res.user?.role).toBe('STAFF');
    });

    it('authenticates Admin with dynamic credentials', async () => {
      const res = await dataService.authenticateUser('Admin', 'Admin@123!123', 'ADMIN');
      expect(res.success).toBe(true);
      expect(res.user?.role).toBe('ADMIN');
    });

    it('blocks SQL injection attempts in username and password', async () => {
      const sqlPayload1 = await dataService.authenticateUser("' OR '1'='1", 'Staff@123!123', 'STAFF');
      expect(sqlPayload1.success).toBe(false);
      expect(sqlPayload1.message).toContain('SQL injection sequence detected and blocked');

      const sqlPayload2 = await dataService.authenticateUser('Admin', "'; DROP TABLE profiles; --", 'ADMIN');
      expect(sqlPayload2.success).toBe(false);
      expect(sqlPayload2.message).toContain('SQL injection sequence detected and blocked');
    });

    it('rejects incorrect passwords', async () => {
      const wrong = await dataService.authenticateUser('Staff', 'WrongPassword!123', 'STAFF');
      expect(wrong.success).toBe(false);
    });
  });
});

