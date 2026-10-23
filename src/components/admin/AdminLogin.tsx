import React, { useState } from 'react';
import { Shield, Key, AlertCircle } from 'lucide-react';
import { UserProfile } from '../../types';
import { dataService } from '../../services/dataService';

interface AdminLoginProps {
  onLoginSuccess: (admin: UserProfile) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const adminProfiles = dataService.getProfiles().filter((p) => p.role === 'ADMIN');
  const [email, setEmail] = useState(adminProfiles[0]?.email || 'admin@college.edu');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const admin = adminProfiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (!admin) {
      setErrorMsg('Unauthorized: Administrative account not found');
      return;
    }

    if (!admin.is_active) {
      setErrorMsg('This admin account has been suspended');
      return;
    }

    onLoginSuccess(admin);
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] border border-[#E8E2D9] mb-1">
            <Shield className="w-8 h-8" />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-[#E99A20] font-bold block">
            Pre-Diwali Central Control
          </span>
          <h2 className="text-2xl font-black text-[#29243A]">Admin Authentication</h2>
          <p className="text-xs text-[#6B655D]">
            Sign in to access registration pricing, verify manual UPI payments, configure event settings, and monitor entrance gates.
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
              Admin Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#29243A] block">
              Administrative Password
            </label>
            <input
              type="password"
              placeholder="Enter password (demo: any password)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-medium"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Key className="w-4 h-4" />
              <span>Unlock Admin Dashboard</span>
            </button>
          </div>
        </form>

        <div className="p-3.5 rounded-xl bg-[#FFF0D9] border border-[#E8E2D9] text-[11px] text-[#29243A] text-center">
          Default Admin: <span className="text-[#6D28D9] font-mono font-bold">admin@college.edu</span>
        </div>
      </div>
    </div>
  );
};
