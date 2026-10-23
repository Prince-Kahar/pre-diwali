import React from 'react';
import { Sparkles, QrCode, Shield, GraduationCap, CheckCircle2 } from 'lucide-react';
import { DiyaIcon } from './DiyaDecoration';
import { EventSettings } from '../../types';

export type ActivePortal = 'STUDENT' | 'ADMIN' | 'STAFF';

interface NavbarProps {
  activePortal: ActivePortal;
  onSelectPortal: (portal: ActivePortal) => void;
  event: EventSettings;
  adminLoggedIn?: boolean;
  staffLoggedIn?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePortal,
  onSelectPortal,
  event,
  adminLoggedIn,
  staffLoggedIn,
}) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/95 border-b border-[#E8E2D9] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Event Title */}
          <div
            onClick={() => onSelectPortal('STUDENT')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative p-2 rounded-xl bg-[#FFF0D9] border border-[#E99A20]/40 shadow-xs group-hover:border-[#E99A20] transition-colors">
              <DiyaIcon size="md" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold text-[#6B655D] truncate">
                  {event.college_name}
                </span>
                {event.registration_enabled ? (
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 font-semibold">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Open
                  </span>
                ) : (
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-rose-50 text-[#B91C1C] border border-rose-200 font-semibold">
                    Closed
                  </span>
                )}
              </div>
              <h1 className="text-sm sm:text-xl font-bold text-[#29243A] group-hover:text-[#6D28D9] transition-colors truncate">
                Pre-Diwali Celebration
              </h1>
            </div>
          </div>

          {/* Navigation Pill Switches */}
          <nav className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl bg-[#FFF0D9] border border-[#E8E2D9] shrink-0">
            <button
              onClick={() => onSelectPortal('STUDENT')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activePortal === 'STUDENT'
                  ? 'bg-[#6D28D9] text-white shadow-sm'
                  : 'text-[#6B655D] hover:text-[#29243A] hover:bg-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Student</span>
            </button>

            <button
              onClick={() => onSelectPortal('STAFF')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer relative ${
                activePortal === 'STAFF'
                  ? 'bg-[#6D28D9] text-white shadow-sm'
                  : 'text-[#6B655D] hover:text-[#29243A] hover:bg-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Staff</span>
              {staffLoggedIn && (
                <span className="w-2 h-2 rounded-full bg-[#15803D] absolute top-1.5 right-1.5 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => onSelectPortal('ADMIN')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer relative ${
                activePortal === 'ADMIN'
                  ? 'bg-[#6D28D9] text-white shadow-sm'
                  : 'text-[#6B655D] hover:text-[#29243A] hover:bg-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Admin</span>
              {adminLoggedIn && (
                <span className="w-2 h-2 rounded-full bg-[#E99A20] absolute top-1.5 right-1.5" />
              )}
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
