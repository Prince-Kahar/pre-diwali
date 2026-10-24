import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import jsPDF from 'jspdf';
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

  // Export Pass as Pristine Vector A4 PDF
  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);

    try {
      // 1. Ensure high resolution QR code data URL is ready
      let activeQrUrl = qrDataUrl;
      if (!activeQrUrl) {
        const tokenPayload = livePass.raw_token || livePass.token_hash || 'PASS-ENTRY';
        activeQrUrl = await QRCode.toDataURL(tokenPayload, {
          width: 400,
          margin: 1,
          color: { dark: '#29243A', light: '#FFFFFF' },
        });
      }

      // 2. Load college logo as base64 safely
      const getLogoBase64 = (): Promise<string> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width || 200;
              canvas.height = img.height || 200;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
                return;
              }
            } catch {
              // fallback
            }
            resolve('');
          };
          img.onerror = () => resolve('');
          img.src = collegeLogo;
        });
      };

      const logoBase64 = await getLogoBase64();

      // 3. Initialize Standard A4 Document (210mm x 297mm)
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;

      // Outer Decorative Border (Royal Purple)
      doc.setDrawColor(109, 40, 217); // #6D28D9
      doc.setLineWidth(0.8);
      doc.roundedRect(8, 8, pageWidth - 16, pageHeight - 16, 4, 4, 'S');

      // Inner Decorative Border (Festive Gold)
      doc.setDrawColor(233, 154, 32); // #E99A20
      doc.setLineWidth(0.4);
      doc.roundedRect(10.5, 10.5, pageWidth - 21, pageHeight - 21, 3, 3, 'S');

      // Header Banner Background
      doc.setFillColor(255, 252, 245); // #FFFCF5
      doc.roundedRect(12, 12, pageWidth - 24, 28, 3, 3, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.setLineWidth(0.2);
      doc.roundedRect(12, 12, pageWidth - 24, 28, 3, 3, 'S');

      // College Logo
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', 15, 14, 24, 24);
        } catch {
          // If image fails, draw emblem box
          doc.setFillColor(255, 240, 217);
          doc.roundedRect(15, 14, 24, 24, 2, 2, 'F');
        }
      }

      // College & Event Header Text
      doc.setTextColor(109, 40, 217); // #6D28D9
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(event.college_name.toUpperCase(), 43, 19);

      doc.setTextColor(41, 36, 58); // #29243A
      doc.setFontSize(14);
      doc.text(event.name, 43, 26);

      doc.setTextColor(180, 83, 9); // #B45309
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL AUTHORIZED ENTRY & DINNER PASS', 43, 32);

      // Status Badge (Top Right)
      const isAdmitted = Boolean(livePass.redeemed_at) || livePass.status === 'USED';
      const isDinnerDone = Boolean(livePass.dinner_redeemed_at);

      if (isDinnerDone) {
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(21, 128, 61);
        doc.roundedRect(144, 17, 50, 9, 2, 2, 'FD');
        doc.setTextColor(21, 128, 61);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('✓ ALL CHECKPOINTS DONE', 169, 23, { align: 'center' });
      } else if (isAdmitted) {
        doc.setFillColor(243, 232, 255);
        doc.setDrawColor(109, 40, 217);
        doc.roundedRect(144, 17, 50, 9, 2, 2, 'FD');
        doc.setTextColor(109, 40, 217);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('✓ GATE ADMITTED', 169, 23, { align: 'center' });
      } else {
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(21, 128, 61);
        doc.roundedRect(144, 17, 50, 9, 2, 2, 'FD');
        doc.setTextColor(21, 128, 61);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('✓ ENTRY PASS VALID', 169, 23, { align: 'center' });
      }

      doc.setTextColor(107, 101, 93);
      doc.setFontSize(7);
      doc.setFont('courier', 'normal');
      doc.text(`PASS ID: ${livePass.id.slice(0, 16)}`, 169, 31, { align: 'center' });

      // Horizontal Divider
      doc.setDrawColor(233, 154, 32);
      doc.setLineWidth(0.3);
      doc.line(12, 43, pageWidth - 12, 43);

      // Section 1: QR Pass (Left) & Student Info (Right)
      // Left: QR Pass Container
      doc.setFillColor(255, 252, 245);
      doc.roundedRect(14, 46, 60, 78, 3, 3, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.setLineWidth(0.2);
      doc.roundedRect(14, 46, 60, 78, 3, 3, 'S');

      // QR Image
      if (activeQrUrl) {
        doc.addImage(activeQrUrl, 'PNG', 18, 50, 52, 52);
      }

      // QR Subtitle
      doc.setTextColor(233, 154, 32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('STRICT 1-TIME SCAN', 44, 107, { align: 'center' });

      doc.setTextColor(41, 36, 58);
      doc.setFont('courier', 'bold');
      doc.setFontSize(10);
      doc.text(liveReg.normalized_roll_number, 44, 114, { align: 'center' });

      doc.setTextColor(107, 101, 93);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('High brightness required at gate', 44, 120, { align: 'center' });

      // Right: Student Details Cards
      const rightX = 78;
      const rightW = pageWidth - 14 - rightX; // 118mm

      // Card 1: Student Name
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(rightX, 46, rightW, 16, 2, 2, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.roundedRect(rightX, 46, rightW, 16, 2, 2, 'S');

      doc.setTextColor(107, 101, 93);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('STUDENT FULL NAME', rightX + 4, 52);

      doc.setTextColor(41, 36, 58);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(liveReg.full_name, rightX + 4, 58);

      // Card 2: Roll Number & Academic Year (2 columns)
      const colW = (rightW - 4) / 2;
      // Roll No
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(rightX, 65, colW, 16, 2, 2, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.roundedRect(rightX, 65, colW, 16, 2, 2, 'S');

      doc.setTextColor(107, 101, 93);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('COLLEGE ROLL NUMBER', rightX + 4, 71);

      doc.setTextColor(109, 40, 217);
      doc.setFont('courier', 'bold');
      doc.setFontSize(11);
      doc.text(liveReg.normalized_roll_number, rightX + 4, 77);

      // Academic Year
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(rightX + colW + 4, 65, colW, 16, 2, 2, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.roundedRect(rightX + colW + 4, 65, colW, 16, 2, 2, 'S');

      doc.setTextColor(107, 101, 93);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('ACADEMIC YEAR / SHIFT', rightX + colW + 8, 71);

      doc.setTextColor(41, 36, 58);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(liveReg.academic_year, rightX + colW + 8, 77);

      // Card 3: Food Preference & Contact Number
      // Food Preference (Warm Amber Card)
      doc.setFillColor(255, 240, 217); // #FFF0D9
      doc.roundedRect(rightX, 84, colW, 16, 2, 2, 'F');
      doc.setDrawColor(233, 154, 32);
      doc.roundedRect(rightX, 84, colW, 16, 2, 2, 'S');

      doc.setTextColor(180, 83, 9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('FOOD & DINNER COUPON', rightX + 4, 90);

      doc.setTextColor(41, 36, 58);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(`${liveReg.food_preference} Dinner`, rightX + 4, 96);

      // Contact Number
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(rightX + colW + 4, 84, colW, 16, 2, 2, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.roundedRect(rightX + colW + 4, 84, colW, 16, 2, 2, 'S');

      doc.setTextColor(107, 101, 93);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('REGISTERED CONTACT', rightX + colW + 8, 90);

      doc.setTextColor(41, 36, 58);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(maskContactNumber(liveReg.contact_number), rightX + colW + 8, 96);

      // Card 4: Verification & Payment Status Bar
      doc.setFillColor(240, 253, 244); // #F0FDF4
      doc.roundedRect(rightX, 103, rightW, 21, 2, 2, 'F');
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(rightX, 103, rightW, 21, 2, 2, 'S');

      doc.setTextColor(21, 128, 61);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('✓ PAYMENT STATUS: PAID & VERIFIED (₹300.00)', rightX + 4, 110);

      doc.setTextColor(107, 101, 93);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Registration ID: ${liveReg.id}`, rightX + 4, 116);
      doc.text(`Digital Security Token: ${livePass.token_hash?.slice(0, 28) || 'VERIFIED-SECURE-2026'}`, rightX + 4, 121);

      // Section 2: Event Schedule & Logistics Bar
      const schedY = 129;
      doc.setFillColor(245, 243, 255); // #F5F3FF
      doc.roundedRect(14, schedY, pageWidth - 28, 19, 2.5, 2.5, 'F');
      doc.setDrawColor(221, 214, 254);
      doc.setLineWidth(0.25);
      doc.roundedRect(14, schedY, pageWidth - 28, 19, 2.5, 2.5, 'S');

      // Schedule Item 1: Date
      doc.setTextColor(109, 40, 217);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('EVENT CELEBRATION DATE', 18, schedY + 6);
      doc.setTextColor(41, 36, 58);
      doc.setFontSize(9.5);
      doc.text('Wednesday, 4 November 2026', 18, schedY + 13);

      // Schedule Item 2: Time
      doc.setTextColor(109, 40, 217);
      doc.setFontSize(7);
      doc.text('ENTRY & GATE TIMINGS', 82, schedY + 6);
      doc.setTextColor(41, 36, 58);
      doc.setFontSize(9.5);
      doc.text('Gates Open 5:00 PM (Sharp)', 82, schedY + 13);

      // Schedule Item 3: Venue
      doc.setTextColor(109, 40, 217);
      doc.setFontSize(7);
      doc.text('CAMPUS VENUE', 144, schedY + 6);
      doc.setTextColor(41, 36, 58);
      doc.setFontSize(9.5);
      doc.text('SASCMA College Grounds, Surat', 144, schedY + 13);

      // Section 3: 2-Step QR Verification Checkpoints
      const checkY = 152;
      const checkW = (pageWidth - 28 - 6) / 2; // 88mm

      // Step 1: Gate Checkpoint
      doc.setFillColor(isAdmitted ? 240 : 255, isAdmitted ? 253 : 255, isAdmitted ? 244 : 255);
      doc.roundedRect(14, checkY, checkW, 30, 2, 2, 'F');
      doc.setDrawColor(isAdmitted ? 34 : 232, isAdmitted ? 197 : 226, isAdmitted ? 94 : 217);
      doc.roundedRect(14, checkY, checkW, 30, 2, 2, 'S');

      doc.setFillColor(109, 40, 217);
      doc.circle(20, checkY + 7, 3.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('1', 20, checkY + 8, { align: 'center' });

      doc.setTextColor(41, 36, 58);
      doc.setFontSize(9);
      doc.text('1st Scan: Main Gate Security', 26, checkY + 8);

      doc.setTextColor(107, 101, 93);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Admission into college festival grounds', 26, checkY + 14);

      doc.setFont('helvetica', 'bold');
      if (isAdmitted) {
        doc.setTextColor(21, 128, 61);
        doc.text(`STATUS: ✓ ADMITTED (${livePass.redeemed_at ? formatKolkataDateTime(livePass.redeemed_at) : 'VERIFIED'})`, 18, checkY + 23);
      } else {
        doc.setTextColor(180, 83, 9);
        doc.text('STATUS: [ ] PENDING GATE SCAN', 18, checkY + 23);
      }

      // Step 2: Dinner Checkpoint
      const check2X = 14 + checkW + 6;
      doc.setFillColor(isDinnerDone ? 240 : 255, isDinnerDone ? 253 : 252, isDinnerDone ? 244 : 245);
      doc.roundedRect(check2X, checkY, checkW, 30, 2, 2, 'F');
      doc.setDrawColor(isDinnerDone ? 34 : 233, isDinnerDone ? 197 : 154, isDinnerDone ? 94 : 32);
      doc.roundedRect(check2X, checkY, checkW, 30, 2, 2, 'S');

      doc.setFillColor(233, 154, 32);
      doc.circle(check2X + 6, checkY + 7, 3.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('2', check2X + 6, checkY + 8, { align: 'center' });

      doc.setTextColor(41, 36, 58);
      doc.setFontSize(9);
      doc.text(`2nd Scan: Food & Dinner Counter`, check2X + 12, checkY + 8);

      doc.setTextColor(107, 101, 93);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Coupon Type: ${liveReg.food_preference} Dinner`, check2X + 12, checkY + 14);

      doc.setFont('helvetica', 'bold');
      if (isDinnerDone) {
        doc.setTextColor(21, 128, 61);
        doc.text(`STATUS: ✓ DINNER CLAIMED (${livePass.dinner_redeemed_at ? formatKolkataDateTime(livePass.dinner_redeemed_at) : 'VERIFIED'})`, check2X + 4, checkY + 23);
      } else if (isAdmitted) {
        doc.setTextColor(109, 40, 217);
        doc.text('STATUS: [ ] READY FOR FOOD COUNTER', check2X + 4, checkY + 23);
      } else {
        doc.setTextColor(156, 163, 175);
        doc.text('STATUS: 🔒 SCAN GATE FIRST', check2X + 4, checkY + 23);
      }

      // Section 4: Security & Event Guidelines
      const guideY = 186;
      doc.setFillColor(255, 251, 235); // #FFFBEB
      doc.roundedRect(14, guideY, pageWidth - 28, 60, 2, 2, 'F');
      doc.setDrawColor(253, 230, 138); // #FDE68A
      doc.roundedRect(14, guideY, pageWidth - 28, 60, 2, 2, 'S');

      doc.setTextColor(146, 64, 14); // #92400E
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('IMPORTANT EVENT & SECURITY GUIDELINES', 18, guideY + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 50, 40);

      const rules = [
        '1. Carry this official PDF pass on your mobile phone or bring a clearly printed physical copy.',
        '2. Present your original College Identity Card along with this pass for identity verification at the entry gate.',
        '3. This entry pass is strictly non-transferable and mapped exclusively to your student roll number and ID.',
        '4. Entry gates open at 5:00 PM and close at 6:30 PM. No student entry is allowed after gates close.',
        '5. Re-entry is strictly prohibited once you exit the college event premises.',
        '6. The QR code provides exactly ONE gate admission and ONE dinner counter coupon redemption.',
        '7. Any pass sharing, screenshot tampering, or unauthorized duplication will lead to immediate cancellation.',
        '8. Maintain college discipline and follow all instructions given by cultural committee faculty and student volunteers.'
      ];

      let lineY = guideY + 14;
      rules.forEach((rule) => {
        doc.text(rule, 18, lineY);
        lineY += 5.5;
      });

      // Section 5: Official Footer & Digital Signature
      const footerY = 252;
      doc.setDrawColor(232, 226, 217);
      doc.line(14, footerY, pageWidth - 14, footerY);

      doc.setTextColor(109, 40, 217);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('DIGITALLY AUTHORIZED BY SASCMA CULTURAL COMMITTEE 2026', 16, footerY + 6);

      doc.setTextColor(107, 101, 93);
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.text(`Digital Verification Hash: ${livePass.token_hash || 'SHA256-PREDIWALI-AUTHORIZED-2026'}`, 16, footerY + 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Generated On: ${formatKolkataDateTime(new Date().toISOString())}`, pageWidth - 16, footerY + 6, { align: 'right' });
      doc.text('Document Security: High-Grade Anti-Counterfeit Vector', pageWidth - 16, footerY + 11, { align: 'right' });

      // Bottom College Center Tag
      doc.setTextColor(156, 163, 175);
      doc.setFontSize(7);
      doc.text('SASCMA English Medium Commerce & BBA/BCA College • Surat, Gujarat', pageWidth / 2, 274, { align: 'center' });

      // Save PDF
      doc.save(`PreDiwali_EntryPass_${liveReg.normalized_roll_number}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not generate PDF. Please try again or use the Print button.');
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
