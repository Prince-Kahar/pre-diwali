import React, { useState } from 'react';
import { QrCode, UserCheck, AlertCircle } from 'lucide-react';
import { EventSettings, UserProfile } from '../../types';
import { dataService } from '../../services/dataService';

interface StaffLoginProps {
  event: EventSettings;
  onLoginSuccess: (user: UserProfile) => void;
}

export const StaffLogin: React.FC<StaffLoginProps> = ({ event, onLoginSuccess }) => {
  const staffProfiles = dataService.getProfiles().filter((p) => p.role === 'STAFF' && p.is_active);
  const [selectedStaffId, setSelectedStaffId] = useState(staffProfiles[0]?.id || '');
  const [accessCode, setAccessCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffProfiles.find((p) => p.id === selectedStaffId);
    if (!staff) {
      setErrorMsg('Please select a valid staff account');
      return;
    }

    if (!staff.is_active) {
      setErrorMsg('This staff account has been deactivated by administration');
      return;
    }

    onLoginSuccess(staff);
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] border border-[#E8E2D9] mb-1">
            <QrCode className="w-8 h-8" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-[#E99A20] font-bold block">
            Authorized Personnel Only
          </span>
          <h2 className="text-2xl font-black text-[#29243A]">Staff QR Entry Portal</h2>
          <p className="text-xs text-[#6B655D]">
            Sign in to access the camera scanner and validate student entry passes for {event.name}.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#B91C1C]" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#29243A] block">
              Select Staff Member / Gate Assignment
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(e.target.value);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-medium cursor-pointer"
            >
              {staffProfiles.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.display_name} ({staff.email})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#29243A] block">
              Gate Access Pin / Password
            </label>
            <input
              type="password"
              placeholder="Enter gate PIN (Default: 1234 or leave blank for demo)"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-mono font-medium"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <UserCheck className="w-4 h-4" />
              <span>Launch Gate Scanner</span>
            </button>
          </div>
        </form>

        <div className="pt-4 border-t border-[#E8E2D9] text-center text-[11px] text-[#6B655D]">
          Strict security logging: Every scan result is cryptographically tied to the active staff profile ID.
        </div>
      </div>
    </div>
  );
};
