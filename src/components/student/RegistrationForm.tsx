import React, { useState } from 'react';
import {
  User,
  GraduationCap,
  Utensils,
  Phone,
  FileText,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { EventSettings, AcademicYear, FoodPreference, Registration } from '../../types';
import { registrationSchema } from '../../lib/validation';
import { formatINR } from '../../lib/crypto';
import { dataService } from '../../services/dataService';
import collegeLogo from '../../assets/logo.png';

interface RegistrationFormProps {
  event: EventSettings;
  onSuccess: (registration: Registration, alreadyRegistered: boolean) => void;
  onCancel: () => void;
  onOpenTerms: () => void;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  event,
  onSuccess,
  onCancel,
  onOpenTerms,
}) => {
  const [formData, setFormData] = useState({
    full_name: '',
    academic_year: 'FY - M.Sc.IT' as AcademicYear,
    food_preference: 'Regular' as FoodPreference,
    contact_number: '',
    roll_number: '',
    consent_agreed: false,
    talent_option: '',
    other_talent_text: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error for this field
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
    setGeneralError(null);
  };

  const getComputedTalent = () => {
    if (formData.talent_option === 'Other') {
      return formData.other_talent_text.trim() ? `Other: ${formData.other_talent_text.trim()}` : '';
    }
    return formData.talent_option || '';
  };

  const validateForm = (): boolean => {
    const computedTalent = getComputedTalent();
    const result = registrationSchema.safeParse({
      ...formData,
      performance_talent: computedTalent || undefined,
    });
    const formattedErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          formattedErrors[issue.path[0] as string] = issue.message;
        }
      });
    }

    if (formData.talent_option === 'Other' && !formData.other_talent_text.trim()) {
      formattedErrors.other_talent_text = 'Please specify your other performance details (Compulsory when Other is selected)';
    }

    if (Object.keys(formattedErrors).length > 0) {
      setFieldErrors(formattedErrors);
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmModal(true);
    }
  };

  const handleConfirmAndProceed = async () => {
    setIsSubmitting(true);
    setGeneralError(null);

    const computedTalent = getComputedTalent();

    try {
      const res = await dataService.registerStudent({
        full_name: formData.full_name,
        academic_year: formData.academic_year,
        food_preference: formData.food_preference,
        contact_number: formData.contact_number,
        roll_number: formData.roll_number,
        consent_agreed: formData.consent_agreed,
        performance_talent: computedTalent || undefined,
      });

      setShowConfirmModal(false);
      onSuccess(res.registration, res.alreadyRegistered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during registration. Please check your details.';
      setGeneralError(msg);
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-10 shadow-sm">
        {/* Back and Title */}
        <div className="flex items-center justify-between pb-6 border-b border-[#E8E2D9] mb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-[#6B655D] hover:text-[#6D28D9] transition-colors cursor-pointer font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Details</span>
          </button>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-[#6B655D] font-bold block">Registration Fee</span>
            <span className="text-base sm:text-lg font-black text-[#6D28D9]">
              {formatINR(event.registration_fee_minor_units, event.currency)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E8E2D9] p-1.5 shadow-xs flex items-center justify-center shrink-0">
            <img
              src={collegeLogo}
              alt={`${event.college_name} Logo`}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] uppercase tracking-wider text-[#6B655D] font-bold block">
              {event.college_name}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#29243A] tracking-tight">
              Student Registration Form
            </h2>
            <p className="text-xs text-[#6B655D]">
              Please enter your accurate college credentials. The entry QR pass and food preference will be permanently linked to this roll number.
            </p>
          </div>
        </div>

        {generalError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs sm:text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-[#B91C1C] mt-0.5" />
            <div>
              <p className="font-bold">Registration Notice</p>
              <p className="mt-0.5">{generalError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleOpenConfirm} className="space-y-5">
          {/* Field 1: Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#6D28D9]" />
              <span>Full Name (as per College ID) <span className="text-[#E99A20]">*</span></span>
            </label>
            <input
              type="text"
              name="full_name"
              placeholder="e.g. Ananya Sharma"
              value={formData.full_name}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                fieldErrors.full_name ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
              } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium`}
            />
            {fieldErrors.full_name && (
              <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Grid: Academic Year & Food Preference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 2: Academic Year */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#6D28D9]" />
                <span>Academic Year <span className="text-[#E99A20]">*</span></span>
              </label>
              <select
                name="academic_year"
                value={formData.academic_year}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium cursor-pointer"
              >
                <option value="FY - M.Sc.IT">FY — M.Sc.IT</option>
                <option value="FY - Data Science">FY — Data Science</option>
                <option value="SY - M.Sc.IT">SY — M.Sc.IT</option>
                <option value="SY - Data Science">SY — Data Science</option>
              </select>
            </div>

            {/* Field 3: Food Preference */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-[#6D28D9]" />
                <span>Dinner Preference <span className="text-[#E99A20]">*</span></span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Regular', 'Jain'] as FoodPreference[]).map((pref) => (
                  <label
                    key={pref}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs sm:text-sm cursor-pointer transition-all ${
                      formData.food_preference === pref
                        ? 'bg-[#FFF0D9] border-[#E99A20] text-[#29243A] font-bold shadow-xs'
                        : 'bg-[#FFFCF5] border-[#E8E2D9] text-[#6B655D] hover:bg-[#FFF0D9]/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="food_preference"
                      value={pref}
                      checked={formData.food_preference === pref}
                      onChange={handleInputChange}
                      className="hidden"
                    />
                    <span>{pref} Meal</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Grid: Contact Number & Roll Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 4: Contact Number */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#6D28D9]" />
                <span>Indian Mobile Number <span className="text-[#E99A20]">*</span></span>
              </label>
              <input
                type="tel"
                name="contact_number"
                placeholder="10-digit number (e.g. 9876543210)"
                value={formData.contact_number}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                  fieldErrors.contact_number ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium`}
              />
              {fieldErrors.contact_number && (
                <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.contact_number}</p>
              )}
            </div>

            {/* Field 5: Roll Number */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#6D28D9]" />
                <span>College Roll Number <span className="text-[#E99A20]">*</span></span>
              </label>
              <input
                type="text"
                name="roll_number"
                placeholder="e.g. FYCS101 or SYIT205"
                value={formData.roll_number}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                  fieldErrors.roll_number ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-mono font-medium`}
              />
              {fieldErrors.roll_number && (
                <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.roll_number}</p>
              )}
            </div>
          </div>

          {/* Field: Talent / Stage Performance Participation (Optional with compulsory Other text) */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#FFF0D9]/40 border border-[#E8E2D9]">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#E99A20]" />
                <span>Stage Performance / Talent Participation</span>
              </label>
              <span className="text-[10px] text-[#6B655D] font-bold bg-white px-2.5 py-0.5 rounded-full border border-[#E8E2D9]">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-[#6B655D]">
              Do you want to participate in a stage performance (Dance, Stand-up Comedy, Singing, Skit, or Other)?
            </p>

            <select
              name="talent_option"
              value={formData.talent_option}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium cursor-pointer"
            >
              <option value="">None / Not Participating</option>
              <option value="Dance">Dance</option>
              <option value="Stand-up Comedy">Stand-up Comedy</option>
              <option value="Singing">Singing</option>
              <option value="Drama / Skit">Drama / Skit</option>
              <option value="Other">Other</option>
            </select>

            {/* If Other selected: COMPULSORY Textbox with proper label */}
            {formData.talent_option === 'Other' && (
              <div className="pt-2 space-y-1.5">
                <label className="text-xs font-bold text-[#29243A] flex items-center gap-1">
                  <span>Specify Other Performance / Talent</span>
                  <span className="text-[#B91C1C] font-bold">*</span>
                </label>
                <input
                  type="text"
                  name="other_talent_text"
                  placeholder="e.g. Beatboxing, Mimicry, Poetry, Instrumental..."
                  value={formData.other_talent_text}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-2.5 rounded-xl bg-white border ${
                    fieldErrors.other_talent_text ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                  } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] text-sm font-medium`}
                />
                {fieldErrors.other_talent_text && (
                  <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.other_talent_text}</p>
                )}
              </div>
            )}
          </div>

          {/* Field 6: Consent */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-4 rounded-2xl bg-[#FFF0D9]/50 border border-[#E8E2D9] cursor-pointer">
              <input
                type="checkbox"
                name="consent_agreed"
                checked={formData.consent_agreed}
                onChange={handleInputChange}
                className="mt-0.5 w-4 h-4 rounded text-[#6D28D9] border-[#E8E2D9] focus:ring-[#6D28D9] cursor-pointer"
              />
              <span className="text-xs text-[#29243A] leading-relaxed">
                I agree to the college Pre-Diwali event rules, agree to carry my college physical ID card, and understand that my QR pass is strictly one-time entry only.{' '}
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="text-[#6D28D9] underline hover:text-[#5B21B6] font-bold inline cursor-pointer"
                >
                  View Terms & Rules
                </button>
              </span>
            </label>
            {fieldErrors.consent_agreed && (
              <p className="text-xs text-[#B91C1C] mt-1 pl-1 font-medium">{fieldErrors.consent_agreed}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>Continue to Payment Review</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] mb-1">
                <Sparkles className="w-6 h-6 text-[#E99A20]" />
              </div>
              <h3 className="text-xl font-bold text-[#29243A]">Confirm Registration Details</h3>
              <p className="text-xs text-[#6B655D]">
                Please verify your details carefully before proceeding to payment.
              </p>
            </div>

            <div className="space-y-3 bg-[#FFFCF5] p-4 rounded-2xl border border-[#E8E2D9] text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Student Name:</span>
                <span className="font-bold text-[#29243A]">{formData.full_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Roll Number:</span>
                <span className="font-bold text-[#6D28D9] font-mono">{formData.roll_number.toUpperCase()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Academic Year:</span>
                <span className="font-bold text-[#29243A]">{formData.academic_year}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Food Preference:</span>
                <span className="font-bold text-[#E99A20]">{formData.food_preference} Meal</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Contact Number:</span>
                <span className="font-bold text-[#29243A]">{formData.contact_number}</span>
              </div>
              {getComputedTalent() && (
                <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                  <span className="text-[#6B655D]">Stage Performance:</span>
                  <span className="font-bold text-[#6D28D9]">{getComputedTalent()}</span>
                </div>
              )}
              <div className="flex justify-between py-2 pt-3">
                <span className="text-[#6D28D9] font-bold">Total Registration Fee:</span>
                <span className="font-black text-[#6D28D9] text-base">
                  {formatINR(event.registration_fee_minor_units, event.currency)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={handleConfirmAndProceed}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
