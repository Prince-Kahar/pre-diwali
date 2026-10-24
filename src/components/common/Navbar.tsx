import React from 'react';
import { Sparkles, QrCode, Shield, GraduationCap, CheckCircle2 } from 'lucide-react';
import { DiyaIcon } from './DiyaDecoration';
import { EventSettings } from '../../types';
import collegeLogo from '../../assets/logo.png';

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
            <div className="relative p-1 rounded-xl bg-white border border-[#E8E2D9] shadow-xs group-hover:border-[#E99A20] transition-colors shrink-0">
              <img
                src={collegeLogo}
                alt={`${event.college_name} Logo`}
                className="w-10 h-10 object-contain rounded-lg"
              />
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

          {/* Right Action / Portal Indicator */}
          {activePortal === 'STUDENT' ? (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF0D9] border border-[#E8E2D9] text-xs font-semibold text-[#8B4513] shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-[#E99A20] animate-pulse" />
                <span className="hidden sm:inline">Pre-Diwali Celebration</span>
                <span className="text-[#6D28D9] font-bold">2026</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100/80 border border-purple-200 text-[#6D28D9] font-bold text-xs shadow-xs">
                {activePortal === 'ADMIN' ? (
                  <>
                    <Shield className="w-3.5 h-3.5 text-[#6D28D9]" />
                    <span>Admin Portal</span>
                    {adminLoggedIn && (
                      <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse" />
                    )}
                  </>
                ) : (
                  <>
                    <QrCode className="w-3.5 h-3.5 text-[#6D28D9]" />
                    <span>Staff Portal</span>
                    {staffLoggedIn && (
                      <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse" />
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelectPortal('STUDENT')}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE3B9] text-[#29243A] hover:text-[#6D28D9] font-bold text-xs sm:text-sm border border-[#E8E2D9] transition-all cursor-pointer shadow-xs"
                title="Go back to Student Portal"
              >
                <span>&larr;</span>
                <span className="hidden sm:inline">Student View</span>
                <span className="sm:hidden">Exit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
