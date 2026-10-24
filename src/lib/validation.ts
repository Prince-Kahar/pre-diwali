import { z } from 'zod';

// Normalize Roll Number: trims whitespace, uppercase, strips redundant interior spaces
export function normalizeRollNumber(roll: string): string {
  return roll.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Format Roll Number with Course Prefix:
 * - 'FY - M.Sc.IT' or 'SY - M.Sc.IT' -> prefixed with 'IT' (e.g. IT2021)
 * - 'FY - Data Science' or 'SY - Data Science' -> prefixed with 'DS' (e.g. DS2021)
 */
export function formatRollWithCoursePrefix(roll: string, academicYear: string): string {
  const raw = roll.trim().toUpperCase().replace(/\s+/g, '');
  const isIT = academicYear.includes('IT') || academicYear.includes('M.Sc.IT');
  const isDS = academicYear.includes('Data Science') || academicYear.includes('DS');
  const prefix = isIT ? 'IT' : isDS ? 'DS' : '';

  if (!prefix) return raw;

  // Clean away any previous IT/DS prefix or hyphen to prevent duplicate prefixes (e.g. IT-IT2021)
  const stripped = raw.replace(/^(IT|DS)[-_]?/i, '');
  return `${prefix}${stripped}`;
}

// Normalize Contact Number: extracts clean 10-digit Indian mobile number
export function normalizeContactNumber(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

// Indian mobile number validation regex (6, 7, 8, 9 followed by 9 digits)
const INDIAN_PHONE_REGEX = /^(?:\+91|91|0)?[6-9]\d{9}$/;

export const registrationSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, 'Full name must be at least 3 characters')
    .max(80, 'Full name cannot exceed 80 characters')
    .regex(/^[a-zA-Z\s.'-]+$/, 'Full name must contain only letters, spaces, and valid punctuation')
    .refine((val) => {
      const words = val.trim().split(/\s+/).filter(Boolean);
      return words.length >= 2;
    }, {
      message: 'Please enter your complete full name (First Name and Last Name)',
    })
    .refine((val) => {
      const lower = val.toLowerCase().trim();
      const forbidden = ['test', 'fake', 'dummy', 'demo', 'asdf', 'qwerty', 'admin', 'student', 'none', 'null', 'temp', 'sample'];
      return !forbidden.some((word) => lower === word || lower.includes(` ${word} `) || lower.startsWith(`${word} `) || lower.endsWith(` ${word}`));
    }, {
      message: 'Please enter a genuine student full name',
    })
    .refine((val) => {
      return !/(.)\1{4,}/i.test(val);
    }, {
      message: 'Invalid name format. Please enter your real name.',
    }),
  
  academic_year: z.enum([
    'FY - M.Sc.IT',
    'FY - Data Science',
    'SY - M.Sc.IT',
    'SY - Data Science',
  ], {
    message: 'Please select your academic year and field (M.Sc.IT or Data Science in FY/SY)',
  }),

  food_preference: z.enum(['Regular', 'Jain'], {
    message: 'Please select your food preference (Regular or Jain)',
  }),

  contact_number: z
    .string()
    .trim()
    .regex(INDIAN_PHONE_REGEX, 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)')
    .refine((val) => {
      const digits = val.replace(/\D/g, '');
      const clean = digits.length > 10 ? digits.slice(-10) : digits;
      // Reject all-identical numbers like 9999999999, 8888888888, 0000000000
      if (/^(\d)\1{9}$/.test(clean)) return false;
      // Reject obvious dummy sequences
      if (clean === '9876543210' || clean === '0123456789' || clean === '1234567890') return false;
      return true;
    }, {
      message: 'Please enter a genuine, valid 10-digit mobile number',
    }),

  roll_number: z
    .string()
    .trim()
    .min(1, 'Roll number is required')
    .max(15, 'Roll number cannot exceed 15 characters')
    .regex(/^[a-zA-Z0-9/_ -]+$/, 'Roll number must be alphanumeric (letters, numbers, hyphens or slashes)')
    .refine((val) => {
      // Must contain at least one digit (roll numbers cannot be pure letters like 'asdf' or 'fake')
      return /\d/.test(val);
    }, {
      message: 'Roll number must contain student roll digits (e.g. 2021 or 101)',
    })
    .refine((val) => {
      const lower = val.toLowerCase().trim();
      const forbidden = ['test', 'fake', 'dummy', 'demo', 'asdf', 'none', 'null', 'admin', 'sample', 'temp', '0000', '000', '00', '0'];
      return !forbidden.includes(lower);
    }, {
      message: 'Please enter your genuine college roll number',
    })
    .refine((val) => {
      const digits = val.replace(/\D/g, '');
      return parseInt(digits, 10) > 0;
    }, {
      message: 'Roll number must be greater than 0',
    }),

  consent_agreed: z
    .boolean()
    .refine((val) => val === true, {
      message: 'You must agree to the event guidelines and privacy policy to continue',
    }),

  performance_talent: z
    .string()
    .trim()
    .max(150, 'Performance details cannot exceed 150 characters')
    .optional(),

  identity_photo_url: z
    .string()
    .min(10, 'Student identity photo is compulsory to prevent fake registrations'),
});

export const manualPaymentClaimSchema = z.object({
  transaction_reference: z
    .string()
    .trim()
    .max(25, 'UPI Reference / UTR number cannot exceed 25 characters')
    .optional()
    .or(z.literal('')),
  screenshot_url: z
    .string()
    .min(1, 'Payment screenshot is compulsory. Please upload your payment screenshot.')
    .optional(),
});

export const eventSettingsSchema = z.object({
  name: z.string().trim().min(3),
  college_name: z.string().trim().min(3),
  event_date: z.string().min(5),
  venue: z.string().trim().min(3),
  venue_directions: z.string().optional(),
  registration_opens_at: z.string().min(5),
  registration_closes_at: z.string().min(5),
  registration_fee_minor_units: z.number().int().min(0),
  currency: z.string().default('INR'),
  max_capacity: z.number().int().positive(),
  registration_enabled: z.boolean(),
  entry_enabled: z.boolean(),
  payment_mode: z.enum(['GATEWAY', 'STATIC_UPI']),
  payment_upi_id: z.string().trim().min(3),
  payment_upi_name: z.string().trim().min(2),
  student_instructions: z.string(),
  contact_email: z.string().email(),
  contact_phone: z.string().min(10),
  terms_and_conditions: z.string(),
  pass_branding_title: z.string().min(2),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;
export type ManualPaymentClaimFormData = z.infer<typeof manualPaymentClaimSchema>;
