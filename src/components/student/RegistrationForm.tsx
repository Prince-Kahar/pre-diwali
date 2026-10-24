import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  GraduationCap,
  Utensils,
  Phone,
  FileText,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Camera,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { EventSettings, AcademicYear, FoodPreference, Registration } from '../../types';
import { registrationSchema } from '../../lib/validation';
import { formatINR } from '../../lib/crypto';
import { dataService } from '../../services/dataService';
import collegeLogo from '../../assets/logo.png';

interface RegistrationFormProps {
  event: EventSettings;
  onSuccess: (registration: Registration, alreadyRegistered: boolean) => void;
  onCancel: () => void;
  onOpenTerms: () => void;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  event,
  onSuccess,
  onCancel,
  onOpenTerms,
}) => {
  const [formData, setFormData] = useState({
    full_name: '',
    academic_year: 'FY - M.Sc.IT' as AcademicYear,
    food_preference: 'Regular' as FoodPreference,
    contact_number: '',
    roll_number: '',
    consent_agreed: false,
    talent_option: '',
    other_talent_text: '',
  });

  // Student Identity Photo State (Selfie / File Upload)
  const [identityPhoto, setIdentityPhoto] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const identitySectionRef = useRef<HTMLDivElement | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error for this field
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
    setGeneralError(null);
  };

  const getComputedTalent = () => {
    if (formData.talent_option === 'Other') {
      return formData.other_talent_text.trim() ? `Other: ${formData.other_talent_text.trim()}` : '';
    }
    return formData.talent_option || '';
  };

  // Image compressor for lightweight storage and fast rendering
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 520;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const startLiveCamera = async () => {
    setCameraError(null);
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera access error:', err);
      setCameraError('Unable to access camera directly. Please grant permission or choose "Upload from Device".');
    }
  };

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const snapLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 480;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      setIdentityPhoto(dataUrl);
      stopLiveCamera();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setIdentityPhoto(dataUrl);
      stopLiveCamera();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('File compression error:', err);
    }
  };

  const validateForm = (): boolean => {
    const computedTalent = getComputedTalent();
    const result = registrationSchema.safeParse({
      ...formData,
      performance_talent: computedTalent || undefined,
      identity_photo_url: identityPhoto || undefined,
    });
    const formattedErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          formattedErrors[issue.path[0] as string] = issue.message;
        }
      });
    }

    if (formData.talent_option === 'Other' && !formData.other_talent_text.trim()) {
      formattedErrors.other_talent_text = 'Please specify your other performance details (Compulsory when Other is selected)';
    }

    if (!identityPhoto) {
      formattedErrors.identity_photo = 'Please take a selfie or upload your student photo for identity verification';
    }

    if (Object.keys(formattedErrors).length > 0) {
      setFieldErrors(formattedErrors);
      if (formattedErrors.identity_photo && identitySectionRef.current) {
        identitySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmModal(true);
    }
  };

  const handleConfirmAndProceed = async () => {
    setIsSubmitting(true);
    setGeneralError(null);

    const computedTalent = getComputedTalent();

    try {
      const res = await dataService.registerStudent({
        full_name: formData.full_name,
        academic_year: formData.academic_year,
        food_preference: formData.food_preference,
        contact_number: formData.contact_number,
        roll_number: formData.roll_number,
        consent_agreed: formData.consent_agreed,
        performance_talent: computedTalent || undefined,
        identity_photo_url: identityPhoto || undefined,
      });

      setShowConfirmModal(false);
      onSuccess(res.registration, res.alreadyRegistered);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during registration. Please check your details.';
      setGeneralError(msg);
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-10 shadow-sm">
        {/* Back and Title */}
        <div className="flex items-center justify-between pb-6 border-b border-[#E8E2D9] mb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-[#6B655D] hover:text-[#6D28D9] transition-colors cursor-pointer font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Event Details</span>
          </button>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-[#6B655D] font-bold block">Registration Fee</span>
            <span className="text-base sm:text-lg font-black text-[#6D28D9]">
              {formatINR(event.registration_fee_minor_units, event.currency)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white border border-[#E8E2D9] p-1.5 shadow-xs flex items-center justify-center shrink-0">
            <img
              src={collegeLogo}
              alt={`${event.college_name} Logo`}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] uppercase tracking-wider text-[#6B655D] font-bold block">
              {event.college_name}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#29243A] tracking-tight">
              Student Registration Form
            </h2>
            <p className="text-xs text-[#6B655D]">
              Please enter your accurate college credentials. The entry QR pass and food preference will be permanently linked to this roll number.
            </p>
          </div>
        </div>

        {generalError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs sm:text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-[#B91C1C] mt-0.5" />
            <div>
              <p className="font-bold">Registration Notice</p>
              <p className="mt-0.5">{generalError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleOpenConfirm} className="space-y-5">
          {/* Field 1: Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#6D28D9]" />
              <span>Full Name (as per College ID) <span className="text-[#E99A20]">*</span></span>
            </label>
            <input
              type="text"
              name="full_name"
              placeholder="e.g. Ananya Sharma"
              value={formData.full_name}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                fieldErrors.full_name ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
              } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium`}
            />
            {fieldErrors.full_name && (
              <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Grid: Academic Year & Food Preference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 2: Academic Year */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#6D28D9]" />
                <span>Academic Year <span className="text-[#E99A20]">*</span></span>
              </label>
              <select
                name="academic_year"
                value={formData.academic_year}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium cursor-pointer"
              >
                <option value="FY - M.Sc.IT">FY — M.Sc.IT</option>
                <option value="FY - Data Science">FY — Data Science</option>
                <option value="SY - M.Sc.IT">SY — M.Sc.IT</option>
                <option value="SY - Data Science">SY — Data Science</option>
              </select>
            </div>

            {/* Field 3: Food Preference */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-[#6D28D9]" />
                <span>Dinner Preference <span className="text-[#E99A20]">*</span></span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Regular', 'Jain'] as FoodPreference[]).map((pref) => (
                  <label
                    key={pref}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs sm:text-sm cursor-pointer transition-all ${
                      formData.food_preference === pref
                        ? 'bg-[#FFF0D9] border-[#E99A20] text-[#29243A] font-bold shadow-xs'
                        : 'bg-[#FFFCF5] border-[#E8E2D9] text-[#6B655D] hover:bg-[#FFF0D9]/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="food_preference"
                      value={pref}
                      checked={formData.food_preference === pref}
                      onChange={handleInputChange}
                      className="hidden"
                    />
                    <span>{pref} Meal</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Grid: Contact Number & Roll Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 4: Contact Number */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#6D28D9]" />
                <span>Indian Mobile Number <span className="text-[#E99A20]">*</span></span>
              </label>
              <input
                type="tel"
                name="contact_number"
                placeholder="10-digit number (e.g. 9876543210)"
                value={formData.contact_number}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                  fieldErrors.contact_number ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium`}
              />
              {fieldErrors.contact_number && (
                <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.contact_number}</p>
              )}
            </div>

            {/* Field 5: Roll Number */}
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#6D28D9]" />
                <span>College Roll Number <span className="text-[#E99A20]">*</span></span>
              </label>
              <input
                type="text"
                name="roll_number"
                placeholder="e.g. 2021 or FYIT101"
                value={formData.roll_number}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border ${
                  fieldErrors.roll_number ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-mono font-medium`}
              />
              {fieldErrors.roll_number && (
                <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.roll_number}</p>
              )}
            </div>
          </div>

          {/* Field: Talent / Stage Performance Participation */}
          <div className="space-y-2 p-4 rounded-2xl bg-[#FFF0D9]/40 border border-[#E8E2D9]">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#E99A20]" />
                <span>Stage Performance / Talent Participation</span>
              </label>
              <span className="text-[10px] text-[#6B655D] font-bold bg-white px-2.5 py-0.5 rounded-full border border-[#E8E2D9]">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-[#6B655D]">
              Do you want to participate in a stage performance (Dance, Stand-up Comedy, Singing, Skit, or Other)?
            </p>

            <select
              name="talent_option"
              value={formData.talent_option}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9] text-sm font-medium cursor-pointer"
            >
              <option value="">None / Not Participating</option>
              <option value="Dance">Dance</option>
              <option value="Stand-up Comedy">Stand-up Comedy</option>
              <option value="Singing">Singing</option>
              <option value="Drama / Skit">Drama / Skit</option>
              <option value="Other">Other</option>
            </select>

            {/* If Other selected: COMPULSORY Textbox with proper label */}
            {formData.talent_option === 'Other' && (
              <div className="pt-2 space-y-1.5">
                <label className="text-xs font-bold text-[#29243A] flex items-center gap-1">
                  <span>Specify Other Performance / Talent</span>
                  <span className="text-[#B91C1C] font-bold">*</span>
                </label>
                <input
                  type="text"
                  name="other_talent_text"
                  placeholder="e.g. Beatboxing, Mimicry, Poetry, Instrumental..."
                  value={formData.other_talent_text}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-2.5 rounded-xl bg-white border ${
                    fieldErrors.other_talent_text ? 'border-[#B91C1C]' : 'border-[#E8E2D9]'
                  } text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9] text-sm font-medium`}
                />
                {fieldErrors.other_talent_text && (
                  <p className="text-xs text-[#B91C1C] font-medium">{fieldErrors.other_talent_text}</p>
                )}
              </div>
            )}
          </div>

          {/* ----------------- REQUIREMENT: STUDENT IDENTITY / SELFIE PHOTO UPLOAD ----------------- */}
          <div
            ref={identitySectionRef}
            className={`p-5 rounded-3xl border-2 transition-all ${
              fieldErrors.identity_photo
                ? 'bg-rose-50/50 border-[#B91C1C]'
                : identityPhoto
                ? 'bg-[#F0FDF4] border-[#15803D]'
                : 'bg-gradient-to-br from-[#FFF9EE] to-[#FFF0D9]/50 border-[#E99A20]/40'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs sm:text-sm font-bold text-[#29243A] flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-[#E99A20]/20 text-[#6D28D9]">
                  <Camera className="w-4 h-4 text-[#E99A20]" />
                </div>
                <span>
                  Upload Your Identity / Live Selfie <span className="text-[#E99A20] font-black">*</span>
                </span>
              </label>
              {identityPhoto ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-[#15803D] border border-emerald-300 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Photo Attached
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFF0D9] text-[#E99A20] border border-[#E99A20]/30 text-[10px] font-bold">
                  Required for Gate Verification
                </span>
              )}
            </div>

            <p className="text-xs text-[#6B655D] mb-4">
              Take a quick live selfie or upload your student photo. This photo will be verified by entry gate staff and displayed in your pass & admin panel.
            </p>

            {/* Hidden file input for gallery / device upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* If Camera is active: Live camera preview */}
            {isCameraOpen && (
              <div className="mb-4 space-y-3">
                <div className="relative mx-auto w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-black border-2 border-[#6D28D9] shadow-md flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/60 rounded-2xl m-4" />
                </div>

                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={snapLivePhoto}
                    className="px-5 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capture Selfie</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveCamera}
                    className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#29243A] font-semibold text-xs cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {cameraError && (
              <p className="text-xs text-[#B91C1C] mb-3 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                {cameraError}
              </p>
            )}

            {/* Photo Preview when captured / uploaded */}
            {identityPhoto && !isCameraOpen && (
              <div className="p-3 bg-white rounded-2xl border border-[#E8E2D9] flex items-center gap-4 shadow-xs mb-3">
                <img
                  src={identityPhoto}
                  alt="Student Selfie"
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-emerald-500 shadow-xs"
                />
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#15803D]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Identity Photo Captured!</span>
                  </div>
                  <p className="text-[11px] text-[#6B655D]">
                    Ready for Gate Entry and Admin approval.
                  </p>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={startLiveCamera}
                      className="px-3 py-1.5 rounded-lg bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3 h-3 text-[#E99A20]" />
                      <span>Retake Selfie</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-[#FFFCF5] hover:bg-gray-100 text-[#6B655D] border border-[#E8E2D9] font-medium text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Change File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdentityPhoto(null)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                      title="Remove photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons to Capture or Upload */}
            {!identityPhoto && !isCameraOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startLiveCamera}
                  className="p-3.5 rounded-2xl bg-white hover:bg-[#FFF8EE] border border-[#E99A20]/50 text-[#29243A] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <Camera className="w-4 h-4 text-[#6D28D9]" />
                  <span>Take Live Selfie</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3.5 rounded-2xl bg-white hover:bg-[#FFF8EE] border border-[#E8E2D9] text-[#29243A] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.01]"
                >
                  <Upload className="w-4 h-4 text-[#E99A20]" />
                  <span>Upload Photo from Device</span>
                </button>
              </div>
            )}

            {fieldErrors.identity_photo && (
              <p className="text-xs text-[#B91C1C] mt-2 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{fieldErrors.identity_photo}</span>
              </p>
            )}
          </div>

          {/* Field 6: Consent */}
          <div className="pt-2">
            <label className="flex items-start gap-3 p-4 rounded-2xl bg-[#FFF0D9]/50 border border-[#E8E2D9] cursor-pointer">
              <input
                type="checkbox"
                name="consent_agreed"
                checked={formData.consent_agreed}
                onChange={handleInputChange}
                className="mt-0.5 w-4 h-4 rounded text-[#6D28D9] border-[#E8E2D9] focus:ring-[#6D28D9] cursor-pointer"
              />
              <span className="text-xs text-[#29243A] leading-relaxed">
                I agree to the college Pre-Diwali event rules, agree to carry my college physical ID card, and understand that my QR pass is strictly one-time entry only.{' '}
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="text-[#6D28D9] underline hover:text-[#5B21B6] font-bold inline cursor-pointer"
                >
                  View Terms & Rules
                </button>
              </span>
            </label>
            {fieldErrors.consent_agreed && (
              <p className="text-xs text-[#B91C1C] mt-1 pl-1 font-medium">{fieldErrors.consent_agreed}</p>
            )}
          </div>

          {/* ----------------- SUBMIT / PROCEED BUTTONS ----------------- */}
          <div className="pt-4">
            {!identityPhoto ? (
              <button
                type="button"
                onClick={() => {
                  if (validateForm()) {
                    // if photo is missing, validateForm scrolls to it
                  }
                }}
                className="w-full py-4 rounded-2xl bg-[#E99A20] hover:bg-[#D9820D] text-white font-bold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>Upload Your Identity (Take Selfie / Photo)</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>Continue to Payment Review</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] mb-1">
                <Sparkles className="w-6 h-6 text-[#E99A20]" />
              </div>
              <h3 className="text-xl font-bold text-[#29243A]">Confirm Registration Details</h3>
              <p className="text-xs text-[#6B655D]">
                Please verify your details carefully before proceeding to payment.
              </p>
            </div>

            {/* Student Identity Photo in Modal */}
            {identityPhoto && (
              <div className="flex flex-col items-center gap-2 p-3 bg-[#FFFCF5] rounded-2xl border border-[#E8E2D9]">
                <img
                  src={identityPhoto}
                  alt="Student Identity"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[#6D28D9] shadow-sm"
                />
                <span className="text-[11px] font-bold text-[#6D28D9]">
                  Verified Student Identity Photo
                </span>
              </div>
            )}

            <div className="space-y-3 bg-[#FFFCF5] p-4 rounded-2xl border border-[#E8E2D9] text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Student Name:</span>
                <span className="font-bold text-[#29243A]">{formData.full_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Roll Number:</span>
                <span className="font-bold text-[#6D28D9] font-mono">{formData.roll_number.toUpperCase()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Academic Year:</span>
                <span className="font-bold text-[#29243A]">{formData.academic_year}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Food Preference:</span>
                <span className="font-bold text-[#E99A20]">{formData.food_preference} Meal</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Contact Number:</span>
                <span className="font-bold text-[#29243A]">{formData.contact_number}</span>
              </div>
              {getComputedTalent() && (
                <div className="flex justify-between py-1.5 border-b border-[#E8E2D9]">
                  <span className="text-[#6B655D]">Stage Performance:</span>
                  <span className="font-bold text-[#6D28D9]">{getComputedTalent()}</span>
                </div>
              )}
              <div className="flex justify-between py-2 pt-3">
                <span className="text-[#6D28D9] font-bold">Total Registration Fee:</span>
                <span className="font-black text-[#6D28D9] text-base">
                  {formatINR(event.registration_fee_minor_units, event.currency)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={handleConfirmAndProceed}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

