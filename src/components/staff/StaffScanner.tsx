import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
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
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { EventSettings, UserProfile, ScanVerificationResult, EntryScanLog, ScanType } from '../../types';
import { dataService } from '../../services/dataService';
import { formatKolkataDateTime } from '../../lib/crypto';
import { sound } from '../../lib/sound';
import collegeLogo from '../../assets/logo.png';

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
  // Dual Scan Mode: ENTRY (Gate) or DINNER (Food counter)
  const [scanType, setScanType] = useState<ScanType>('ENTRY');
  const scanTypeRef = useRef<ScanType>('ENTRY');
  scanTypeRef.current = scanType;

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
  const [soundEnabled, setSoundEnabled] = useState(sound.isSoundEnabled());

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cooldownRef = useRef(false);
  const recentlyProcessedTokensRef = useRef<Map<string, number>>(new Map());

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.setSoundEnabled(next);
    if (next) {
      sound.init();
      sound.playScanBeep();
    }
  };

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

    // Initialize Supabase sync for cross-device passes
    dataService.initSupabase().then(() => {
      loadStaffScans();
    });

    const unsubscribeRealtime = dataService.subscribeToRealtimeChanges(() => {
      loadStaffScans();
    });

    // Real-time continuous background sync (every 1.5s) to guarantee instant multi-device accuracy
    const syncInterval = setInterval(() => {
      dataService.initSupabase().then(() => {
        loadStaffScans();
      });
    }, 1500);

    return () => {
      stopCamera();
      clearInterval(syncInterval);
      if (unsubscribeRealtime) unsubscribeRealtime();
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
    sound.init(); // Unlock Web Audio API context immediately on user click

    // Clean up any existing scanner instance properly before starting fresh
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn('Previous camera instance cleanup notice:', e);
      }
      scannerRef.current = null;
    }

    try {
      const container = document.getElementById('qr-reader-container');
      if (!container) {
        setTimeout(startCamera, 100);
        return;
      }

      // Dedicated pure QR code decoder (stable, no BarcodeDetector crashes)
      scannerRef.current = new Html5Qrcode('qr-reader-container', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const scanConfig = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(edge * 0.85);
          return { width: size, height: size };
        },
      };

      const onScanSuccess = async (decodedText: string) => {
        if (cooldownRef.current || isProcessing) return;
        let cleanToken = decodedText.trim();
        if (!cleanToken) return;

        // Clean token if wrapped in quotes or URL
        if (cleanToken.startsWith('"') && cleanToken.endsWith('"')) {
          cleanToken = cleanToken.slice(1, -1).trim();
        }
        const urlMatch = cleanToken.match(/[?&]token=([^&]+)/i);
        if (urlMatch) {
          cleanToken = decodeURIComponent(urlMatch[1]).trim();
        }
        const tokenMatch = cleanToken.match(/PREDIWALI_PASS_[a-f0-9]+/i);
        if (tokenMatch) {
          cleanToken = tokenMatch[0];
        }

        // Prevent accidental instant duplicate auto-scans for the same token in this scan mode
        const now = Date.now();
        const currentMode = scanTypeRef.current || scanType;
        const scanKey = `${currentMode}_${cleanToken}`;
        const lastTime = recentlyProcessedTokensRef.current.get(scanKey);
        if (lastTime && now - lastTime < 2500) {
          return;
        }

        // INSTANT AUDIO BEEP on verified QR Detection!
        sound.playScanBeep();

        cooldownRef.current = true;
        recentlyProcessedTokensRef.current.set(scanKey, now);

        // Stop camera cleanly in background so it never scans twice
        await stopCamera();

        // Process the single verified scan with synchronous current mode
        await handleProcessToken(cleanToken, currentMode);
      };

      try {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          scanConfig,
          onScanSuccess,
          () => {}
        );
      } catch (camErr) {
        console.warn('Environment facing mode failed, falling back to default camera:', camErr);
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const rearCam =
            cameras.find(
              (c) =>
                c.label.toLowerCase().includes('back') ||
                c.label.toLowerCase().includes('rear') ||
                c.label.toLowerCase().includes('environment')
            ) || cameras[0];
          await scannerRef.current.start(
            rearCam.id,
            scanConfig,
            onScanSuccess,
            () => {}
          );
        } else {
          throw camErr;
        }
      }

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
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Camera stop error:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
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

  const handleProcessToken = async (token: string, modeOverride?: ScanType) => {
    const activeMode = modeOverride || scanTypeRef.current || scanType;
    setIsProcessing(true);
    try {
      const result = await dataService.redeemEntryPass(
        token.trim(),
        staffUser.id,
        `${activeMode.toLowerCase()}-${Date.now()}`,
        activeMode
      );
      setScanResult(result);
      loadStaffScans();

      // Play authoritative audio feedback
      if (result.success) {
        sound.playSuccessChime();
      } else {
        sound.playErrorBuzz();
      }
    } catch (err: unknown) {
      sound.playErrorBuzz();
      setScanResult({
        success: false,
        status: 'INVALID_PASS',
        scan_type: activeMode,
        message: err instanceof Error ? err.message : 'Error validating pass',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    const clean = manualToken.trim();
    sound.playScanBeep();
    stopCamera();
    await handleProcessToken(clean, scanTypeRef.current);
    setManualToken('');
    setShowManualInput(false);
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sound.init();
    try {
      setIsProcessing(true);
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader-container', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }
      const decodedText = await scannerRef.current.scanFile(file, true);
      sound.playScanBeep();
      stopCamera();
      await handleProcessToken(decodedText, scanTypeRef.current);
    } catch (err) {
      sound.playErrorBuzz();
      alert('Could not detect a valid QR code from this image. Please make sure the QR code is clearly visible.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetForNextScan = async () => {
    sound.init();
    setScanResult(null);
    cooldownRef.current = false;
    recentlyProcessedTokensRef.current.clear();
    await startCamera();
  };

  const switchScanMode = async (mode: ScanType) => {
    if (scanTypeRef.current === mode && scanType === mode) return;
    sound.init();
    scanTypeRef.current = mode;
    setScanType(mode);
    setScanResult(null);
    cooldownRef.current = false;
    recentlyProcessedTokensRef.current.clear();
    await startCamera();
  };

  // Determine status color theme based on scan mode & result code
  const isApproved = scanResult?.status === 'ENTRY_APPROVED' || scanResult?.status === 'DINNER_APPROVED';
  const isPending = scanResult?.status === 'PAYMENT_NOT_VERIFIED';
  const isAlreadyUsed = scanResult?.status === 'ALREADY_USED' || scanResult?.status === 'ALREADY_CLAIMED_DINNER';
  const isRejected = scanResult && !isApproved && !isPending;

  return (
    <div
      onPointerDown={() => sound.init()}
      className="max-w-2xl mx-auto py-6 space-y-6 bg-[#FFFCF5]"
    >
      {/* Staff Header */}
      <div className="flex items-center justify-between p-4 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white border border-[#E8E2D9] p-1 flex items-center justify-center shadow-xs shrink-0">
            <img
              src={collegeLogo}
              alt={`${event.college_name} Logo`}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider font-bold text-[#E99A20]">
                {scanType === 'ENTRY' ? '🚪 Main Gate Entry' : '🍽️ Dinner Counter'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 font-semibold">
                Staff Verified
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

          {/* Audio Beep Feedback Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`p-2.5 rounded-xl border text-xs flex items-center gap-1.5 transition-colors cursor-pointer font-bold shadow-xs ${
              soundEnabled
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-[#15803D]'
                : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-[#B91C1C]'
            }`}
            title={soundEnabled ? 'Scan Beep Sound is ON (Click to Mute)' : 'Scan Sound is Muted (Click to Enable)'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#15803D]" /> : <VolumeX className="w-4 h-4 text-[#B91C1C]" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Beep ON' : 'Muted'}</span>
          </button>

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

      {/* ----------------- SCANNER MODE SELECTOR (ENTRY GATE vs DINNER MEAL) ----------------- */}
      <div className="p-2 bg-white rounded-3xl border border-[#E8E2D9] shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => switchScanMode('ENTRY')}
            className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              scanType === 'ENTRY'
                ? 'bg-[#6D28D9] text-white shadow-md'
                : 'bg-[#FFFCF5] text-[#6B655D] hover:bg-[#FFF0D9] hover:text-[#29243A]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>🚪 1. Entry Gate Scan</span>
          </button>

          <button
            type="button"
            onClick={() => switchScanMode('DINNER')}
            className={`py-3 px-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              scanType === 'DINNER'
                ? 'bg-[#E99A20] text-white shadow-md'
                : 'bg-[#FFFCF5] text-[#6B655D] hover:bg-[#FFF0D9] hover:text-[#29243A]'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>🍽️ 2. Dinner Meal Scan</span>
          </button>
        </div>
        <p className="text-[11px] text-[#6B655D] text-center pt-2">
          {scanType === 'ENTRY'
            ? 'Scanning in Main Gate Admission mode (one-time admission entry).'
            : 'Scanning in Food Distribution mode (verifies Regular vs Jain meal coupon).'}
        </p>
      </div>

      {/* ----------------- AUTHORITATIVE RESULT SCREEN ----------------- */}
      {scanResult && (
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
              Verified by: <span className="font-bold text-[#29243A]">{staffUser.display_name}</span> ({scanType} mode)
            </p>
          </div>

          {/* Gate Entry Prerequisite Warning */}
          {scanResult.status === 'GATE_ENTRY_NOT_DONE' && (
            <div className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 text-center space-y-1.5 max-w-md mx-auto shadow-xs">
              <span className="text-xs uppercase font-black tracking-wider block text-amber-900">
                🛑 1st Scan (Gate Entry) Required First!
              </span>
              <p className="text-xs font-semibold leading-relaxed">
                This student has NOT completed Gate Admission scan at the Main Entrance.
                Students must scan their QR at the Main Gate first before food can be distributed.
              </p>
            </div>
          )}

          {/* Student Selfie / Identity Photo (When Available) */}
          {scanResult.identity_photo_url && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <img
                src={scanResult.identity_photo_url}
                alt={scanResult.student_name || 'Student Identity'}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover border-4 border-white shadow-lg ring-2 ring-emerald-500/40"
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#15803D] bg-emerald-100 px-3 py-0.5 rounded-full border border-emerald-300">
                Student Verified Photo
              </span>
            </div>
          )}

          {/* Prominent Dinner Meal Preference Badge (When scanning in DINNER mode) */}
          {scanResult.scan_type === 'DINNER' && scanResult.food_preference && isApproved && (
            <div
              className={`p-4 rounded-2xl border-2 text-center max-w-md mx-auto shadow-xs ${
                scanResult.food_preference === 'Jain'
                  ? 'bg-emerald-100 border-emerald-500 text-emerald-900'
                  : 'bg-amber-100 border-amber-500 text-amber-900'
              }`}
            >
              <span className="text-xs uppercase font-extrabold tracking-wider block">
                Food Token Claimed
              </span>
              <span className="text-2xl font-black block mt-0.5">
                {scanResult.food_preference === 'Jain' ? '🌱 JAIN MEAL' : '🍲 REGULAR MEAL'}
              </span>
              <span className="text-[11px] opacity-80 mt-0.5 block">
                Please serve the verified meal packet
              </span>
            </div>
          )}

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
                    {scanResult.academic_year}
                  </span>
                </div>
              )}
              {scanResult.food_preference && (
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs text-[#29243A] font-bold">Dinner Preference:</span>
                  <span className={`px-3 py-1 rounded-full font-black text-xs ${
                    scanResult.food_preference === 'Jain'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-[#FFF0D9] text-[#E99A20] border border-[#E99A20]/40'
                  }`}>
                    {scanResult.food_preference} Dinner
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prior Scan Details for ALREADY_USED or ALREADY_CLAIMED_DINNER */}
          {isAlreadyUsed && scanResult.previous_scan_at && (
            <div className="p-4 rounded-2xl bg-white border border-[#B91C1C]/40 text-left text-xs space-y-1 max-w-md mx-auto shadow-xs">
              <p className="font-bold text-[#B91C1C] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#B91C1C]" />
                <span>
                  {scanResult.status === 'ALREADY_CLAIMED_DINNER'
                    ? 'Original Dinner Scan Timestamp:'
                    : 'Original Entry Gate Timestamp:'}
                </span>
              </p>
              <p className="text-[#29243A] font-semibold">
                {formatKolkataDateTime(scanResult.previous_scan_at)}
              </p>
              {scanResult.previous_staff_name && (
                <p className="text-[#6B655D] text-[11px] pt-1">
                  Previously Scanned by: <span className="font-bold text-[#29243A]">{scanResult.previous_staff_name}</span>
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
      )}

      {/* ----------------- CAMERA & SCANNER INTERFACE ----------------- */}
      <div className={`p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-sm space-y-6 ${scanResult ? 'hidden' : 'block'}`}>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-[#29243A]">
              Live Camera {scanType === 'ENTRY' ? 'Gate Admission' : 'Dinner Counter'} Scanner
            </h2>
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
                    Scanner is Idle ({scanType === 'ENTRY' ? 'Gate Entry' : 'Dinner Counter'})
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
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] border border-[#E8E2D9] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Scan QR from photo or screenshot"
            >
              <ImageIcon className="w-4 h-4 text-[#E99A20]" />
              <span>Upload QR Photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileScan}
              className="hidden"
            />

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
                  Manual Pass Token / Roll No Entry ({scanType} mode)
                </label>
                <input
                  type="text"
                  placeholder="Paste PREDIWALI_PASS_... token, roll number (e.g. IT2021) or hash"
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
                Validate Pass for {scanType}
              </button>
            </form>
          )}
        </div>

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          scan.scan_type === 'DINNER'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-purple-100 text-purple-800 border border-purple-300'
                        }`}>
                          {scan.scan_type || 'ENTRY'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            scan.scan_result === 'ENTRY_APPROVED' || scan.scan_result === 'DINNER_APPROVED'
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
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[#6B655D]">
                        <span>{formatKolkataDateTime(scan.scanned_at)}</span>
                        {scan.food_preference && (
                          <span className="font-semibold text-[#E99A20]">
                            • {scan.food_preference} Dinner
                          </span>
                        )}
                      </div>
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

