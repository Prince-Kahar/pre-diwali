import React, { useState } from 'react';
import { QrCode, UserCheck, AlertCircle, Loader2 } from 'lucide-react';
import { EventSettings, UserProfile } from '../../types';
import { dataService } from '../../services/dataService';

interface StaffLoginProps {
  event: EventSettings;
  onLoginSuccess: (user: UserProfile) => void;
}

export const StaffLogin: React.FC<StaffLoginProps> = ({ event, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const result = await dataService.authenticateUser(username, password, 'STAFF');
      if (!result.success || !result.user) {
        setErrorMsg(result.message || 'Invalid username or password');
        return;
      }
      onLoginSuccess(result.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
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
            Sign in as <span className="font-bold text-[#6D28D9]">Staff Scanner</span> to access the camera scanner and validate student entry passes for {event.name}.
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
              Staff Username
            </label>
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#29243A] block">
              Staff Password
            </label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] font-medium"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] disabled:opacity-60 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Verifying...' : 'Launch Gate Scanner'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
