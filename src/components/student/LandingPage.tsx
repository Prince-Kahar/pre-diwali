import React, { useState } from 'react';
import {
  QrCode,
  Sparkles,
  Search,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Clock,
  MapPin,
  Phone,
} from 'lucide-react';
import { EventSettings } from '../../types';
import { DiyaIcon, RangoliMotif } from '../common/DiyaDecoration';
import { formatINR } from '../../lib/crypto';
import collegeLogo from '../../assets/logo.png';

interface LandingPageProps {
  event: EventSettings;
  onStartRegistration: () => void;
  onLookupRollNumber: (roll: string) => void;
  onOpenTerms: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  event,
  onStartRegistration,
  onLookupRollNumber,
  onOpenTerms,
}) => {
  const [lookupRoll, setLookupRoll] = useState('');
  const [lookupError, setLookupError] = useState('');

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRoll.trim()) {
      setLookupError('Please enter your college roll number');
      return;
    }
    setLookupError('');
    onLookupRollNumber(lookupRoll.trim());
  };

  const dynamicFee = formatINR(event.registration_fee_minor_units, event.currency);

  return (
    <div className="space-y-10 py-6 sm:py-8 bg-[#FFFCF5]">
      {/* ----------------- REGISTRATION HERO SECTION ----------------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#FFF0D9] via-[#FFF8EE] to-[#FFFCF5] border border-[#E8E2D9] p-6 sm:p-12 shadow-sm text-center">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#E99A20]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#6D28D9]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          {/* College Logo & Top Badge */}
          <div className="flex flex-col items-center gap-3">
            <div className="p-2 bg-white rounded-2xl border border-[#E8E2D9] shadow-sm inline-block">
              <img
                src={collegeLogo}
                alt={`${event.college_name} Logo`}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
              />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A] text-xs sm:text-sm font-semibold shadow-xs">
              <DiyaIcon size="sm" />
              <span className="text-[#6D28D9]">Pre-Diwali Celebration 2026</span>
              <span className="text-[#6B655D]">•</span>
              <span className="text-[#E99A20] font-bold">{event.college_name}</span>
              <Sparkles className="w-3.5 h-3.5 text-[#E99A20]" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#29243A] tracking-tight leading-tight">
              Celebrate{' '}
              <span className="text-[#6D28D9]">Pre-Diwali</span>{' '}
              <span className="text-[#E99A20]">Together</span>
            </h1>
            <p className="text-sm sm:text-base text-[#6B655D] max-w-lg mx-auto">
              Undergraduate Student Registration & Official QR Entry Pass Portal
            </p>
          </div>

          <div className="flex justify-center my-2">
            <RangoliMotif />
          </div>

          {/* Event Highlights Info Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs text-left">
              <div className="p-2 rounded-xl bg-[#FFF0D9] text-[#6D28D9] shrink-0">
                <Calendar className="w-4 h-4 text-[#E99A20]" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#6B655D] block">Date & Time</span>
                <span className="text-xs font-bold text-[#29243A] block truncate">4 Nov • 5:00 PM</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs text-left">
              <div className="p-2 rounded-xl bg-[#FFF0D9] text-[#6D28D9] shrink-0">
                <MapPin className="w-4 h-4 text-[#6D28D9]" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#6B655D] block">Venue</span>
                <span className="text-xs font-bold text-[#29243A] block truncate">{event.venue}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs text-left">
              <div className="p-2 rounded-xl bg-[#FFF0D9] text-[#6D28D9] shrink-0">
                <Phone className="w-4 h-4 text-[#15803D]" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#6B655D] block">Contact</span>
                <a href={`tel:${event.contact_phone}`} className="text-xs font-bold text-[#6D28D9] block hover:underline truncate">
                  {event.contact_phone}
                </a>
              </div>
            </div>
          </div>

          {/* Registration Fee Box */}
          <div className="max-w-xs mx-auto p-4 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40 shadow-xs">
            <div className="flex items-center justify-center gap-1.5 text-[#6D28D9] text-xs font-bold mb-1">
              <Sparkles className="w-4 h-4 text-[#E99A20]" />
              <span>Registration Fee</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-[#6D28D9]">
              {dynamicFee}
            </p>
            <p className="text-[11px] text-[#6B655D] mt-0.5">Includes Dinner (Regular / Jain)</p>
          </div>

          {/* Registration CTA Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            {event.registration_enabled ? (
              <button
                type="button"
                onClick={onStartRegistration}
                className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-base sm:text-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Register Now</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <div className="px-6 py-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-sm font-semibold">
                Registrations are currently closed by Administration
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ----------------- PASS LOOKUP SECTION ----------------- */}
      <section className="max-w-2xl mx-auto p-6 sm:p-8 rounded-3xl bg-white border border-[#E8E2D9] shadow-sm">
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] mb-1">
            <QrCode className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#29243A]">Already Registered? Find Your Pass</h2>
          <p className="text-xs sm:text-sm text-[#6B655D]">
            Enter your college Roll Number below to view payment status, upload payment screenshot, or access your QR entry pass.
          </p>
        </div>

        <form onSubmit={handleLookupSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6B655D] absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Enter Roll No (e.g. FYCS101 or SYIT205)"
                value={lookupRoll}
                onChange={(e) => {
                  setLookupRoll(e.target.value);
                  setLookupError('');
                }}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-semibold text-sm transition-colors cursor-pointer shadow-xs"
            >
              Find Pass
            </button>
          </div>
          {lookupError && (
            <p className="text-xs text-[#B91C1C] text-center font-medium">{lookupError}</p>
          )}
        </form>

        <div className="mt-4 pt-4 border-t border-[#E8E2D9] text-center">
          <button
            type="button"
            onClick={onOpenTerms}
            className="text-xs text-[#6B655D] hover:text-[#6D28D9] underline transition-colors cursor-pointer"
          >
            Registration Guidelines & Terms
          </button>
        </div>
      </section>
    </div>
  );
};
