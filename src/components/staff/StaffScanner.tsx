import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Clock,
  User,
  Utensils,
  GraduationCap,
  FileText,
  RotateCcw,
  History,
  ShieldCheck,
  LogOut,
  Sparkles,
  Smartphone,
  Wifi,
  WifiOff,
  Download,
} from 'lucide-react';
import { EventSettings, UserProfile, ScanVerificationResult, EntryScanLog } from '../../types';
import { dataService } from '../../services/dataService';
import { formatKolkataDateTime } from '../../lib/crypto';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface StaffScannerProps {
  event: EventSettings;
  staffUser: UserProfile;
  onLogout: () => void;
}

export const StaffScanner: React.FC<StaffScannerProps> = ({
  event,
  staffUser,
  onLogout,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canToggleTorch, setCanToggleTorch] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanVerificationResult | null>(null);
  const [scanHistory, setScanHistory] = useState<EntryScanLog[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    loadStaffScans();

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsStandalone(true);
    }

    return () => {
      stopCamera();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [staffUser.id]);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const loadStaffScans = () => {
    const list = dataService.getScansList(staffUser.id);
    setScanHistory(list);
  };

  const startCamera = async () => {
    setScanResult(null);
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader-container');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          if (cooldownRef.current || isProcessing) return;
          cooldownRef.current = true;
          await handleProcessToken(decodedText);
          // 2-second cooldown to prevent double scans
          setTimeout(() => {
            cooldownRef.current = false;
          }, 2000);
        },
        () => {
          // ignore scan errors/frame skips
        }
      );

      setIsScanning(true);
      setHasCameraPermission(true);

      // Check flashlight support
      try {
        const capabilities = scannerRef.current.getRunningTrackCameraCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setCanToggleTorch(true);
        }
      } catch {
        setCanToggleTorch(false);
      }
    } catch (err) {
      console.error('Camera startup error:', err);
      setHasCameraPermission(false);
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Camera stop error:', err);
      }
    }
    setIsScanning(false);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !canToggleTorch) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const handleProcessToken = async (token: string) => {
    setIsProcessing(true);
    try {
      const result = await dataService.redeemEntryPass(
        token.trim(),
        staffUser.id,
        `gate-${Date.now()}`
      );
      setScanResult(result);
      loadStaffScans();
    } catch (err: unknown) {
      setScanResult({
        success: false,
        status: 'INVALID_PASS',
        message: err instanceof Error ? err.message : 'Error validating pass',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    await handleProcessToken(manualToken.trim());
    setManualToken('');
    setShowManualInput(false);
  };

  const resetForNextScan = () => {
    setScanResult(null);
    if (!isScanning) {
      startCamera();
    }
  };

  // Determine status color theme based on Requirement 7
  const isApproved = scanResult?.status === 'ENTRY_APPROVED';
  const isPending = scanResult?.status === 'PAYMENT_NOT_VERIFIED';
  const isRejected = scanResult && !isApproved && !isPending;

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6 bg-[#FFFCF5]">
      {/* Staff Header */}
      <div className="flex items-center justify-between p-4 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] border border-[#E8E2D9] flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5 text-[#E99A20]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-bold text-[#E99A20]">
                Gate Entry Scanner
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 font-semibold">
                Active Staff
              </span>
              {isStandalone && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-[#6D28D9] border border-purple-200 font-bold flex items-center gap-1">
                  <Smartphone className="w-2.5 h-2.5" /> PWA App
                </span>
              )}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border ${
                  isOnline
                    ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
                    : 'bg-rose-50 text-[#B91C1C] border-rose-200'
                }`}
              >
                {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </span>
            </div>
            <h2 className="text-base font-bold text-[#29243A]">
              {staffUser.display_name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {installPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer animate-pulse"
              title="Install Staff Scanner PWA on your phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#E99A20]" />
              <span>Install App</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="p-2.5 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] border border-[#E8E2D9] text-xs flex items-center gap-1.5 transition-colors cursor-pointer font-semibold shadow-xs"
            title="My Scan History"
          >
            <History className="w-4 h-4 text-[#E99A20]" />
            <span className="hidden sm:inline">History ({scanHistory.length})</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="p-2.5 rounded-xl bg-[#FFFCF5] hover:bg-rose-50 text-[#6B655D] hover:text-[#B91C1C] border border-[#E8E2D9] transition-colors cursor-pointer shadow-xs"
            title="Log Out Staff"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ----------------- AUTHORITATIVE RESULT SCREEN ----------------- */}
      {scanResult ? (
        <div
          className={`p-6 sm:p-8 rounded-3xl border-2 text-center space-y-6 shadow-sm transition-all animate-in zoom-in-95 ${
            isApproved
              ? 'bg-emerald-50/90 border-[#15803D] text-[#15803D]'
              : isPending
              ? 'bg-amber-50/90 border-[#B45309] text-[#B45309]'
              : 'bg-rose-50/90 border-[#B91C1C] text-[#B91C1C]'
          }`}
        >
          {/* Result Icon */}
          <div className="flex justify-center">
            {isApproved ? (
              <div className="w-20 h-20 rounded-full bg-white border-4 border-[#15803D] flex items-center justify-center text-[#15803D] animate-bounce shadow-md">
                <CheckCircle2 className="w-12 h-12" />
              </div>
            ) : isPending ? (
              <div className="w-20 h-20 rounded-full bg-white border-4 border-[#B45309] flex items-center justify-center text-[#B45309] shadow-md">
                <AlertTriangle className="w-12 h-12" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-white border-4 border-[#B91C1C] flex items-center justify-center text-[#B91C1C] shadow-md">
                <XCircle className="w-12 h-12" />
              </div>
            )}
          </div>

          {/* Result Title */}
          <div className="space-y-1">
            <h2
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isApproved
                  ? 'text-[#15803D]'
                  : isPending
                  ? 'text-[#B45309]'
                  : 'text-[#B91C1C]'
              }`}
            >
              {scanResult.message}
            </h2>
            <p className="text-xs text-[#6B655D]">
              Verified by Gate Staff: <span className="font-bold text-[#29243A]">{staffUser.display_name}</span>
            </p>
          </div>

          {/* Student Info Card (When available) */}
          {scanResult.student_name && (
            <div className="p-5 rounded-2xl bg-white border border-[#E8E2D9] text-left space-y-3 max-w-md mx-auto shadow-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#E8E2D9]">
                <span className="text-xs text-[#6B655D] font-medium">Student Name:</span>
                <span className="font-bold text-[#29243A] text-sm">
                  {scanResult.student_name}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#E8E2D9]">
                <span className="text-xs text-[#6B655D] font-medium">Roll Number:</span>
                <span className="font-mono font-bold text-[#6D28D9] text-sm">
                  {scanResult.roll_number}
                </span>
              </div>
              {scanResult.academic_year && (
                <div className="flex justify-between items-center pb-2 border-b border-[#E8E2D9]">
                  <span className="text-xs text-[#6B655D] font-medium">Academic Year:</span>
                  <span className="font-bold text-[#29243A] text-xs">
                    {scanResult.academic_year} (Undergraduate)
                  </span>
                </div>
              )}
              {scanResult.food_preference && (
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs text-[#29243A] font-bold">Food Preference:</span>
                  <span className="px-3 py-1 rounded-full bg-[#FFF0D9] border border-[#E99A20]/40 text-[#29243A] font-black text-xs">
                    {scanResult.food_preference} Dinner
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prior Scan Details for ALREADY_USED */}
          {scanResult.status === 'ALREADY_USED' && scanResult.previous_scan_at && (
            <div className="p-4 rounded-2xl bg-white border border-[#B91C1C]/40 text-left text-xs space-y-1 max-w-md mx-auto shadow-xs">
              <p className="font-bold text-[#B91C1C] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#B91C1C]" />
                <span>Original Scan Timestamp:</span>
              </p>
              <p className="text-[#29243A] font-semibold">
                {formatKolkataDateTime(scanResult.previous_scan_at)}
              </p>
              {scanResult.previous_staff_name && (
                <p className="text-[#6B655D] text-[11px] pt-1">
                  Previously Admitted by: <span className="font-bold text-[#29243A]">{scanResult.previous_staff_name}</span>
                </p>
              )}
            </div>
          )}

          {/* Reset Action */}
          <div className="pt-2">
            <button
              type="button"
              onClick={resetForNextScan}
              className={`w-full py-4 rounded-2xl font-bold text-base shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all ${
                isApproved
                  ? 'bg-[#15803D] hover:bg-emerald-700 text-white'
                  : isPending
                  ? 'bg-[#B45309] hover:bg-amber-700 text-white'
                  : 'bg-[#B91C1C] hover:bg-rose-800 text-white'
              }`}
            >
              <RotateCcw className="w-5 h-5" />
              <span>Ready for Next Student</span>
            </button>
          </div>
        </div>
      ) : (
        /* ----------------- CAMERA & SCANNER INTERFACE ----------------- */
        <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-sm space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-[#29243A]">Live Camera Entry Scanner</h2>
            <p className="text-xs text-[#6B655D]">
              Hold the student's entry QR pass steady inside the camera viewport.
            </p>
          </div>

          {/* QR Container element required by html5-qrcode */}
          <div className="relative rounded-2xl overflow-hidden bg-[#FFFCF5] border-2 border-[#E8E2D9] min-h-[300px] flex items-center justify-center">
            <div id="qr-reader-container" className="w-full max-w-sm" />

            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-white/95 backdrop-blur-xs">
                <div className="w-16 h-16 rounded-3xl bg-[#FFF0D9] border border-[#E99A20]/40 text-[#6D28D9] flex items-center justify-center shadow-xs">
                  <Camera className="w-8 h-8 text-[#E99A20]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-[#29243A]">
                    Scanner is Idle
                  </h3>
                  <p className="text-xs text-[#6B655D] max-w-xs">
                    Click the button below to activate the rear camera for fast scanning.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-6 py-3.5 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-sm shadow-xs flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Camera className="w-4 h-4" />
                  <span>Start Camera Scanner</span>
                </button>
              </div>
            )}
          </div>

          {hasCameraPermission === false && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
              <span>
                Camera permission denied. Please allow camera permissions in your browser or use the manual token fallback below.
              </span>
            </div>
          )}

          {/* Scanner Controls (Flashlight, Stop, Manual Fallback) */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isScanning && (
              <>
                {canToggleTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className="px-4 py-2.5 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] border border-[#E8E2D9] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
                    <span>{torchOn ? 'Torch Off' : 'Torch On'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <CameraOff className="w-4 h-4" />
                  <span>Pause Camera</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="px-4 py-2.5 rounded-xl bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Keyboard className="w-4 h-4 text-[#6D28D9]" />
              <span>Manual Pass Token</span>
            </button>
          </div>

          {/* Manual Input Fallback */}
          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#29243A] block">
                  Manual Pass Token Entry
                </label>
                <input
                  type="text"
                  placeholder="Paste or enter PREDIWALI_PASS_... token or hash"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] text-xs font-mono font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={!manualToken.trim() || isProcessing}
                className="w-full py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                Validate Pass
              </button>
            </form>
          )}
        </div>
      )}

      {/* ----------------- SCAN HISTORY MODAL ----------------- */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#E99A20]" />
                <h3 className="text-lg font-bold text-[#29243A]">Your Scan Activity</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-xs font-bold text-[#6B655D] hover:text-[#29243A] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {scanHistory.length === 0 ? (
                <p className="text-xs text-[#6B655D] text-center py-8">
                  No passes scanned during this session yet.
                </p>
              ) : (
                scanHistory.map((scan) => (
                  <div
                    key={scan.id}
                    className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            scan.scan_result === 'ENTRY_APPROVED'
                              ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                              : 'bg-rose-50 text-[#B91C1C] border border-rose-200'
                          }`}
                        >
                          {scan.scan_result}
                        </span>
                        {scan.student_name && (
                          <span className="font-bold text-[#29243A]">{scan.student_name}</span>
                        )}
                        {scan.roll_number && (
                          <span className="font-mono text-[#6D28D9] text-[11px] font-bold">
                            ({scan.roll_number})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#6B655D] block mt-1">
                        {formatKolkataDateTime(scan.scanned_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
