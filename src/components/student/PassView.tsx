import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Clock,
  MapPin,
  Utensils,
  GraduationCap,
  FileText,
  Phone,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { EventSettings, Registration, EntryPass } from '../../types';
import { dataService } from '../../services/dataService';
import { DiyaIcon, RangoliMotif } from '../common/DiyaDecoration';
import { formatINR, formatKolkataDateTime, maskContactNumber } from '../../lib/crypto';
import collegeLogo from '../../assets/logo.png';

interface PassViewProps {
  event: EventSettings;
  registration: Registration;
  pass: EntryPass & { raw_token?: string };
  onBack: () => void;
}

export const PassView: React.FC<PassViewProps> = ({
  event,
  registration,
  pass,
  onBack,
}) => {
  const [livePass, setLivePass] = useState<EntryPass & { raw_token?: string }>(pass);
  const [liveReg, setLiveReg] = useState<Registration>(registration);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const passCardRef = useRef<HTMLDivElement>(null);

  // 1.2-second instant real-time sync: as soon as volunteer scans QR at gate or food counter, pass updates immediately!
  useEffect(() => {
    let isMounted = true;
    const pollPass = async () => {
      try {
        const res = await dataService.syncSinglePass(registration.id);
        if (!isMounted) return;
        if (res.pass) {
          setLivePass((prev) => ({
            ...res.pass!,
            raw_token: pass.raw_token || prev.raw_token || res.pass!.raw_token,
          }));
        }
        if (res.registration) {
          setLiveReg(res.registration);
        }
      } catch (err) {
        console.warn('PassView sync error:', err);
      }
    };

    pollPass();
    const interval = setInterval(pollPass, 1200);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [registration.id, pass.raw_token]);

  useEffect(() => {
    // Generate QR Code with high resolution
    const tokenPayload = livePass.raw_token || livePass.token_hash;
    QRCode.toDataURL(tokenPayload, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#29243A',
        light: '#FFFFFF',
      },
    }).then(setQrDataUrl);

    // Fire festive celebration confetti if pass is VALID and not yet redeemed
    if (livePass.status === 'VALID' && !livePass.redeemed_at) {
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#E99A20', '#6D28D9', '#5B21B6', '#15803D', '#FFF0D9'],
        });
      } catch {
        // Safe fallback
      }
    }
  }, [livePass.raw_token, livePass.token_hash, livePass.status, livePass.redeemed_at]);

  // Export Pass as PDF
  const handleDownloadPdf = async () => {
    if (!passCardRef.current) return;
    setIsExportingPdf(true);

    try {
      const element = passCardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 190;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const positionY = 15;

      pdf.addImage(imgData, 'PNG', 10, positionY, imgWidth, imgHeight);
      pdf.save(`PreDiwali_EntryPass_${liveReg.normalized_roll_number}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Download QR Code Image
  const handleDownloadQrImage = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `PreDiwali_QR_${liveReg.normalized_roll_number}.png`;
    a.click();
  };

  // Print Pass
  const handlePrint = () => {
    window.print();
  };

  // Computed real-time checkpoint states
  const isGateAdmitted = Boolean(livePass.redeemed_at) || livePass.status === 'USED';
  const isDinnerClaimed = Boolean(livePass.dinner_redeemed_at);

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-[#6B655D] hover:text-[#6D28D9] transition-colors cursor-pointer font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Action Buttons & Real-Time Pulse */}
        <div className="flex items-center gap-2">
          {/* Live Real-time Indicator */}
          <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15803D] text-[11px] font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Sync</span>
          </div>

          <button
            type="button"
            onClick={handleDownloadQrImage}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] text-xs font-semibold border border-[#E8E2D9] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Download QR code PNG"
          >
            <Download className="w-4 h-4 text-[#E99A20]" />
            <span className="hidden sm:inline">QR PNG</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="px-3.5 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Download PDF Pass</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white hover:bg-[#FFFCF5] text-[#29243A] text-xs font-semibold border border-[#E8E2D9] flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Print Pass"
          >
            <Printer className="w-4 h-4 text-[#6B655D]" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* ----------------- FESTIVE ENTRY PASS CARD ----------------- */}
      <div
        ref={passCardRef}
        className="relative overflow-hidden rounded-3xl bg-white border-2 border-[#E8E2D9] p-6 sm:p-8 shadow-sm space-y-6"
      >
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-[#E8E2D9] gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs flex items-center justify-center">
              <img
                src={collegeLogo}
                alt={`${event.college_name} Logo`}
                className="w-12 h-12 object-contain"
              />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest font-bold text-[#6B655D]">
                {event.college_name}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[#29243A]">
                {event.name}
              </h2>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end">
            <span className="text-[10px] uppercase tracking-wider text-[#6B655D] font-bold">
              Pass Status
            </span>
            {isDinnerClaimed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-300 text-xs font-bold mt-1 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ALL CHECKPOINTS DONE
              </span>
            ) : isGateAdmitted ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-[#6D28D9] border border-purple-300 text-xs font-bold mt-1 shadow-xs animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#6D28D9]" /> GATE ADMITTED — READY FOR DINNER
              </span>
            ) : livePass.status === 'VALID' ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 text-xs font-bold mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ENTRY PASS VALID
              </span>
            ) : livePass.status === 'USED' ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-[#B45309] border border-amber-200 text-xs font-bold mt-1">
                ALREADY REDEEMED (USED)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-[#B91C1C] border border-rose-200 text-xs font-bold mt-1">
                <XCircle className="w-3.5 h-3.5" /> {livePass.status}
              </span>
            )}
          </div>
        </div>

        {/* Main Pass Body: QR Code & Student Information */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
          {/* QR Code Container */}
          <div className="sm:col-span-5 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-center space-y-3">
            {qrDataUrl ? (
              <div className="p-2.5 bg-white rounded-2xl border border-[#E8E2D9] shadow-xs">
                <img
                  src={qrDataUrl}
                  alt="Student Entry QR Pass"
                  className="w-48 h-48 sm:w-44 sm:h-44 rounded-lg"
                />
              </div>
            ) : (
              <div className="w-44 h-44 bg-[#FFF0D9] rounded-2xl flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#E99A20]" />
              </div>
            )}
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase tracking-widest text-[#E99A20] font-black block">
                Strict 1-Time Entry
              </span>
              <span className="text-[11px] text-[#29243A] font-mono font-bold">
                {liveReg.normalized_roll_number}
              </span>
            </div>
          </div>

          {/* Student Credential Details */}
          <div className="sm:col-span-7 space-y-3 text-xs sm:text-sm">
            <div className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9]">
              <span className="text-[#6B655D] text-[11px] font-semibold block">Student Name</span>
              <span className="text-base font-bold text-[#29243A] block">
                {liveReg.full_name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9]">
                <span className="text-[#6B655D] text-[11px] font-semibold block">College Roll No</span>
                <span className="text-sm font-bold text-[#6D28D9] font-mono block">
                  {liveReg.normalized_roll_number}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9]">
                <span className="text-[#6B655D] text-[11px] font-semibold block">Academic Year</span>
                <span className="text-sm font-bold text-[#29243A] block">
                  {liveReg.academic_year} (Undergraduate)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[#FFF0D9] border border-[#E99A20]/40">
                <span className="text-[#B45309] text-[11px] block font-bold">
                  Food Coupon
                </span>
                <span className="text-sm font-black text-[#29243A] block">
                  {liveReg.food_preference} Dinner
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9]">
                <span className="text-[#6B655D] text-[11px] font-semibold block">Contact</span>
                <span className="text-xs font-medium text-[#29243A] block">
                  {maskContactNumber(liveReg.contact_number)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[11px] text-[#6B655D] space-y-1">
              <div className="flex justify-between">
                <span>Reg ID:</span>
                <span className="font-mono text-[#29243A] font-semibold">{liveReg.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Status:</span>
                <span className="font-bold text-[#15803D]">
                  {liveReg.payment_status} ({formatINR(liveReg.expected_amount_minor_units, liveReg.currency)})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2-Step Checkpoint Status (Gate Entry QR + Dinner QR Scan) */}
        <div className="p-4 rounded-2xl bg-[#FFF0D9]/50 border border-[#E99A20]/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#6D28D9] uppercase tracking-wider">
              2-Step QR Verification Checkpoints
            </span>
            <span className="text-[10px] text-[#6B655D]">Scan same QR at both stations</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Step 1: Main Gate Entry */}
            <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
              isGateAdmitted
                ? 'bg-emerald-50 border-emerald-300 text-[#15803D]'
                : 'bg-white border-[#E8E2D9] text-[#29243A]'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                  isGateAdmitted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#FFF0D9] text-[#E99A20]'
                }`}>
                  1
                </div>
                <div>
                  <span className="text-xs font-bold block">1st Scan: Gate Entry</span>
                  <span className="text-[10px] text-[#6B655D]">Main Entrance admission</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isGateAdmitted
                  ? 'bg-emerald-100 text-[#15803D]'
                  : 'bg-slate-100 text-[#6B655D]'
              }`}>
                {isGateAdmitted ? `✓ Admitted ${livePass.redeemed_at ? formatKolkataDateTime(livePass.redeemed_at) : ''}` : 'Pending Scan'}
              </span>
            </div>

            {/* Step 2: Dinner Food Counter */}
            <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
              isDinnerClaimed
                ? 'bg-amber-50 border-amber-300 text-[#B45309]'
                : isGateAdmitted
                ? 'bg-purple-50 border-purple-300 text-[#6D28D9]'
                : 'bg-slate-50/60 border-slate-200 text-[#6B655D]'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                  isDinnerClaimed
                    ? 'bg-[#E99A20] text-white'
                    : isGateAdmitted
                    ? 'bg-[#6D28D9] text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  2
                </div>
                <div>
                  <span className="text-xs font-bold block">2nd Scan: Dinner Coupon</span>
                  <span className="text-[10px] text-[#6B655D]">{liveReg.food_preference} Food Counter</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isDinnerClaimed
                  ? 'bg-amber-100 text-[#B45309]'
                  : isGateAdmitted
                  ? 'bg-purple-100 text-[#6D28D9] animate-pulse'
                  : 'bg-rose-50 text-[#B91C1C]'
              }`}>
                {isDinnerClaimed
                  ? `✓ Claimed ${livePass.dinner_redeemed_at ? formatKolkataDateTime(livePass.dinner_redeemed_at) : ''}`
                  : isGateAdmitted
                  ? 'Ready for Dinner'
                  : '🔒 Scan Gate First'}
              </span>
            </div>
          </div>
        </div>

        {/* Event Logistics & Instructions Banner */}
        <div className="pt-4 border-t border-[#E8E2D9] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#29243A]">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-[#E99A20] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#29243A]">
                {formatKolkataDateTime(event.event_date)}
              </span>
              <span className="text-[#6B655D] text-[11px]">Gate Entry starts 5:30 PM</span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-[#E99A20] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[#29243A]">{event.venue}</span>
              <span className="text-[#6B655D] text-[11px]">Present pass at Gate 1 or Gate 2</span>
            </div>
          </div>
        </div>

        {/* Security Notice Footer */}
        <div className="p-3.5 rounded-2xl bg-[#FFF0D9]/70 border border-[#E99A20]/30 text-center text-[11px] text-[#29243A] leading-relaxed font-medium">
          Important: Carry your college physical ID card alongside this pass. This QR code allows entry strictly once. Do not share screenshots or post your pass publicly.
        </div>
      </div>
    </div>
  );
};
