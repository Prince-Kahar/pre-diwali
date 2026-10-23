import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { EventSettings } from '../../types';

interface TermsModalProps {
  event: EventSettings;
  isOpen: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ event, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#E99A20]" />
            <h3 className="text-lg font-bold text-[#29243A]">Event Rules & Privacy Policy</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#6B655D] hover:text-[#29243A] hover:bg-[#FFF0D9] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto space-y-4 text-xs text-[#6B655D] leading-relaxed pr-1">
          <div>
            <h4 className="font-bold text-[#6D28D9] text-sm mb-1">1. Eligibility & Verification</h4>
            <p>
              Admission to {event.name} is strictly limited to enrolled First Year (FY) and Second Year (SY) undergraduate students of {event.college_name}. Every attendee must present their physical college ID card alongside their digital or printed QR Entry Pass.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-[#6D28D9] text-sm mb-1">2. Strict One-Time QR Admission</h4>
            <p>
              Every entry QR pass contains an opaque, cryptographically verified token. Once scanned and redeemed at Gate 1 or Gate 2, the system records the entry atomically in the college database. Any subsequent attempt to scan or share the same QR code will trigger an immediate red alert and entry denial.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-[#6D28D9] text-sm mb-1">3. Food Preference & Coupon Issuance</h4>
            <p>
              Dinner coupons will be issued exclusively for the dietary choice selected during registration (Regular or Jain). Changes to dietary preferences cannot be accommodated on the evening of the event to ensure accurate catering preparation.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-[#6D28D9] text-sm mb-1">4. Payment Policy & Non-Refundability</h4>
            <p>
              All registration fees are non-transferable and non-refundable. For manual UPI QR claims, verification requires bank reconciliation by the cultural committee. Submitting fraudulent transaction reference IDs is a disciplinary violation.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-[#6D28D9] text-sm mb-1">5. Student Privacy & Data Protection</h4>
            <p>
              Student contact numbers are strictly masked on all entry passes and public dashboards. Your registration records are accessible only to authorized college administrators and gate security volunteers.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#E8E2D9] text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs transition-colors cursor-pointer shadow-sm"
          >
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );
};
