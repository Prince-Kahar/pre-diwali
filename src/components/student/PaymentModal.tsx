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
} from 'lucide-react';
import { EventSettings, Registration, PaymentRecord } from '../../types';
import { formatINR } from '../../lib/crypto';
import { dataService } from '../../services/dataService';
import collegeLogo from '../../assets/logo.png';

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
  const upiIntent = `upi://pay?pa=${encodeURIComponent(event.payment_upi_id)}&pn=${encodeURIComponent(
    event.payment_upi_name
  )}&am=${amountRupees}&cu=${registration.currency || 'INR'}&tn=${encodeURIComponent(
    `Pre-Diwali Roll ${registration.normalized_roll_number}`
  )}`;

  useEffect(() => {
    // Generate UPI QR Code image
    QRCode.toDataURL(upiIntent, {
      width: 280,
      margin: 1.5,
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

  const copyUpiId = () => {
    navigator.clipboard.writeText(event.payment_upi_id);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
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
    if (!cleanRef) {
      setErrorMsg('Please enter your 12-digit UPI Reference / UTR Number');
      return;
    }

    if (cleanRef.length > 12) {
      setErrorMsg('UPI Reference / UTR Number cannot exceed 12 digits');
      return;
    }

    if (cleanRef.length < 8) {
      setErrorMsg('UPI Reference / UTR Number must be at least 8 digits (standard UPI reference is 12 digits)');
      return;
    }

    if (!/^[a-zA-Z0-9]{8,12}$/.test(cleanRef)) {
      setErrorMsg('UPI Reference / UTR must be 8 to 12 alphanumeric characters / digits');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl relative my-8">
        {/* Header */}
        <div className="text-center space-y-1 mb-6">
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#E8E2D9] p-1.5 shadow-xs flex items-center justify-center">
              <img
                src={collegeLogo}
                alt={`${event.college_name} Logo`}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <span className="text-[11px] uppercase tracking-widest text-[#E99A20] font-bold block">
            {event.college_name} • Secure Payment Portal
          </span>
          <h2 className="text-2xl font-black text-[#29243A]">
            Pre-Diwali Registration Payment
          </h2>
          <p className="text-xs text-[#6B655D]">
            Student: <span className="text-[#29243A] font-bold">{registration.full_name}</span> | Roll:{' '}
            <span className="text-[#6D28D9] font-mono font-bold">
              {registration.normalized_roll_number}
            </span>
          </p>
        </div>

        {/* Amount Badge */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40 mb-6">
          <div>
            <span className="text-xs text-[#6B655D] font-medium block">Registration Fee</span>
            <span className="text-xl sm:text-2xl font-black text-[#6D28D9]">
              {formatINR(feeMinor, registration.currency)}
            </span>
          </div>
          <div className="text-right text-xs text-[#29243A]">
            <span className="block font-bold">{registration.food_preference} Dinner Included</span>
            <span className="text-[#B45309] font-mono text-[11px]">Authoritative Snapshot</span>
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
              <>
                {/* QR Display */}
                <div className="flex flex-col items-center justify-center space-y-3 p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9]">
                  {upiQrDataUrl ? (
                    <div className="p-3 bg-white rounded-2xl border border-[#E8E2D9] shadow-xs">
                      <img
                        src={upiQrDataUrl}
                        alt="Pre-Diwali UPI Payment QR"
                        className="w-48 h-48 rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-48 h-48 bg-[#FFF0D9] rounded-2xl flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-[#E99A20]" />
                    </div>
                  )}

                  <div className="text-center space-y-1">
                    <p className="text-xs text-[#29243A] font-bold">
                      Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="text-[#6B655D]">UPI ID:</span>
                      <span className="font-mono text-[#6D28D9] font-bold">
                        {event.payment_upi_id}
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
                        UPI ID copied to clipboard!
                      </span>
                    )}
                  </div>
                </div>

                {/* Submit Claim Form */}
                <form onSubmit={handleManualClaimSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#29243A] block">
                      Enter UPI Reference / UTR / Transaction ID <span className="text-[#E99A20]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={12}
                        placeholder="e.g. 12-digit UTR (123456789012)"
                        value={transactionRef}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
                          setTransactionRef(val);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-mono font-medium pr-16"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#6B655D]">
                        {transactionRef.length}/12
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-[#6B655D]">
                      <span>Enter the 12-digit number from your UPI app receipt (Max 12 digits).</span>
                      {transactionRef.length === 12 ? (
                        <span className="text-[#15803D] font-bold">12 digits entered</span>
                      ) : transactionRef.length > 0 ? (
                        <span className="text-[#B45309] font-medium">{12 - transactionRef.length} digits left</span>
                      ) : null}
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
                      <label className="border-2 border-dashed border-[#E8E2D9] hover:border-[#6D28D9] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#FFFCF5] hover:bg-[#FFF0D9]/30 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-[#FFF0D9] text-[#6D28D9] flex items-center justify-center">
                          <UploadCloud className="w-5 h-5 text-[#6D28D9]" />
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-bold text-[#6D28D9]">
                            Click to upload payment screenshot
                          </span>
                          <p className="text-[11px] text-[#6B655D] mt-0.5">
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
              </>
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
