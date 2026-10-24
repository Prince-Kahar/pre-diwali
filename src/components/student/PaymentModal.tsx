import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
  Loader2,
  ShieldAlert,
  UploadCloud,
  ImageIcon,
  Trash2,
  Zap,
  Download,
  X,
} from 'lucide-react';
import { EventSettings, Registration, PaymentRecord } from '../../types';
import { formatINR } from '../../lib/crypto';
import { dataService } from '../../services/dataService';
import collegeLogo from '../../assets/logo.png';
import paymentQrImage from '../../assets/payment-qr.png';

interface PaymentModalProps {
  event: EventSettings;
  registration: Registration;
  onPaymentSuccess: () => void;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  event,
  registration,
  onPaymentSuccess,
  onClose,
}) => {
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [existingPayment, setExistingPayment] = useState<PaymentRecord | undefined>();

  // Authoritative amount - ensure ₹300 is displayed and used in UPI intent
  const feeMinor =
    registration.expected_amount_minor_units === 25000 || !registration.expected_amount_minor_units
      ? (event.registration_fee_minor_units || 30000)
      : registration.expected_amount_minor_units;
  const amountRupees = (feeMinor / 100).toFixed(2);
  const cleanUpiId = (event.payment_upi_id || 'madhavikalathiya19@oksbi').trim();
  const cleanUpiName = (event.payment_upi_name || '2022_ Madhavi').trim();
  // Standard NPCI UPI URI specification with exact ₹300.00 pre-filled parameter
  const upiQuery = `pa=${cleanUpiId}&pn=${encodeURIComponent(cleanUpiName)}&am=${amountRupees}&cu=${registration.currency || 'INR'}&tn=PreDiwali`;
  const upiIntent = `upi://pay?${upiQuery}`;

  const downloadQrCode = () => {
    if (!upiQrDataUrl) return;
    const a = document.createElement('a');
    a.href = upiQrDataUrl;
    a.download = `PreDiwali_Payment_QR_300.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    // Generate pure clean high-res QR code encoding ₹300.00
    QRCode.toDataURL(upiIntent, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#29243A',
        light: '#FFFFFF',
      },
    }).then(setUpiQrDataUrl);

    // Check existing payment
    const p = dataService.getPaymentForRegistration(registration.id);
    if (p) {
      setExistingPayment(p);
      if (p.transaction_reference) {
        setTransactionRef(p.transaction_reference);
      }
      if (p.screenshot_url) {
        setScreenshotPreview(p.screenshot_url);
      }
    }
  }, [registration.id, upiIntent]);

  // Periodic auto-detection: as soon as payment is approved, immediately open QR Pass
  useEffect(() => {
    const checkApproval = async () => {
      try {
        let reg = dataService.getRegistrationById(registration.id);
        if (!reg || reg.payment_status !== 'PAID') {
          await dataService.initSupabase();
          reg = dataService.getRegistrationById(registration.id);
        }
        if (reg && reg.payment_status === 'PAID') {
          await dataService.issueEntryPass(reg.id);
          onPaymentSuccess();
        }
      } catch (err) {
        console.warn('Auto approval check error:', err);
      }
    };

    const intervalId = setInterval(checkApproval, 3500);
    return () => clearInterval(intervalId);
  }, [registration.id, onPaymentSuccess]);

  const copyUpiId = () => {
    navigator.clipboard.writeText(cleanUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleTriggerUpi = (targetApp: 'any' | 'bhim' = 'any') => {
    const isAndroid = /android/i.test(navigator.userAgent);
    let targetUrl = upiIntent;

    if (isAndroid) {
      if (targetApp === 'bhim') {
        // Direct launch into BHIM app via official NPCI package
        targetUrl = `intent://pay?${upiQuery}#Intent;scheme=upi;package=in.org.npci.upiapp;end;`;
      } else {
        // Standard Android Intent syntax recognized by Chrome to open system UPI chooser
        targetUrl = `intent://pay?${upiQuery}#Intent;scheme=upi;end;`;
      }
    }

    // Direct single navigation without event collision
    window.location.href = targetUrl;
  };

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please upload a valid image file (PNG, JPG, JPEG, WebP)');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Screenshot file size exceeds 5MB limit');
        return;
      }
      setScreenshotFile(file);
      setErrorMsg(null);
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = transactionRef.trim();

    // Reference ID is optional. If provided, validate length
    if (cleanRef && cleanRef.length > 25) {
      setErrorMsg('UPI Reference / UTR Number cannot exceed 25 characters');
      return;
    }

    // Screenshot is COMPULSORY
    if (!screenshotFile && !existingPayment?.screenshot_url && !screenshotPreview) {
      setErrorMsg('Payment screenshot is compulsory. Please upload your payment screenshot to proceed.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let finalScreenshotUrl = existingPayment?.screenshot_url;
      if (screenshotFile) {
        finalScreenshotUrl = await dataService.uploadPaymentScreenshot(screenshotFile, registration.id);
      } else if (screenshotPreview) {
        finalScreenshotUrl = screenshotPreview;
      }

      const updatedPayment = await dataService.submitManualPaymentClaim(
        registration.id,
        cleanRef,
        finalScreenshotUrl
      );
      setExistingPayment(updatedPayment);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit payment reference');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-[#E8E2D9] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 max-w-lg lg:max-w-5xl w-full shadow-2xl relative my-auto max-h-[96vh] overflow-y-auto">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E8E2D9] mb-5 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E8E2D9] p-1 shadow-xs flex items-center justify-center shrink-0">
              <img
                src={collegeLogo}
                alt={`${event.college_name} Logo`}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-[#E99A20] font-black block">
                {event.college_name} • Pre-Diwali 2026
              </span>
              <h2 className="text-lg sm:text-xl font-black text-[#29243A]">
                Registration Payment Portal
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Student & Fee Summary Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40 mb-5 gap-2">
          <div>
            <span className="text-xs text-[#6B655D] font-medium block">
              Student: <strong className="text-[#29243A]">{registration.full_name}</strong> | Roll:{' '}
              <strong className="text-[#6D28D9] font-mono">{registration.normalized_roll_number}</strong>
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#6D28D9]">
              {formatINR(feeMinor, registration.currency)}
            </span>
          </div>
          <div className="text-left sm:text-right text-xs">
            <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-200/60 text-[#B45309] font-bold">
              🍽️ {registration.food_preference} Dinner Included
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#B91C1C]" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* UPI QR Payment */}
        <div className="space-y-6">
            {/* If pending verification, show status */}
            {existingPayment && existingPayment.status === 'PENDING' ? (
              <div className="p-6 rounded-2xl bg-[#FFF0D9]/70 border border-[#E99A20]/40 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#FFF0D9] text-[#B45309] border border-[#E99A20]/40 flex items-center justify-center mx-auto animate-pulse">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#B45309]">
                    Payment Claim Submitted — Pending Verification
                  </h3>
                  <p className="text-xs text-[#6B655D] mt-1 max-w-sm mx-auto leading-relaxed">
                    Submitted Reference ID:{' '}
                    <span className="font-mono font-bold text-[#29243A]">
                      {existingPayment.transaction_reference}
                    </span>
                    . The college cultural committee is verifying your transaction against bank records.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white border border-[#E8E2D9] text-[11px] text-[#6B655D] text-left space-y-1">
                  <p className="font-bold text-[#6D28D9] flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#E99A20]" /> What happens next?
                  </p>
                  <p>
                    Once verified by an admin, your QR Entry Pass will automatically activate! You can return to this page anytime or lookup your Roll Number ({registration.normalized_roll_number}) on the home page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  Close & Check Later
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: QR Code & Pay Now Button (lg:col-span-6) */}
                <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-4 p-4 sm:p-5 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9]">
                    <div className="flex flex-col items-center gap-2.5 w-full">
                      {upiQrDataUrl ? (
                        <div className="p-3.5 bg-white rounded-2xl border border-[#E8E2D9] shadow-xs">
                          <img
                            src={upiQrDataUrl}
                            alt="Pre-Diwali ₹300 UPI QR Code"
                            className="w-48 h-48 sm:w-56 sm:h-56 rounded-lg object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-48 h-48 sm:w-56 sm:h-56 bg-[#FFF0D9] rounded-2xl flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-[#E99A20]" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={downloadQrCode}
                        className="py-2 px-3.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-800" />
                        <span>Download QR (₹300 Auto Set)</span>
                      </button>
                    </div>

                  <div className="text-center space-y-1 w-full">
                    <p className="text-xs text-[#29243A] font-bold">
                      Scan or Click Pay Now with Any UPI App
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="text-[#6B655D]">UPI ID:</span>
                      <span className="font-mono text-[#6D28D9] font-bold select-all">
                        {cleanUpiId}
                      </span>
                      <button
                        type="button"
                        onClick={copyUpiId}
                        className="p-1 text-[#6B655D] hover:text-[#6D28D9] transition-colors cursor-pointer"
                        title="Copy UPI ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {copiedUpi && (
                      <span className="text-[10px] text-[#15803D] font-bold block">
                        ✓ UPI ID copied to clipboard!
                      </span>
                    )}
                  </div>

                  {/* PROMINENT PAY NOW BUTTON FOR ALL UPI APPS */}
                  <div className="w-full space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleTriggerUpi('any')}
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#E99A20] hover:from-[#5B21B6] hover:to-[#D97706] text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-center group active:scale-[0.99]"
                    >
                      <Zap className="w-4 h-4 fill-current text-amber-300 animate-pulse group-hover:scale-110 transition-transform" />
                      <span>⚡ Pay Now (Open Any UPI App)</span>
                    </button>

                    {/* Dedicated BHIM & Gallery Scan Buttons */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => handleTriggerUpi('bhim')}
                        className="py-2.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                        title="Open in BHIM UPI App"
                      >
                        <span>🇮🇳 Open in BHIM</span>
                      </button>
                      <button
                        type="button"
                        onClick={downloadQrCode}
                        className="py-2.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                        title="Save clean QR with ₹300 preset to scan from BHIM gallery"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-700" />
                        <span>Scan via Gallery (₹300)</span>
                      </button>
                    </div>

                    {/* Supported Apps Badges */}
                    <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/60 text-center">
                      <p className="text-[10px] font-bold text-[#6D28D9] uppercase tracking-wider mb-1">
                        Supported on 25+ UPI Apps
                      </p>
                      <p className="text-[10px] text-[#4C1D95] font-medium leading-relaxed">
                        PhonePe • Google Pay • Paytm • BHIM • Amazon Pay • CRED • WhatsApp Pay • super.money • Navi • Groww • Jupiter • Fi • SBI YONO • iMobile • PayZapp • Axis Pay & all UPI apps
                      </p>
                    </div>

                    {/* Helpful Payment Instructions */}
                    <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-2.5 text-left text-xs space-y-1 shadow-2xs">
                      <p className="font-bold text-amber-900 flex items-center gap-1 text-[11px]">
                        <span>ℹ️ Quick Payment Tips:</span>
                      </p>
                      <p className="text-amber-800 text-[10px] leading-relaxed">
                        • <strong>PhonePe / GPay / Paytm:</strong> Tap <strong>"Pay Now"</strong> above to pay ₹{amountRupees} with 1-tap.
                      </p>
                      <p className="text-amber-800 text-[10px] leading-relaxed">
                        • <strong>BHIM App (If redirect is blocked by your device):</strong> Tap <strong>"Scan via Gallery (₹300)"</strong> (saves QR with ₹300 pre-set) → Open BHIM → Tap <strong>Scan</strong> → Tap <strong>Gallery</strong> → Select saved QR. ₹{amountRupees} is pre-filled automatically!
                      </p>
                      <p className="text-amber-800 text-[10px] leading-relaxed">
                        • <strong>Or in BHIM:</strong> Tap <strong>Send</strong> → enter <span className="font-mono font-bold select-all">{cleanUpiId}</span> → enter ₹{amountRupees}.
                      </p>
                      <p className="text-amber-800 text-[10px] leading-relaxed">
                        • <strong>After Payment:</strong> Enter your 12-digit UTR/Ref ID and attach the payment screenshot on the right.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Claim & Compulsory Screenshot (lg:col-span-6) */}
                <div className="lg:col-span-6 flex flex-col justify-between space-y-4 p-4 sm:p-5 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9]">
                  <form onSubmit={handleManualClaimSubmit} className="space-y-4">
                    <div className="pb-2 border-b border-[#E8E2D9]">
                      <h3 className="text-xs font-bold text-[#6D28D9] uppercase tracking-wider">
                        Step 2: Submit Payment Proof
                      </h3>
                      <p className="text-[11px] text-[#6B655D] mt-0.5">
                        Upload your payment screenshot to verify registration
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#29243A] block">
                        UPI Reference / UTR / Transaction ID
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          maxLength={25}
                          placeholder="e.g. 12-digit UTR (123456789012)"
                          value={transactionRef}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
                            setTransactionRef(val);
                            if (errorMsg) setErrorMsg(null);
                          }}
                          className="w-full px-4 py-3 rounded-xl bg-white border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-mono font-medium"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[#6B655D]">
                        <span>Found in your UPI app receipt or SMS</span>
                      </div>
                    </div>

                    {/* COMPULSORY Payment Screenshot Upload */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#29243A] flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4 text-[#6D28D9]" />
                          <span>Payment Screenshot</span>
                          <span className="text-[#B91C1C] font-bold text-[11px]">(Compulsory *)</span>
                        </label>
                        {screenshotPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              setScreenshotFile(null);
                              setScreenshotPreview(null);
                            }}
                            className="text-[11px] text-[#B91C1C] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      {screenshotPreview ? (
                        <div className="p-3 rounded-2xl bg-[#FFF0D9]/50 border border-[#E99A20]/40 flex items-center gap-3">
                          <img
                            src={screenshotPreview}
                            alt="Uploaded payment screenshot"
                            className="w-16 h-16 object-cover rounded-xl border border-[#E8E2D9] shadow-xs"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#29243A] truncate">
                              {screenshotFile ? screenshotFile.name : 'Attached Screenshot'}
                            </p>
                            <p className="text-[10px] text-[#15803D] font-semibold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Screenshot attached & ready</span>
                            </p>
                            <label className="text-[11px] text-[#6D28D9] font-bold hover:underline cursor-pointer inline-block mt-1">
                              <span>Change Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleScreenshotSelect}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-[#E8E2D9] hover:border-[#6D28D9] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-white hover:bg-[#FFF0D9]/30 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-[#FFF0D9] text-[#6D28D9] flex items-center justify-center">
                            <UploadCloud className="w-5 h-5 text-[#6D28D9]" />
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-bold text-[#6D28D9]">
                              Click to upload payment screenshot
                            </span>
                            <p className="text-[10px] text-[#6B655D] mt-0.5">
                              JPG, PNG, WebP up to 5MB (Screenshot from GPay, PhonePe, Paytm, etc.)
                            </p>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleScreenshotSelect}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting Reference...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submit UPI Claim & Screenshot</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

        {/* Close Button */}
        <div className="mt-6 pt-4 border-t border-[#E8E2D9] text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[#6B655D] hover:text-[#29243A] transition-colors cursor-pointer"
          >
            Cancel and Return
          </button>
        </div>
      </div>
    </div>
  );
};
