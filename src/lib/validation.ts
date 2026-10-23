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
    .min(2, 'Full name must be at least 2 characters')
    .max(80, 'Full name cannot exceed 80 characters')
    .regex(/^[a-zA-Z\s.'-]+$/, 'Full name must contain only letters, spaces, and valid punctuation'),
  
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
    .regex(INDIAN_PHONE_REGEX, 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)'),

  roll_number: z
    .string()
    .trim()
    .min(2, 'Roll number must be at least 2 characters')
    .max(30, 'Roll number cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9/_ -]+$/, 'Roll number must be alphanumeric (letters, numbers, underscores, hyphens or slashes)'),

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
    .optional(),
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
