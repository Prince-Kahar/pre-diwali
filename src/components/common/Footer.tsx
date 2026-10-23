import React from 'react';
import { Mail, Phone, MapPin, Sparkles, ShieldCheck } from 'lucide-react';
import { EventSettings } from '../../types';
import { DiyaIcon } from './DiyaDecoration';

interface FooterProps {
  event: EventSettings;
  onOpenTerms: () => void;
}

export const Footer: React.FC<FooterProps> = ({ event, onOpenTerms }) => {
  return (
    <footer className="mt-20 border-t border-[#E8E2D9] bg-[#FFF0D9] text-[#29243A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Col 1: Branding */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <DiyaIcon size="sm" />
              <span className="font-bold text-[#6D28D9] text-lg tracking-wide">
                {event.name}
              </span>
            </div>
            <p className="text-sm text-[#6B655D] max-w-md leading-relaxed">
              Official registration and one-time QR entry pass portal for {event.college_name}.
              Celebrate the festival of lights with music, authentic dining, and cultural fellowship.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#E99A20] font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Strict 1-Time Entry Cryptographic Verification Enabled</span>
            </div>
          </div>

          {/* Col 2: Event Venue */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#29243A]">
              Event Venue
            </h4>
            <div className="flex items-start gap-2 text-xs text-[#6B655D] leading-relaxed">
              <MapPin className="w-4 h-4 text-[#E99A20] shrink-0 mt-0.5" />
              <span className="font-medium text-[#29243A]">{event.venue}</span>
            </div>
            {event.venue_directions && (
              <p className="text-[11px] text-[#6B655D] pl-6">
                {event.venue_directions}
              </p>
            )}
          </div>

          {/* Col 3: Student Help & Contacts */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#29243A]">
              Student Helpdesk
            </h4>
            <div className="space-y-2 text-xs">
              <a
                href={`mailto:${event.contact_email}`}
                className="flex items-center gap-2 text-[#6B655D] hover:text-[#6D28D9] transition-colors"
              >
                <Mail className="w-4 h-4 text-[#E99A20]" />
                <span>{event.contact_email}</span>
              </a>
              <a
                href={`tel:${event.contact_phone}`}
                className="flex items-center gap-2 text-[#6B655D] hover:text-[#6D28D9] transition-colors"
              >
                <Phone className="w-4 h-4 text-[#E99A20]" />
                <span>{event.contact_phone}</span>
              </a>
              <button
                onClick={onOpenTerms}
                className="flex items-center gap-2 text-[#6D28D9] hover:underline pt-2 text-xs font-semibold cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#E99A20]" />
                <span>Terms, Event Rules & Privacy</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-[#E8E2D9] flex flex-col sm:flex-row items-center justify-between text-xs text-[#6B655D] gap-4">
          <p>© 2026 {event.college_name}. All rights reserved.</p>
          <p className="flex items-center gap-1.5 font-medium text-[#29243A]">
            Designed for College Pre-Diwali Celebrations 🪔 Happy Diwali
          </p>
        </div>
      </div>
    </footer>
  );
};
