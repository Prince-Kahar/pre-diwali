import React, { useState, useEffect } from 'react';
import {
  Users,
  CreditCard,
  QrCode,
  Utensils,
  Settings,
  Shield,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  LogOut,
  UserPlus,
  Sparkles,
  ChevronRight,
  IndianRupee,
  History,
  Activity,
  Layers,
  Check,
  AlertCircle,
  ChevronLeft,
  Eye,
  ImageIcon,
} from 'lucide-react';
import {
  EventSettings,
  UserProfile,
  Registration,
  PaymentRecord,
  EntryPass,
  AuditLog,
  DashboardMetrics,
  PaymentStatus,
  FoodPreference,
  AcademicYear,
  PricingHistoryRecord,
  EntryScanLog,
} from '../../types';
import { dataService } from '../../services/dataService';
import { formatINR, formatKolkataDateTime, maskContactNumber } from '../../lib/crypto';
import collegeLogo from '../../assets/logo.png';

interface AdminDashboardProps {
  adminUser: UserProfile;
  event: EventSettings;
  onUpdateEvent: (updated: EventSettings) => void;
  onLogout: () => void;
}

export type AdminTab =
  | 'OVERVIEW'
  | 'REGISTRATIONS'
  | 'PAYMENTS'
  | 'PRICING'
  | 'SETTINGS'
  | 'PASSES'
  | 'STAFF'
  | 'SCANNER_ACTIVITY'
  | 'REPORTS'
  | 'AUDIT';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminUser,
  event,
  onUpdateEvent,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [metrics, setMetrics] = useState<DashboardMetrics>(dataService.getDashboardMetrics());
  const [registrations, setRegistrations] = useState<Array<Registration & { payment?: PaymentRecord; pass?: EntryPass }>>(
    dataService.getAllRegistrations()
  );
  const [pendingPayments, setPendingPayments] = useState<Array<PaymentRecord & { registration?: Registration }>>(
    dataService.getPendingPaymentsQueue()
  );
  const [staffList, setStaffList] = useState<UserProfile[]>(
    dataService.getProfiles().filter((p) => p.role === 'STAFF')
  );
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(dataService.getAuditLogs());
  const [pricingHistory, setPricingHistory] = useState<PricingHistoryRecord[]>(dataService.getPricingHistory());
  const [scansList, setScansList] = useState<EntryScanLog[]>(dataService.getScansList());

  // Filters for registrations table
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<'ALL' | AcademicYear>('ALL');
  const [foodFilter, setFoodFilter] = useState<'ALL' | FoodPreference>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN'>('ALL');

  // Pagination for registrations
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals state
  const [selectedReg, setSelectedReg] = useState<(Registration & { payment?: PaymentRecord; pass?: EntryPass }) | null>(null);
  const [verifyModalPayment, setVerifyModalPayment] = useState<(PaymentRecord & { registration?: Registration }) | null>(null);
  const [rejectModalPayment, setRejectModalPayment] = useState<(PaymentRecord & { registration?: Registration }) | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [viewingScreenshot, setViewingScreenshot] = useState<{
    url: string;
    studentName: string;
    rollNo: string;
    utr: string;
    amount: number;
    currency: string;
    paymentRecord: PaymentRecord & { registration?: Registration };
  } | null>(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [staffFormError, setStaffFormError] = useState('');

  // Event Settings local state
  const [settingsForm, setSettingsForm] = useState<EventSettings>({ ...event });
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Dynamic Pricing local state (Requirements 3 & 4)
  const [pricingFeeRupees, setPricingFeeRupees] = useState((event.registration_fee_minor_units / 100).toString());
  const [pricingEnabled, setPricingEnabled] = useState(event.registration_enabled);
  const [pricingOpensAt, setPricingOpensAt] = useState(event.registration_opens_at ? event.registration_opens_at.slice(0, 16) : '');
  const [pricingClosesAt, setPricingClosesAt] = useState(event.registration_closes_at ? event.registration_closes_at.slice(0, 16) : '');
  const [pricingCapacity, setPricingCapacity] = useState((event.maximum_capacity || event.max_capacity || 1200).toString());
  const [pricingReason, setPricingReason] = useState('');
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [showPriceConfirmModal, setShowPriceConfirmModal] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSuccessMsg, setPricingSuccessMsg] = useState<string | null>(null);
  const [pricingErrorMsg, setPricingErrorMsg] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const refreshAll = () => {
    setMetrics(dataService.getDashboardMetrics());
    setRegistrations(dataService.getAllRegistrations());
    setPendingPayments(dataService.getPendingPaymentsQueue());
    setStaffList(dataService.getProfiles().filter((p) => p.role === 'STAFF'));
    setAuditLogs(dataService.getAuditLogs());
    setPricingHistory(dataService.getPricingHistory());
    setScansList(dataService.getScansList());
  };

  const syncAndRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await dataService.initSupabase();
      refreshAll();
      if (res && res.success) {
        setSyncFeedback(`Real-time Supabase sync successful: ${res.registrationsCount} registrations, ${res.paymentsCount} payments verified live.`);
      } else {
        setSyncFeedback('Data refreshed from local & cloud store.');
      }
    } catch {
      refreshAll();
      setSyncFeedback('Data refreshed.');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  useEffect(() => {
    refreshAll();
    syncAndRefresh();

    // Real-time Postgres changes subscription from Supabase
    const unsubscribe = dataService.subscribeToRealtimeChanges(() => {
      refreshAll();
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Synchronize pricing form when event prop changes
  useEffect(() => {
    setSettingsForm({ ...event });
    setPricingFeeRupees((event.registration_fee_minor_units / 100).toString());
    setPricingEnabled(event.registration_enabled);
    setPricingOpensAt(event.registration_opens_at ? event.registration_opens_at.slice(0, 16) : '');
    setPricingClosesAt(event.registration_closes_at ? event.registration_closes_at.slice(0, 16) : '');
    setPricingCapacity((event.maximum_capacity || event.max_capacity || 1200).toString());
  }, [event]);

  // Filtered registrations
  const filteredRegistrations = registrations.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      r.full_name.toLowerCase().includes(term) ||
      r.normalized_roll_number.toLowerCase().includes(term) ||
      r.contact_number.includes(term) ||
      r.id.toLowerCase().includes(term);

    const matchesYear = yearFilter === 'ALL' || r.academic_year === yearFilter;
    const matchesFood = foodFilter === 'ALL' || r.food_preference === foodFilter;
    const matchesPayment = paymentFilter === 'ALL' || r.payment_status === paymentFilter;

    let matchesEntry = true;
    if (entryFilter === 'CHECKED_IN') {
      matchesEntry = r.pass?.status === 'USED';
    } else if (entryFilter === 'NOT_CHECKED_IN') {
      matchesEntry = r.pass?.status === 'VALID';
    }

    return matchesSearch && matchesYear && matchesFood && matchesPayment && matchesEntry;
  });

  const totalPages = Math.ceil(filteredRegistrations.length / pageSize) || 1;
  const paginatedRegistrations = filteredRegistrations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Verify Payment Handler
  const handleConfirmVerifyPayment = async () => {
    if (!verifyModalPayment) return;
    try {
      await dataService.verifyManualPaymentAdmin(
        verifyModalPayment.id,
        adminUser.id,
        verifyNote || 'Verified manually against college bank UPI transaction records'
      );
      setVerifyModalPayment(null);
      setVerifyNote('');
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to verify payment');
    }
  };

  // Reject Payment Handler
  const handleConfirmRejectPayment = async () => {
    if (!rejectModalPayment) return;
    try {
      await dataService.rejectManualPaymentAdmin(
        rejectModalPayment.id,
        adminUser.id,
        rejectReason || 'Transaction reference not found in bank statement'
      );
      setRejectModalPayment(null);
      setRejectReason('');
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject payment');
    }
  };

  // Revoke Pass Handler
  const handleRevokePass = async (passId: string) => {
    const reason = prompt('Please enter the reason for revoking this entry pass:');
    if (!reason) return;
    try {
      await dataService.revokePassAdmin(passId, adminUser.id, reason);
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to revoke pass');
    }
  };

  // Reissue Pass Handler
  const handleReissuePass = async (passId: string) => {
    const reason = prompt('Reason for reissuing new QR pass credential (old pass will be revoked):');
    if (!reason) return;
    try {
      await dataService.reissuePassAdmin(passId, adminUser.id, reason);
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reissue pass');
    }
  };

  // Create Staff
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail || !newStaffName) {
      setStaffFormError('Please enter both name and email');
      return;
    }
    try {
      dataService.createStaffUser(newStaffEmail, newStaffName, adminUser.id);
      setNewStaffEmail('');
      setNewStaffName('');
      setStaffFormError('');
      refreshAll();
    } catch (err: unknown) {
      setStaffFormError(err instanceof Error ? err.message : 'Error creating staff');
    }
  };

  // Toggle Staff status
  const handleToggleStaffStatus = (staffId: string, currentActive: boolean) => {
    try {
      dataService.toggleStaffStatus(staffId, !currentActive, adminUser.id);
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to toggle staff status');
    }
  };

  // Save General Event Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = dataService.updateEventSettings(settingsForm, adminUser.id);
      onUpdateEvent(updated);
      setSettingsSavedMsg(true);
      setTimeout(() => setSettingsSavedMsg(false), 3000);
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  // Dynamic Registration Pricing Handlers (Requirement 3 & 4)
  const handlePreviewPriceChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPricingErrorMsg(null);
    setPricingSuccessMsg(null);

    const feeNum = parseFloat(pricingFeeRupees);
    if (isNaN(feeNum) || feeNum <= 0) {
      setPricingErrorMsg('Please enter a valid strictly positive registration fee in INR (e.g. 250)');
      return;
    }

    const capNum = parseInt(pricingCapacity, 10);
    if (isNaN(capNum) || capNum <= 0) {
      setPricingErrorMsg('Please enter a valid positive whole number for maximum registration capacity');
      return;
    }

    const opens = new Date(pricingOpensAt).getTime();
    const closes = new Date(pricingClosesAt).getTime();
    if (isNaN(opens) || isNaN(closes)) {
      setPricingErrorMsg('Please enter valid dates and times for registration opening and closing');
      return;
    }
    if (opens >= closes) {
      setPricingErrorMsg('Registration opening date and time must be prior to closing date and time');
      return;
    }

    setShowPriceConfirmModal(true);
  };

  const handleConfirmSavePricing = async () => {
    setPricingSaving(true);
    setPricingErrorMsg(null);
    setPricingSuccessMsg(null);

    const feeMinorUnits = Math.round(parseFloat(pricingFeeRupees) * 100);
    const capacityNum = parseInt(pricingCapacity, 10);

    try {
      const res = await dataService.updateRegistrationPricing(
        {
          registration_fee_minor_units: feeMinorUnits,
          registration_enabled: pricingEnabled,
          registration_opens_at: new Date(pricingOpensAt).toISOString(),
          registration_closes_at: new Date(pricingClosesAt).toISOString(),
          maximum_capacity: capacityNum,
          change_reason: pricingReason.trim() || undefined,
        },
        adminUser.id
      );

      // Successfully saved to persistent store
      onUpdateEvent(res.event);
      setPricingSuccessMsg(
        `Registration fee successfully updated to ${formatINR(res.event.registration_fee_minor_units, res.event.currency)}. Applied to all new registrations!`
      );
      setShowPriceConfirmModal(false);
      setIsEditingPricing(false);
      setPricingReason('');
      refreshAll();
    } catch (err: unknown) {
      setPricingErrorMsg(err instanceof Error ? err.message : 'Failed to persist pricing changes');
      setShowPriceConfirmModal(false);
    } finally {
      setPricingSaving(false);
    }
  };

  const handleCancelPricingChanges = () => {
    setPricingFeeRupees((event.registration_fee_minor_units / 100).toString());
    setPricingEnabled(event.registration_enabled);
    setPricingOpensAt(event.registration_opens_at ? event.registration_opens_at.slice(0, 16) : '');
    setPricingClosesAt(event.registration_closes_at ? event.registration_closes_at.slice(0, 16) : '');
    setPricingCapacity((event.maximum_capacity || event.max_capacity || 1200).toString());
    setPricingReason('');
    setIsEditingPricing(false);
    setPricingErrorMsg(null);
  };

  // CSV Exporter
  const exportRegistrationsCsv = () => {
    const headers = [
      'Registration ID',
      'Student Name',
      'Roll Number',
      'Academic Year',
      'Food Preference',
      'Masked Contact',
      'Payment Status',
      'Amount (INR)',
      'Pass Status',
      'Entry Checked In',
      'Registration Date',
    ];

    const rows = filteredRegistrations.map((r) => [
      r.id,
      `"${r.full_name}"`,
      r.normalized_roll_number,
      r.academic_year,
      r.food_preference,
      maskContactNumber(r.contact_number),
      r.payment_status,
      r.expected_amount_minor_units / 100,
      r.pass?.status || 'NO_PASS',
      r.pass?.status === 'USED' ? 'YES' : 'NO',
      `"${r.created_at}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PreDiwali_Registrations_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[82vh] bg-[#FFFCF5]">
      {/* ----------------- MOBILE NAVIGATION BAR (< lg) ----------------- */}
      <div className="lg:hidden bg-white border border-[#E8E2D9] rounded-3xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white border border-[#E8E2D9] p-0.5 shadow-xs flex items-center justify-center shrink-0">
              <img
                src={collegeLogo}
                alt="College Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#E99A20] block">{event.college_name || 'College Admin'}</span>
              <h2 className="text-xs font-bold text-[#29243A]">{adminUser.display_name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={syncAndRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] border border-[#E8E2D9] text-xs font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-60"
              title="Sync with Supabase in real-time"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#E99A20] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-xl bg-white hover:bg-rose-50 text-[#6B655D] hover:text-[#B91C1C] border border-[#E8E2D9] text-xs transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Horizontal scrollable tab buttons on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'OVERVIEW', label: 'Overview', icon: Layers },
            { id: 'REGISTRATIONS', label: `Registrations (${registrations.length})`, icon: Users },
            { id: 'PAYMENTS', label: `Payments (${pendingPayments.length})`, icon: CreditCard },
            { id: 'PASSES', label: `Passes (${metrics.validPassesIssued})`, icon: QrCode },
            { id: 'STAFF', label: `Staff (${staffList.length})`, icon: UserPlus },
            { id: 'SCANNER_ACTIVITY', label: `Activity (${scansList.length})`, icon: Activity },
            { id: 'REPORTS', label: 'Food Reports', icon: Utensils },
            { id: 'PRICING', label: 'Pricing', icon: IndianRupee },
            { id: 'SETTINGS', label: 'Settings', icon: Settings },
            { id: 'AUDIT', label: 'Audit', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isCurrent
                    ? 'bg-[#6D28D9] text-white shadow-xs'
                    : 'bg-[#FFF0D9] text-[#29243A] hover:bg-[#FFE6C2]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ----------------- DESKTOP SIDEBAR (lg:flex) ----------------- */}
      <aside className="hidden lg:flex w-64 bg-white border border-[#E8E2D9] rounded-3xl p-5 shadow-xs flex-col justify-between shrink-0">
        <div className="space-y-6">
          {/* Admin Header Badge */}
          <div className="flex items-center gap-3 pb-5 border-b border-[#E8E2D9]">
            <div className="w-11 h-11 rounded-2xl bg-white border border-[#E8E2D9] p-1 shadow-xs flex items-center justify-center shrink-0">
              <img
                src={collegeLogo}
                alt="College Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#E99A20] block">
                {event.college_name || 'College Admin'}
              </span>
              <h2 className="text-sm font-bold text-[#29243A] line-clamp-1">
                {adminUser.display_name}
              </h2>
            </div>
          </div>

          {/* Navigation Items (All 10 required sections) */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'OVERVIEW'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>Overview</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('REGISTRATIONS')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'REGISTRATIONS'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Registrations</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A]">
                {registrations.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('PAYMENTS')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                activeTab === 'PAYMENTS'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                <span>Payment Verification</span>
              </div>
              {pendingPayments.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-[#B45309] font-bold border border-amber-200">
                  {pendingPayments.length}
                </span>
              )}
            </button>

            {/* DEDICATED REGISTRATION PRICING SECTION */}
            <button
              onClick={() => setActiveTab('PRICING')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'PRICING'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <IndianRupee className="w-4 h-4 text-[#E99A20]" />
                <span>Registration Pricing</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFF0D9] text-[#6D28D9] font-bold">
                ₹{event.registration_fee_minor_units / 100}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'SETTINGS'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" />
                <span>Event Settings</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('PASSES')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'PASSES'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4" />
                <span>QR Passes</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A]">
                {metrics.validPassesIssued}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('STAFF')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'STAFF'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-4 h-4" />
                <span>Staff Management</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A]">
                {staffList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SCANNER_ACTIVITY')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'SCANNER_ACTIVITY'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-[#15803D]" />
                <span>Entry Scanner Activity</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A]">
                {scansList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('REPORTS')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'REPORTS'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Reports</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'AUDIT'
                  ? 'bg-[#FFF0D9] text-[#6D28D9] border-r-4 border-[#6D28D9]'
                  : 'text-[#6B655D] hover:bg-[#FFFCF5] hover:text-[#29243A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                <span>Audit Logs</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#E8E2D9] text-[#29243A]">
                {auditLogs.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Refresh & Logout Bottom Actions */}
        <div className="pt-4 border-t border-[#E8E2D9] space-y-2">
          <button
            type="button"
            onClick={syncAndRefresh}
            disabled={isRefreshing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] text-xs font-semibold border border-[#E8E2D9] transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#E99A20] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing with Supabase...' : 'Sync with Supabase'}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-[#6B655D] hover:text-[#B91C1C] text-xs font-semibold border border-[#E8E2D9] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ----------------- IVORY WORKSPACE ----------------- */}
      <section className="flex-1 bg-[#FFFCF5] space-y-6">
        {/* Real-time Sync Status Notification */}
        {syncFeedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs transition-all">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{syncFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs ml-2 cursor-pointer font-bold"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* 1. OVERVIEW TAB */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* PROMINENT REGISTRATION PRICING CARD (Requirement 6) */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-white via-[#FFFBF5] to-[#FFF0D9] border border-[#E8E2D9] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#FFF0D9] text-[#6D28D9] border border-[#E99A20]/40 text-xs font-bold mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#E99A20]" />
                  <span>Authoritative Live Pricing</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#29243A]">
                  Current Registration Fee: {formatINR(event.registration_fee_minor_units, event.currency)}
                </h2>
                <p className="text-xs text-[#6B655D] max-w-xl">
                  {event.registration_enabled ? (
                    <span className="text-[#15803D] font-bold">Registrations currently active</span>
                  ) : (
                    <span className="text-[#B91C1C] font-bold">Registrations paused</span>
                  )}{' '}
                  • Capacity: <span className="font-bold text-[#29243A]">{metrics.paidRegistrations} / {event.maximum_capacity || event.max_capacity} paid seats filled</span>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('PRICING');
                    setIsEditingPricing(true);
                  }}
                  className="px-6 py-3 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs sm:text-sm shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <IndianRupee className="w-4 h-4 text-[#E99A20]" />
                  <span>Edit Registration Price</span>
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[#6B655D]">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Registered</span>
                  <Users className="w-4 h-4 text-[#6D28D9]" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-[#29243A]">
                  {metrics.totalRegistrations}
                </p>
                <span className="text-[11px] text-[#6B655D] block">Students signed up</span>
              </div>

              <div className="p-5 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[#6B655D]">
                  <span className="text-xs font-bold uppercase tracking-wider">Verified Paid</span>
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-[#15803D]">
                  {metrics.paidRegistrations}
                </p>
                <span className="text-[11px] text-[#6B655D] block">Active passes issued</span>
              </div>

              <div className="p-5 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[#6B655D]">
                  <span className="text-xs font-bold uppercase tracking-wider">Pending UPI</span>
                  <Clock className="w-4 h-4 text-[#B45309]" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-[#B45309]">
                  {metrics.pendingVerifications}
                </p>
                <span className="text-[11px] text-[#6B655D] block">Awaiting bank check</span>
              </div>

              <div className="p-5 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[#6B655D]">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Revenue</span>
                  <IndianRupee className="w-4 h-4 text-[#E99A20]" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-[#6D28D9]">
                  {formatINR(metrics.totalRevenueMinorUnits, event.currency)}
                </p>
                <span className="text-[11px] text-[#6B655D] block">Collected & verified</span>
              </div>
            </div>

            {/* Food & Academic Year Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Food Preference Card */}
              <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#29243A]">
                    <Utensils className="w-5 h-5 text-[#E99A20]" />
                    <h3 className="text-base font-bold">Catering & Food Breakdown</h3>
                  </div>
                  <span className="text-xs font-bold text-[#6D28D9]">
                    {metrics.paidRegistrations} Meals Total
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#29243A] mb-1">
                      <span>Regular Dinner</span>
                      <span>{metrics.regularFoodCount} plates ({metrics.paidRegistrations ? Math.round((metrics.regularFoodCount / metrics.paidRegistrations) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-[#FFF0D9] overflow-hidden">
                      <div
                        className="h-full bg-[#6D28D9] rounded-full transition-all"
                        style={{
                          width: `${metrics.paidRegistrations ? (metrics.regularFoodCount / metrics.paidRegistrations) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#29243A] mb-1">
                      <span>Jain Dinner</span>
                      <span>{metrics.jainFoodCount} plates ({metrics.paidRegistrations ? Math.round((metrics.jainFoodCount / metrics.paidRegistrations) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-[#FFF0D9] overflow-hidden">
                      <div
                        className="h-full bg-[#E99A20] rounded-full transition-all"
                        style={{
                          width: `${metrics.paidRegistrations ? (metrics.jainFoodCount / metrics.paidRegistrations) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Gate Entry & Check-In Status */}
              <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#29243A]">
                    <QrCode className="w-5 h-5 text-[#6D28D9]" />
                    <h3 className="text-base font-bold">Gate Admission Status</h3>
                  </div>
                  <span className="text-xs font-bold text-[#15803D]">
                    {metrics.totalEntries} Admitted
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-center">
                    <span className="text-xs text-[#6B655D] font-medium block">Checked-In At Gates</span>
                    <span className="text-2xl font-black text-[#15803D]">{metrics.totalEntries}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-center">
                    <span className="text-xs text-[#6B655D] font-medium block">Yet To Check In</span>
                    <span className="text-2xl font-black text-[#B45309]">{metrics.notCheckedIn}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 2. REGISTRATIONS TAB ----------------- */}
        {activeTab === 'REGISTRATIONS' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#29243A]">Student Registrations</h2>
                  <p className="text-xs text-[#6B655D]">
                    Search, filter, and inspect student registrations, payment snapshots, and pass status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportRegistrationsCsv}
                  className="px-4 py-2.5 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#29243A] text-xs font-bold border border-[#E8E2D9] flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 text-[#6D28D9]" />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative sm:col-span-1">
                  <Search className="w-4 h-4 text-[#6B655D] absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search name, roll, phone..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <select
                  value={yearFilter}
                  onChange={(e) => {
                    setYearFilter(e.target.value as 'ALL' | AcademicYear);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer"
                >
                  <option value="ALL">All Academic Years</option>
                  <option value="FY">First Year (FY)</option>
                  <option value="SY">Second Year (SY)</option>
                </select>

                <select
                  value={foodFilter}
                  onChange={(e) => {
                    setFoodFilter(e.target.value as 'ALL' | FoodPreference);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer"
                >
                  <option value="ALL">All Meals (Regular & Jain)</option>
                  <option value="Regular">Regular Dinner</option>
                  <option value="Jain">Jain Dinner</option>
                </select>

                <select
                  value={paymentFilter}
                  onChange={(e) => {
                    setPaymentFilter(e.target.value as 'ALL' | PaymentStatus);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer"
                >
                  <option value="ALL">All Payment Statuses</option>
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Student Name</th>
                      <th className="p-3.5">Roll No</th>
                      <th className="p-3.5">Year</th>
                      <th className="p-3.5">Food</th>
                      <th className="p-3.5">Fee Snapshot</th>
                      <th className="p-3.5">Payment</th>
                      <th className="p-3.5">Entry Pass</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {paginatedRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-[#6B655D]">
                          No registrations match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedRegistrations.map((reg) => (
                        <tr key={reg.id} className="hover:bg-[#FFF0D9]/30 transition-colors">
                          <td className="p-3.5 font-bold text-[#29243A]">{reg.full_name}</td>
                          <td className="p-3.5 font-mono font-bold text-[#6D28D9]">{reg.normalized_roll_number}</td>
                          <td className="p-3.5">{reg.academic_year}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded-full bg-[#FFF0D9] text-[#29243A] font-bold text-[10px]">
                              {reg.food_preference}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-[#29243A]">
                            {formatINR(reg.expected_amount_minor_units, reg.currency)}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                reg.payment_status === 'PAID'
                                  ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                                  : reg.payment_status === 'PENDING'
                                  ? 'bg-amber-50 text-[#B45309] border border-amber-200'
                                  : 'bg-rose-50 text-[#B91C1C] border border-rose-200'
                              }`}
                            >
                              {reg.payment_status}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {reg.pass ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  reg.pass.status === 'VALID'
                                    ? 'bg-emerald-50 text-[#15803D]'
                                    : reg.pass.status === 'USED'
                                    ? 'bg-amber-50 text-[#B45309]'
                                    : 'bg-rose-50 text-[#B91C1C]'
                                }`}
                              >
                                {reg.pass.status}
                              </span>
                            ) : (
                              <span className="text-[#6B655D] text-[10px]">No Pass</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => setSelectedReg(reg)}
                              className="px-2.5 py-1 rounded-lg bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] text-[11px] font-bold cursor-pointer"
                            >
                              Details
                            </button>
                            {reg.pass && (
                              <button
                                type="button"
                                onClick={() => handleRevokePass(reg.pass!.id)}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-[10px] font-bold cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between text-xs text-[#6B655D] pt-2">
                <span>
                  Showing {filteredRegistrations.length ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
                  {Math.min(currentPage * pageSize, filteredRegistrations.length)} of {filteredRegistrations.length} registrations
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-[#E8E2D9] bg-white text-[#29243A] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-[#29243A]">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-[#E8E2D9] bg-white text-[#29243A] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 3. PAYMENT VERIFICATION TAB ----------------- */}
        {activeTab === 'PAYMENTS' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#29243A]">Manual Payment Verification Queue</h2>
                <p className="text-xs text-[#6B655D]">
                  Verify submitted 12-digit UPI reference numbers against college bank records. Verification immediately generates the student QR pass.
                </p>
              </div>

              {pendingPayments.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-[#15803D] mx-auto" />
                  <h3 className="text-sm font-bold text-[#29243A]">All Payments Verified</h3>
                  <p className="text-xs text-[#6B655D]">There are currently no pending UPI payment claims awaiting review.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                  <table className="w-full text-left text-xs text-[#29243A]">
                    <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                      <tr>
                        <th className="p-3.5">Student</th>
                        <th className="p-3.5">Roll No</th>
                        <th className="p-3.5">Amount Snapshot</th>
                        <th className="p-3.5">UPI Reference (UTR)</th>
                        <th className="p-3.5">Payment Screenshot</th>
                        <th className="p-3.5">Claimed At</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E2D9] bg-white">
                      {pendingPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-[#FFF0D9]/30 transition-colors">
                          <td className="p-3.5 font-bold text-[#29243A]">
                            {pay.registration?.full_name || 'Student'}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-[#6D28D9]">
                            {pay.registration?.normalized_roll_number}
                          </td>
                          <td className="p-3.5 font-black text-[#29243A]">
                            {formatINR(pay.expected_amount_minor_units, pay.currency)}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-[#E99A20]">
                            {pay.transaction_reference}
                          </td>
                          <td className="p-3.5">
                            {pay.screenshot_url ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingScreenshot({
                                      url: pay.screenshot_url!,
                                      studentName: pay.registration?.full_name || 'Student',
                                      rollNo: pay.registration?.normalized_roll_number || '',
                                      utr: pay.transaction_reference || '',
                                      amount: pay.expected_amount_minor_units,
                                      currency: pay.currency,
                                      paymentRecord: pay,
                                    })
                                  }
                                  className="relative group cursor-pointer block"
                                  title="Click to view full screenshot"
                                >
                                  <img
                                    src={pay.screenshot_url}
                                    alt="Payment Screenshot"
                                    className="w-12 h-12 object-cover rounded-xl border border-[#E8E2D9] shadow-xs group-hover:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Eye className="w-4 h-4 text-white" />
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingScreenshot({
                                      url: pay.screenshot_url!,
                                      studentName: pay.registration?.full_name || 'Student',
                                      rollNo: pay.registration?.normalized_roll_number || '',
                                      utr: pay.transaction_reference || '',
                                      amount: pay.expected_amount_minor_units,
                                      currency: pay.currency,
                                      paymentRecord: pay,
                                    })
                                  }
                                  className="px-2 py-1 rounded-lg bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] font-bold text-[10px] border border-[#E8E2D9] cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </div>
                            ) : (
                              <span className="text-[#6B655D] italic text-[11px]">No image</span>
                            )}
                          </td>
                          <td className="p-3.5 text-[#6B655D]">
                            {formatKolkataDateTime(pay.created_at)}
                          </td>
                          <td className="p-3.5 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => setVerifyModalPayment(pay)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                            >
                              Verify & Issue Pass
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectModalPayment(pay)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 font-bold text-xs cursor-pointer shadow-xs"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- 4. REGISTRATION PRICING (DEDICATED SECTION) ----------------- */}
        {activeTab === 'PRICING' && (
          <div className="space-y-6">
            {/* Header and Status Messages */}
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-[#E8E2D9] gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest font-bold text-[#E99A20]">
                      Admin Controlled
                    </span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 font-bold">
                      Strict Server Validation
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-[#29243A] mt-1">Registration Pricing & Schedule</h2>
                  <p className="text-xs text-[#6B655D]">
                    Configure authoritative registration fees, schedule window, and seat capacity. Price updates affect future registrations while preserving existing registration snapshots.
                  </p>
                </div>

                {!isEditingPricing && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPricing(true)}
                    className="px-6 py-3 rounded-2xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-sm shadow-xs flex items-center gap-2 cursor-pointer"
                  >
                    <IndianRupee className="w-4 h-4 text-[#E99A20]" />
                    <span>Edit Price & Schedule</span>
                  </button>
                )}
              </div>

              {/* Success / Error Banners */}
              {pricingSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-[#15803D] text-xs sm:text-sm flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Price Update Confirmed</p>
                    <p className="text-emerald-800">{pricingSuccessMsg}</p>
                  </div>
                </div>
              )}

              {pricingErrorMsg && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-[#B91C1C] text-xs sm:text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Validation Error</p>
                    <p className="text-rose-800">{pricingErrorMsg}</p>
                  </div>
                </div>
              )}

              {/* View / Edit Mode */}
              {!isEditingPricing ? (
                /* READ-ONLY VIEW */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="p-5 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40 shadow-xs space-y-1">
                    <span className="text-xs font-bold text-[#6D28D9]">Current Registration Fee (INR)</span>
                    <p className="text-3xl font-black text-[#29243A]">
                      {formatINR(event.registration_fee_minor_units, event.currency)}
                    </p>
                    <span className="text-[11px] text-[#6B655D] block">
                      Stored as {event.registration_fee_minor_units} minor units (paise)
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs space-y-1">
                    <span className="text-xs font-bold text-[#6B655D]">Registration Status</span>
                    <div className="pt-1">
                      {event.registration_enabled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 text-xs font-bold">
                          <Check className="w-3.5 h-3.5" /> Active & Accepting
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-[#B91C1C] border border-rose-200 text-xs font-bold">
                          <XCircle className="w-3.5 h-3.5" /> Registration Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#6B655D] block pt-1">
                      Max Capacity: {event.maximum_capacity || event.max_capacity} students
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs space-y-1">
                    <span className="text-xs font-bold text-[#6B655D]">Registration Window</span>
                    <p className="text-xs font-bold text-[#29243A] pt-1">
                      Opens: {formatKolkataDateTime(event.registration_opens_at)}
                    </p>
                    <p className="text-xs font-bold text-[#29243A]">
                      Closes: {formatKolkataDateTime(event.registration_closes_at)}
                    </p>
                  </div>
                </div>
              ) : (
                /* EDIT FORM (Requirement 3: All required fields) */
                <form onSubmit={handlePreviewPriceChange} className="space-y-6 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Field 1: Registration Fee (INR) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#29243A] block">
                        Registration Fee (INR) <span className="text-[#E99A20]">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-[#6B655D] font-bold text-sm">₹</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="100000"
                          value={pricingFeeRupees}
                          onChange={(e) => setPricingFeeRupees(e.target.value)}
                          placeholder="e.g. 250"
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] font-bold text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                          required
                        />
                      </div>
                      <span className="text-[11px] text-[#6B655D] block">
                        Will be safely stored on server as integer minor units ({Math.round(parseFloat(pricingFeeRupees || '0') * 100)} paise).
                      </span>
                    </div>

                    {/* Field 2: Maximum Registration Capacity */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#29243A] block">
                        Maximum Registration Capacity <span className="text-[#E99A20]">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={pricingCapacity}
                        onChange={(e) => setPricingCapacity(e.target.value)}
                        placeholder="e.g. 1200"
                        className="w-full px-4 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] font-bold text-sm focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                        required
                      />
                      <span className="text-[11px] text-[#6B655D] block">
                        Maximum number of paid attendees admitted.
                      </span>
                    </div>

                    {/* Field 3: Registration Opening Date and Time */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#29243A] block">
                        Registration Opening Date & Time <span className="text-[#E99A20]">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={pricingOpensAt}
                        onChange={(e) => setPricingOpensAt(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] font-medium text-xs focus:outline-none focus:border-[#6D28D9]"
                        required
                      />
                    </div>

                    {/* Field 4: Registration Closing Date and Time */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#29243A] block">
                        Registration Closing Date & Time <span className="text-[#E99A20]">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={pricingClosesAt}
                        onChange={(e) => setPricingClosesAt(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] font-medium text-xs focus:outline-none focus:border-[#6D28D9]"
                        required
                      />
                    </div>
                  </div>

                  {/* Field 5: Registration Enabled Switch */}
                  <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#29243A] block">Registration Enabled</span>
                      <span className="text-[11px] text-[#6B655D] block">
                        Toggle whether new students can register on the landing page
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pricingEnabled}
                        onChange={(e) => setPricingEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#E8E2D9] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#E8E2D9] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D28D9]" />
                    </label>
                  </div>

                  {/* Field 6: Optional Pricing Change Reason */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#29243A] block">
                      Optional Pricing Change Reason
                    </label>
                    <textarea
                      rows={2}
                      value={pricingReason}
                      onChange={(e) => setPricingReason(e.target.value)}
                      placeholder="e.g. Early-bird tier concluded; adjusted catering allocation fee approved by committee"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#29243A] text-xs focus:outline-none focus:border-[#6D28D9] font-medium"
                    />
                    <span className="text-[11px] text-[#6B655D] block">
                      This will be permanently recorded in the append-only pricing audit history.
                    </span>
                  </div>

                  {/* Actions: Preview & Save, Cancel */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelPricingChanges}
                      className="px-5 py-2.5 rounded-xl bg-white hover:bg-[#FFF0D9] text-[#29243A] font-bold text-xs border border-[#E8E2D9] transition-colors cursor-pointer"
                    >
                      Cancel Unsaved Changes
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Preview & Save New Fee</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* APPEND-ONLY PRICING AUDIT HISTORY TABLE (Requirement 4) */}
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#29243A]">Pricing Change History</h3>
                  <p className="text-xs text-[#6B655D]">
                    Append-only audit trail tracking every registration price adjustment, authorizing administrator, timestamp, and justification.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#6D28D9]">
                  {pricingHistory.length} Recorded Changes
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Timestamp</th>
                      <th className="p-3.5">Previous Fee</th>
                      <th className="p-3.5">New Fee</th>
                      <th className="p-3.5">Change Reason</th>
                      <th className="p-3.5">Administrator</th>
                      <th className="p-3.5 font-mono text-[11px]">Event ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {pricingHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-[#6B655D]">
                          No pricing changes recorded yet.
                        </td>
                      </tr>
                    ) : (
                      pricingHistory.map((hist) => (
                        <tr key={hist.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                          <td className="p-3.5 font-medium text-[#29243A]">
                            {formatKolkataDateTime(hist.created_at)}
                          </td>
                          <td className="p-3.5 line-through text-[#6B655D] font-bold">
                            {formatINR(hist.previous_fee_minor_units, hist.currency)}
                          </td>
                          <td className="p-3.5 font-black text-[#15803D]">
                            {formatINR(hist.new_fee_minor_units, hist.currency)}
                          </td>
                          <td className="p-3.5 text-[#29243A] max-w-xs">
                            {hist.change_reason || 'Administrative pricing adjustment'}
                          </td>
                          <td className="p-3.5 font-bold text-[#6D28D9]">
                            {hist.changed_by_name || hist.changed_by}
                          </td>
                          <td className="p-3.5 font-mono text-[10px] text-[#6B655D]">
                            {hist.event_id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 5. EVENT SETTINGS TAB ----------------- */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-6">
              {/* Quick jump banner to Registration Pricing */}
              <div className="p-4 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#6D28D9] block">
                    Looking to manage registration pricing or deadlines?
                  </span>
                  <span className="text-[11px] text-[#6B655D] block">
                    Dedicated Admin Dashboard &gt; Registration Pricing section controls dynamic fees and audit logs.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('PRICING')}
                  className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Open Registration Pricing
                </button>
              </div>

              <div>
                <h2 className="text-xl font-black text-[#29243A]">Event Configuration & Details</h2>
                <p className="text-xs text-[#6B655D]">
                  Configure event branding, venue instructions, and static UPI payment account details.
                </p>
              </div>

              {settingsSavedMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#15803D] text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Event settings saved successfully!</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">College Name</label>
                    <input
                      type="text"
                      value={settingsForm.college_name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, college_name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">Event Title</label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">Venue</label>
                    <input
                      type="text"
                      value={settingsForm.venue}
                      onChange={(e) => setSettingsForm({ ...settingsForm, venue: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">College UPI ID (for Static UPI)</label>
                    <input
                      type="text"
                      value={settingsForm.payment_upi_id}
                      onChange={(e) => setSettingsForm({ ...settingsForm, payment_upi_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-mono font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">UPI Recipient Name</label>
                    <input
                      type="text"
                      value={settingsForm.payment_upi_name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, payment_upi_name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#29243A] block">Contact Email</label>
                    <input
                      type="email"
                      value={settingsForm.contact_email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, contact_email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-medium text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Save Event Settings
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ----------------- 6. QR PASSES TAB ----------------- */}
        {activeTab === 'PASSES' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#29243A]">Issued QR Passes</h2>
                <p className="text-xs text-[#6B655D]">
                  Cryptographically hashed pass tokens, redemption state, and reissue/revoke controls.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Student</th>
                      <th className="p-3.5">Roll No</th>
                      <th className="p-3.5">Pass Token Hash (SHA-256)</th>
                      <th className="p-3.5">Pass Status</th>
                      <th className="p-3.5">Issued At</th>
                      <th className="p-3.5">Check-In Info</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {registrations
                      .filter((r) => !!r.pass)
                      .map((r) => (
                        <tr key={r.pass!.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                          <td className="p-3.5 font-bold text-[#29243A]">{r.full_name}</td>
                          <td className="p-3.5 font-mono font-bold text-[#6D28D9]">{r.normalized_roll_number}</td>
                          <td className="p-3.5 font-mono text-[10px] text-[#6B655D] truncate max-w-[150px]">
                            {r.pass!.token_hash}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.pass!.status === 'VALID'
                                  ? 'bg-emerald-50 text-[#15803D]'
                                  : r.pass!.status === 'USED'
                                  ? 'bg-amber-50 text-[#B45309]'
                                  : 'bg-rose-50 text-[#B91C1C]'
                              }`}
                            >
                              {r.pass!.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-[#6B655D]">{formatKolkataDateTime(r.pass!.issued_at)}</td>
                          <td className="p-3.5 text-[#6B655D]">
                            {r.pass!.redeemed_at ? (
                              <span className="text-[#15803D] font-medium">
                                Redeemed ({formatKolkataDateTime(r.pass!.redeemed_at)})
                              </span>
                            ) : (
                              'Not scanned yet'
                            )}
                          </td>
                          <td className="p-3.5 text-right space-x-1">
                            {r.pass!.status === 'VALID' && (
                              <button
                                type="button"
                                onClick={() => handleRevokePass(r.pass!.id)}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B91C1C] text-[10px] font-bold cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleReissuePass(r.pass!.id)}
                              className="px-2 py-1 rounded-lg bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] text-[10px] font-bold cursor-pointer"
                            >
                              Reissue
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 7. STAFF MANAGEMENT TAB ----------------- */}
        {activeTab === 'STAFF' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between pb-4 border-b border-[#E8E2D9] gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#29243A]">Staff & Gate Volunteer Accounts</h2>
                  <p className="text-xs text-[#6B655D]">
                    Manage gate volunteer accounts authorized to operate the live camera scanner at entrance gates.
                  </p>
                </div>
              </div>

              {/* Add Staff Form */}
              <form onSubmit={handleCreateStaff} className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] space-y-3">
                <span className="text-xs font-bold text-[#29243A] block">Add New Gate Staff Member</span>
                {staffFormError && (
                  <p className="text-xs text-[#B91C1C] font-semibold">{staffFormError}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Staff Full Name (e.g. Gate 3 Volunteer)"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#E8E2D9] text-xs text-[#29243A] font-medium focus:outline-none focus:border-[#6D28D9]"
                  />
                  <input
                    type="email"
                    placeholder="Email Address (e.g. gate3@college.edu)"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#E8E2D9] text-xs text-[#29243A] font-medium focus:outline-none focus:border-[#6D28D9]"
                  />
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Create Staff Account
                  </button>
                </div>
              </form>

              {/* Staff Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Display Name</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Toggle Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {staffList.map((staff) => (
                      <tr key={staff.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                        <td className="p-3.5 font-bold text-[#29243A]">{staff.display_name}</td>
                        <td className="p-3.5 text-[#6B655D]">{staff.email}</td>
                        <td className="p-3.5 font-mono text-[10px] font-bold text-[#6D28D9]">{staff.role}</td>
                        <td className="p-3.5">
                          {staff.is_active ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#15803D] font-bold text-[10px]">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-[#B91C1C] font-bold text-[10px]">
                              INACTIVE
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleStaffStatus(staff.id, staff.is_active)}
                            className={`px-3 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                              staff.is_active
                                ? 'bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-200'
                            }`}
                          >
                            {staff.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 8. ENTRY SCANNER ACTIVITY TAB ----------------- */}
        {activeTab === 'SCANNER_ACTIVITY' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#29243A]">Live Gate Entry Scanner Activity</h2>
                <p className="text-xs text-[#6B655D]">
                  Authoritative chronological stream of all gate scans, admissions, and denied duplicate attempts.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Timestamp</th>
                      <th className="p-3.5">Gate Staff</th>
                      <th className="p-3.5">Student</th>
                      <th className="p-3.5">Roll No</th>
                      <th className="p-3.5">Scan Outcome</th>
                      <th className="p-3.5">Request Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {scansList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[#6B655D]">
                          No scan events logged yet. Gate scanners will record scans here in real time.
                        </td>
                      </tr>
                    ) : (
                      scansList.map((scan) => (
                        <tr key={scan.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                          <td className="p-3.5 text-[#6B655D]">{formatKolkataDateTime(scan.scanned_at)}</td>
                          <td className="p-3.5 font-bold text-[#29243A]">{scan.staff_name || scan.staff_user_id}</td>
                          <td className="p-3.5 font-bold text-[#29243A]">{scan.student_name || '—'}</td>
                          <td className="p-3.5 font-mono font-bold text-[#6D28D9]">{scan.roll_number || '—'}</td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                scan.scan_result === 'ENTRY_APPROVED'
                                  ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                                  : 'bg-rose-50 text-[#B91C1C] border border-rose-200'
                              }`}
                            >
                              {scan.scan_result}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-[10px] text-[#6B655D]">{scan.request_id || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 9. REPORTS TAB ----------------- */}
        {activeTab === 'REPORTS' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#29243A]">Executive Event Reports</h2>
                  <p className="text-xs text-[#6B655D]">
                    Summary statistics, dietary tallies for caterers, academic year breakdown, and revenue reconciliation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportRegistrationsCsv}
                  className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Master Report</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9]">
                  <span className="text-xs text-[#6B655D] font-bold block">FY Students (Undergraduate)</span>
                  <span className="text-2xl font-black text-[#29243A]">{metrics.fyCount}</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9]">
                  <span className="text-xs text-[#6B655D] font-bold block">SY Students (Undergraduate)</span>
                  <span className="text-2xl font-black text-[#29243A]">{metrics.syCount}</span>
                </div>
                <div className="p-4 rounded-2xl bg-[#FFF0D9] border border-[#E99A20]/40">
                  <span className="text-xs text-[#6D28D9] font-bold block">Total Verified Revenue</span>
                  <span className="text-2xl font-black text-[#6D28D9]">
                    {formatINR(metrics.totalRevenueMinorUnits, event.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- 10. AUDIT LOGS TAB ----------------- */}
        {activeTab === 'AUDIT' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#29243A]">Administrative Audit Trail</h2>
                <p className="text-xs text-[#6B655D]">
                  Append-only immutable record of administrative actions, pricing modifications, payment verifications, and pass reissues.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9]">
                <table className="w-full text-left text-xs text-[#29243A]">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th className="p-3.5">Timestamp</th>
                      <th className="p-3.5">Actor</th>
                      <th className="p-3.5">Action</th>
                      <th className="p-3.5">Target</th>
                      <th className="p-3.5">Reason / Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D9] bg-white">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                        <td className="p-3.5 text-[#6B655D] whitespace-nowrap">
                          {formatKolkataDateTime(log.created_at)}
                        </td>
                        <td className="p-3.5 font-bold text-[#6D28D9]">{log.actor_name || 'System Admin'}</td>
                        <td className="p-3.5 font-mono text-[10px] font-bold text-[#29243A]">{log.action}</td>
                        <td className="p-3.5 text-[#6B655D]">
                          {log.target_type} ({log.target_id || 'general'})
                        </td>
                        <td className="p-3.5 text-[#29243A] max-w-sm">{log.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ----------------- CONFIRM PRICING CHANGE MODAL ----------------- */}
      {showPriceConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] border border-[#E99A20]/40 flex items-center justify-center mx-auto">
                <IndianRupee className="w-6 h-6 text-[#E99A20]" />
              </div>
              <h3 className="text-xl font-black text-[#29243A]">Confirm Registration Price Change</h3>
              <p className="text-xs text-[#6B655D]">
                Are you sure you want to update the authoritative registration fee? This will apply to all registrations created after this change.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Current Fee:</span>
                <span className="line-through font-bold text-[#6B655D]">
                  {formatINR(event.registration_fee_minor_units, event.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6D28D9] font-bold">New Proposed Fee:</span>
                <span className="text-base font-black text-[#15803D]">
                  ₹{pricingFeeRupees}.00
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Capacity:</span>
                <span className="font-bold text-[#29243A]">{pricingCapacity} seats</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Registration Active:</span>
                <span className="font-bold text-[#29243A]">{pricingEnabled ? 'YES' : 'NO'}</span>
              </div>
              <div className="pt-1">
                <span className="text-[#6B655D] block font-semibold">Change Reason:</span>
                <span className="text-[#29243A] font-medium block mt-0.5">
                  {pricingReason.trim() || 'Administrative pricing adjustment'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={pricingSaving}
                onClick={() => setShowPriceConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-white hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pricingSaving}
                onClick={handleConfirmSavePricing}
                className="flex-1 py-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
              >
                {pricingSaving ? 'Persisting...' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PAYMENT VERIFY CONFIRMATION MODAL ----------------- */}
      {verifyModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[#29243A]">Confirm Payment Verification</h3>
            <p className="text-xs text-[#6B655D]">
              Confirm that payment of <span className="font-bold text-[#15803D]">{formatINR(verifyModalPayment.expected_amount_minor_units, verifyModalPayment.currency)}</span> with UTR <span className="font-mono font-bold text-[#29243A]">{verifyModalPayment.transaction_reference}</span> has been reconciled with college bank accounts.
            </p>

            {verifyModalPayment.screenshot_url && (
              <div className="p-3 rounded-2xl bg-[#FFF0D9]/50 border border-[#E99A20]/40 flex items-center gap-3">
                <img
                  src={verifyModalPayment.screenshot_url}
                  alt="Payment Receipt"
                  className="w-16 h-16 object-cover rounded-xl border border-[#E8E2D9] shadow-xs"
                />
                <div className="text-xs">
                  <span className="font-bold text-[#29243A] block">Payment Screenshot Attached</span>
                  <p className="text-[10px] text-[#6B655D] mt-0.5">Uploaded by student for verification</p>
                  <a
                    href={verifyModalPayment.screenshot_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#6D28D9] font-bold hover:underline inline-flex items-center gap-1 mt-1 text-[11px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Full Size Image</span>
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#29243A] block">Admin Verification Note</label>
              <input
                type="text"
                placeholder="e.g. Verified in HDFC bank statement ref #..."
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVerifyModalPayment(null)}
                className="flex-1 py-2 rounded-xl bg-white text-[#29243A] border border-[#E8E2D9] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVerifyPayment}
                className="flex-1 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
              >
                Approve & Generate Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PAYMENT REJECT CONFIRMATION MODAL ----------------- */}
      {rejectModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[#B91C1C]">Reject Payment Claim</h3>
            <p className="text-xs text-[#6B655D]">
              Reject claim for transaction reference{' '}
              <span className="font-mono font-bold text-[#29243A]">{rejectModalPayment.transaction_reference}</span>.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#29243A] block">Rejection Reason</label>
              <input
                type="text"
                placeholder="e.g. UTR not matching any incoming credit on statement"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] focus:outline-none focus:border-[#B91C1C]"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalPayment(null)}
                className="flex-1 py-2 rounded-xl bg-white text-[#29243A] border border-[#E8E2D9] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectPayment}
                className="flex-1 py-2 rounded-xl bg-[#B91C1C] hover:bg-rose-800 text-white text-xs font-bold shadow-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- FULL SCREENSHOT INSPECTION MODAL ----------------- */}
      {viewingScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
              <div>
                <h3 className="text-base font-bold text-[#29243A]">
                  Payment Screenshot Verification
                </h3>
                <p className="text-xs text-[#6B655D]">
                  Student: <span className="font-bold text-[#29243A]">{viewingScreenshot.studentName}</span> | Roll:{' '}
                  <span className="font-mono text-[#6D28D9] font-bold">{viewingScreenshot.rollNo}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingScreenshot(null)}
                className="p-1.5 rounded-xl hover:bg-[#FFF0D9] text-[#6B655D] hover:text-[#29243A] transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata banner */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs">
              <div>
                <span className="text-[#6B655D] block">Expected Fee:</span>
                <span className="font-black text-[#6D28D9] text-sm">
                  {formatINR(viewingScreenshot.amount, viewingScreenshot.currency)}
                </span>
              </div>
              <div>
                <span className="text-[#6B655D] block">Claimed UTR / Tx ID:</span>
                <span className="font-mono font-bold text-[#E99A20] text-sm">
                  {viewingScreenshot.utr}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[#6B655D] block">Status:</span>
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-[#B45309] font-bold text-[10px]">
                  Pending Admin Approval
                </span>
              </div>
            </div>

            {/* High-res Image Preview */}
            <div className="flex-1 overflow-auto rounded-2xl border border-[#E8E2D9] bg-[#29243A]/5 flex items-center justify-center p-2 min-h-[250px]">
              <img
                src={viewingScreenshot.url}
                alt="Payment receipt uploaded by student"
                className="max-h-[50vh] object-contain rounded-xl shadow-sm"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <a
                href={viewingScreenshot.url}
                target="_blank"
                rel="noreferrer"
                download={`payment-${viewingScreenshot.rollNo}.png`}
                className="text-xs text-[#6D28D9] hover:underline flex items-center gap-1 font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Open Full Size Image</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pay = viewingScreenshot.paymentRecord;
                    setViewingScreenshot(null);
                    setRejectModalPayment(pay);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-xs font-bold cursor-pointer"
                >
                  Reject Claim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pay = viewingScreenshot.paymentRecord;
                    setViewingScreenshot(null);
                    setVerifyModalPayment(pay);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#15803D] hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify & Issue Pass</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- REGISTRATION DETAILS MODAL ----------------- */}
      {selectedReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
              <h3 className="text-base font-bold text-[#29243A]">Student Registration Record</h3>
              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="text-xs font-bold text-[#6B655D] hover:text-[#29243A]"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Full Name:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.full_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Roll Number:</span>
                <span className="font-mono font-bold text-[#6D28D9]">{selectedReg.normalized_roll_number}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Academic Year:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.academic_year}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Food Preference:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.food_preference}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Contact Number:</span>
                <span className="font-mono text-[#29243A]">{selectedReg.contact_number}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Immutable Fee Snapshot:</span>
                <span className="font-black text-[#6D28D9]">
                  {formatINR(selectedReg.expected_amount_minor_units, selectedReg.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Payment Status:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.payment_status}</span>
              </div>
              {selectedReg.payment?.screenshot_url && (
                <div className="py-2 border-b border-[#E8E2D9] flex items-center justify-between">
                  <span className="text-[#6B655D]">Payment Screenshot:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const pay = selectedReg.payment!;
                      setSelectedReg(null);
                      setViewingScreenshot({
                        url: pay.screenshot_url!,
                        studentName: selectedReg.full_name,
                        rollNo: selectedReg.normalized_roll_number,
                        utr: pay.transaction_reference || '',
                        amount: selectedReg.expected_amount_minor_units,
                        currency: selectedReg.currency,
                        paymentRecord: { ...pay, registration: selectedReg },
                      });
                    }}
                    className="text-[#6D28D9] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Screenshot</span>
                  </button>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-[#6B655D]">Pass Token Hash:</span>
                <span className="font-mono text-[10px] text-[#6B655D] truncate max-w-[180px]">
                  {selectedReg.pass?.token_hash || 'No pass generated yet'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedReg(null)}
              className="w-full py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
