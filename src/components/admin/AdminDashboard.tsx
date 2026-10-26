import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit3,
  FileText,
  RotateCcw,
  Copy,
  X,
  Trash2,
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
import { formatRollWithCoursePrefix } from '../../lib/validation';
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
  const [allPayments, setAllPayments] = useState<Array<PaymentRecord & { registration?: Registration }>>(
    dataService.getAllPaymentsWithRegistrations()
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'REJECTED'>('PENDING');
  const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
  const [staffList, setStaffList] = useState<UserProfile[]>(
    dataService.getProfiles().filter((p) => p.role === 'STAFF')
  );
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(dataService.getAuditLogs());
  const [pricingHistory, setPricingHistory] = useState<PricingHistoryRecord[]>(dataService.getPricingHistory());
  const [scansList, setScansList] = useState<EntryScanLog[]>(dataService.getScansList());

  // Filters & Sorting for registrations table
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<'ALL' | AcademicYear | 'FY' | 'SY'>('ALL');
  const [foodFilter, setFoodFilter] = useState<'ALL' | FoodPreference>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN'>('ALL');

  // Roll Number Sorting (Requirement: natural alphanumeric sort like IT1, IT2, IT10)
  const [sortField, setSortField] = useState<'roll' | 'name' | 'created_at'>('roll');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Edit Student Registration Modal State
  const [editingReg, setEditingReg] = useState<(Registration & { payment?: PaymentRecord; pass?: EntryPass }) | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    roll_number: '',
    academic_year: 'FY - M.Sc.IT' as AcademicYear,
    contact_number: '',
    food_preference: 'Regular' as FoodPreference,
    performance_talent: '',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
  const [viewingStudentPhoto, setViewingStudentPhoto] = useState<{
    url: string;
    name: string;
    roll: string;
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
    setAllPayments(dataService.getAllPaymentsWithRegistrations());
    setStaffList(dataService.getProfiles().filter((p) => p.role === 'STAFF'));
    setAuditLogs(dataService.getAuditLogs());
    setPricingHistory(dataService.getPricingHistory());
    setScansList(dataService.getScansList());
  };

  const syncAndRefresh = async () => {
    setIsRefreshing(true);
    try {
      await dataService.initSupabase();
      refreshAll();
    } catch {
      refreshAll();
    } finally {
      setIsRefreshing(false);
    }
  };

  const silentSyncAndRefresh = async () => {
    try {
      await dataService.initSupabase();
      refreshAll();
    } catch {
      refreshAll();
    }
  };

  const handleDeleteRegistration = async (regId: string, studentName: string) => {
    const confirmed = window.confirm(
      `Delete registration for ${studentName}? This will permanently remove their registration, payment, and QR pass from both the database and dashboard.`
    );
    if (!confirmed) return;
    try {
      await dataService.deleteRegistrationAdmin(regId, adminUser.id);
      refreshAll();
      alert(`Registration for ${studentName} deleted successfully.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete registration');
    }
  };

  const handleClearAllScans = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to clear all scanner activity logs? This will wipe the test scan records from the database and dashboard.'
    );
    if (!confirmed) return;
    try {
      await dataService.clearAllScansAdmin(adminUser.id);
      refreshAll();
      alert('All scanner activity logs cleared successfully.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to clear scanner activity logs');
    }
  };

  useEffect(() => {
    refreshAll();
    silentSyncAndRefresh();

    // 1-second silent polling interval to guarantee instant live updates without UI flickering
    const pollInterval = setInterval(() => {
      silentSyncAndRefresh();
    }, 1000);

    // Real-time Postgres changes subscription from Supabase
    const unsubscribe = dataService.subscribeToRealtimeChanges(() => {
      refreshAll();
    });

    return () => {
      clearInterval(pollInterval);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Proactively sync when switching to Payments or Registrations tabs
  useEffect(() => {
    if (activeTab === 'PAYMENTS' || activeTab === 'REGISTRATIONS') {
      silentSyncAndRefresh();
    }
  }, [activeTab]);

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
      (r.performance_talent && r.performance_talent.toLowerCase().includes(term)) ||
      r.id.toLowerCase().includes(term);

    const matchesYear =
      yearFilter === 'ALL' ||
      (r.academic_year as string) === yearFilter ||
      (yearFilter === 'FY' && (r.academic_year as string).startsWith('FY')) ||
      (yearFilter === 'SY' && (r.academic_year as string).startsWith('SY'));

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

  // Natural numeric sorting for Roll Numbers (e.g. IT1, IT2, IT10, IT101) & name/date
  const sortedRegistrations = [...filteredRegistrations].sort((a, b) => {
    if (sortField === 'roll') {
      const cmp = a.normalized_roll_number.localeCompare(b.normalized_roll_number, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    if (sortField === 'name') {
      const cmp = a.full_name.localeCompare(b.full_name);
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    if (sortField === 'created_at') {
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedRegistrations.length / pageSize) || 1;
  const paginatedRegistrations = sortedRegistrations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleToggleSort = (field: 'roll' | 'name' | 'created_at') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Re-activate scanned QR pass (Allow re-entry / reuse)
  const handleReactivatePass = async (passId: string, studentName?: string) => {
    const confirmed = window.confirm(
      `Allow ${studentName || 'this student'} to re-enter using their existing QR code? Their pass will be reset to VALID.`
    );
    if (!confirmed) return;
    try {
      await dataService.reactivateUsedPassAdmin(passId, adminUser.id, 'Pass re-activated by admin for student re-entry');
      refreshAll();
      alert('Entry pass re-activated successfully! The student can now scan their QR pass again at the gate.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate pass');
    }
  };

  // Reset Dinner Meal Scan (Allow student another meal if authorized)
  const handleResetDinnerScan = async (passId: string, studentName?: string) => {
    const confirmed = window.confirm(
      `Reset dinner meal status for ${studentName || 'this student'}? This will allow them to scan for dinner meal distribution once more.`
    );
    if (!confirmed) return;
    try {
      await dataService.reactivateDinnerScanAdmin(passId, adminUser.id, 'Dinner meal status reset by admin');
      refreshAll();
      alert('Dinner scan reset successfully! The student can now claim dinner again.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reset dinner scan');
    }
  };

  // Mark Gate Entry QR as Done (Admin Manual Override)
  const handleMarkGateDone = async (passId: string, studentName?: string) => {
    const confirmed = window.confirm(
      `Mark Gate Entry QR as DONE for ${studentName || 'this student'}?`
    );
    if (!confirmed) return;
    try {
      await dataService.markGateEntryDoneAdmin(passId, adminUser.id);
      refreshAll();
      alert('Gate Entry QR marked as DONE successfully!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark gate entry done');
    }
  };

  // Mark Dinner QR Scan as Done (Admin Manual Override)
  const handleMarkDinnerDone = async (passId: string, studentName?: string) => {
    const confirmed = window.confirm(
      `Mark Dinner QR Scan as DONE for ${studentName || 'this student'}?`
    );
    if (!confirmed) return;
    try {
      await dataService.markDinnerScanDoneAdmin(passId, adminUser.id);
      refreshAll();
      alert('Dinner QR Scan marked as DONE successfully!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark dinner scan done');
    }
  };

  // Edit Student Registration Modal Handlers
  const handleStartEditReg = (reg: Registration & { payment?: PaymentRecord; pass?: EntryPass }) => {
    setEditingReg(reg);
    setEditForm({
      full_name: reg.full_name,
      roll_number: reg.normalized_roll_number,
      academic_year: (reg.academic_year as AcademicYear) || 'FY - M.Sc.IT',
      contact_number: reg.contact_number,
      food_preference: reg.food_preference,
      performance_talent: reg.performance_talent || '',
    });
    setEditError(null);
  };

  const handleSaveEditReg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReg) return;
    if (!editForm.full_name.trim() || !editForm.roll_number.trim() || !editForm.contact_number.trim()) {
      setEditError('Please fill in Student Name, Roll Number, and Contact Number.');
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      await dataService.updateRegistrationAdmin(adminUser.id, editingReg.id, {
        full_name: editForm.full_name,
        roll_number: editForm.roll_number,
        academic_year: editForm.academic_year,
        contact_number: editForm.contact_number,
        food_preference: editForm.food_preference,
        performance_talent: editForm.performance_talent,
      });
      setEditingReg(null);
      refreshAll();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update student registration');
    } finally {
      setIsSavingEdit(false);
    }
  };

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

  // Clear all payments based on active status tab (Pending / Paid / Rejected / All)
  const [isClearingPayments, setIsClearingPayments] = useState(false);

  const handleClearAllPaymentsByStatus = async () => {
    const label =
      paymentStatusFilter === 'PENDING'
        ? 'all PENDING payments in queue'
        : paymentStatusFilter === 'PAID'
        ? 'all VERIFIED / PAID payments'
        : paymentStatusFilter === 'REJECTED'
        ? 'all REJECTED payments'
        : 'ALL payment records';

    const count =
      paymentStatusFilter === 'PENDING'
        ? pendingPaymentsCount
        : paymentStatusFilter === 'PAID'
        ? paidPaymentsCount
        : paymentStatusFilter === 'REJECTED'
        ? rejectedPaymentsCount
        : allPayments.length;

    if (count === 0) {
      alert(`There are currently no ${paymentStatusFilter === 'ALL' ? '' : paymentStatusFilter.toLowerCase()} payments to clear.`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to CLEAR ${label}? ${count} record${count > 1 ? 's' : ''} will be permanently deleted.`
    );
    if (!confirmed) return;

    setIsClearingPayments(true);
    try {
      const res = await dataService.clearPaymentsByStatusAdmin(paymentStatusFilter, adminUser.id);
      refreshAll();
      alert(`Successfully cleared ${res.clearedCount} payment record(s)!`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to clear payments');
    } finally {
      setIsClearingPayments(false);
    }
  };

  const handleDeleteSinglePayment = async (paymentId: string, utrOrRef: string) => {
    const confirmed = window.confirm(
      `Delete payment record (${utrOrRef})? This will remove this payment submission.`
    );
    if (!confirmed) return;
    try {
      await dataService.deletePaymentAdmin(paymentId, adminUser.id);
      refreshAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete payment');
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
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await dataService.updateEventSettings(settingsForm, adminUser.id);
      setSettingsForm({ ...updated });
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
  // Helper for formatting date-time in exported reports
  const formatReportDateTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  // 1. Genuine Excel Exporter (.xls format with styling, timestamps, and stage performance)
  const exportRegistrationsExcel = () => {
    const rowsHtml = sortedRegistrations.map((r, idx) => {
      const regTime = formatReportDateTime(r.created_at);
      const apprTime = r.payment?.verified_at
        ? formatReportDateTime(r.payment.verified_at)
        : (r.payment_status === 'PAID' ? 'Verified' : 'Pending');
      const gateTime = r.pass?.redeemed_at
        ? formatReportDateTime(r.pass.redeemed_at)
        : (r.pass?.status === 'USED' ? 'Scanned' : 'Not scanned');
      const dinnerTime = r.pass?.dinner_redeemed_at
        ? formatReportDateTime(r.pass.dinner_redeemed_at)
        : 'Not claimed';
      const utr = r.payment?.transaction_reference || '—';

      return `
        <tr>
          <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: bold; font-family: monospace; color: #6D28D9;">${r.normalized_roll_number}</td>
          <td style="font-weight: bold;">${r.full_name}</td>
          <td>${r.academic_year}</td>
          <td>${r.food_preference}</td>
          <td>${r.contact_number}</td>
          <td style="font-weight: bold; color: ${r.payment_status === 'PAID' ? '#15803D' : r.payment_status === 'PENDING' ? '#B45309' : '#B91C1C'};">${r.payment_status}</td>
          <td>₹${(r.expected_amount_minor_units / 100).toFixed(2)}</td>
          <td style="font-weight: bold; color: ${r.pass?.status === 'VALID' ? '#15803D' : r.pass?.status === 'USED' ? '#B45309' : '#6B655D'};">${r.pass?.status || 'NO_PASS'}</td>
          <td style="font-weight: 600; color: #6D28D9;">${r.performance_talent || 'None'}</td>
          <td>${regTime}</td>
          <td>${apprTime}</td>
          <td>${gateTime}</td>
          <td>${dinnerTime}</td>
          <td style="font-family: monospace;">${utr}</td>
        </tr>
      `;
    }).join('');

    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; }
          th { background-color: #6D28D9; color: #FFFFFF; font-weight: bold; border: 1px solid #CCCCCC; padding: 10px 8px; text-align: left; }
          td { border: 1px solid #E0E0E0; padding: 8px; vertical-align: middle; }
          tr:nth-child(even) { background-color: #FDF9F3; }
          .title-header { font-size: 16px; font-weight: bold; color: #6D28D9; padding: 10px 0 4px 0; }
          .meta-info { font-size: 11px; color: #555555; padding-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="title-header">${event.college_name || 'College Cultural Committee'} — Pre-Diwali Event Registrations & Entrance Report</div>
        <div class="meta-info">
          Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST) | 
          Total Filtered Records: ${sortedRegistrations.length} | 
          Paid: ${sortedRegistrations.filter((r) => r.payment_status === 'PAID').length} | 
          Admitted at Entrance: ${sortedRegistrations.filter((r) => r.pass?.status === 'USED').length} | 
          Dinner Claimed: ${sortedRegistrations.filter((r) => r.pass?.dinner_redeemed_at).length}
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Roll Number</th>
              <th>Student Full Name</th>
              <th>Academic Year / Course</th>
              <th>Food Preference</th>
              <th>Contact Number</th>
              <th>Payment Status</th>
              <th>Amount (INR)</th>
              <th>Pass Status</th>
              <th>Stage Talent / Performance</th>
              <th>Registration Timestamp</th>
              <th>Approval Timestamp</th>
              <th>Gate Scan Timestamp</th>
              <th>Dinner Scan Timestamp</th>
              <th>UPI Reference / UTR</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PreDiwali_Registrations_Excel_${Date.now()}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Formatted Multi-Page PDF Exporter (with Timestamps & Stage Performance)
  const exportRegistrationsPdf = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;

    // Header banner
    doc.setFillColor(109, 40, 217); // #6D28D9
    doc.rect(margin, 20, pageWidth - margin * 2, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(event.college_name || 'College Cultural Committee', margin + 14, 40);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Pre-Diwali Celebration — Student Registrations, Timestamps & Gate Entrance Audit Report', margin + 14, 55);

    // Sub-header details
    doc.setTextColor(41, 36, 58);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    doc.text(
      `Generated: ${nowStr} (IST) | Total: ${sortedRegistrations.length} | Paid: ${
        sortedRegistrations.filter((r) => r.payment_status === 'PAID').length
      } | Admitted: ${sortedRegistrations.filter((r) => r.pass?.status === 'USED').length}`,
      margin,
      80
    );

    // Table Column Definitions (Total ~785pt width)
    const cols = [
      { title: '#', width: 22 },
      { title: 'Roll No', width: 55 },
      { title: 'Student Name', width: 105 },
      { title: 'Course / Year', width: 75 },
      { title: 'Food', width: 40 },
      { title: 'Stage Talent', width: 70 },
      { title: 'Payment', width: 48 },
      { title: 'Pass Status', width: 48 },
      { title: 'Reg Time', width: 80 },
      { title: 'Appr Time', width: 80 },
      { title: 'Gate Scan', width: 82 },
      { title: 'Dinner Scan', width: 80 },
    ];

    let currentY = 96;
    const rowHeight = 20;

    const drawTableHeader = (y: number) => {
      doc.setFillColor(255, 240, 217); // #FFF0D9
      doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'F');
      doc.setDrawColor(232, 226, 217);
      doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(41, 36, 58);

      let x = margin;
      cols.forEach((col) => {
        doc.text(col.title, x + 3, y + 13);
        x += col.width;
      });
    };

    drawTableHeader(currentY);
    currentY += rowHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);

    sortedRegistrations.forEach((r, idx) => {
      if (currentY + rowHeight > pageHeight - 30) {
        doc.addPage();
        currentY = 30;
        drawTableHeader(currentY);
        currentY += rowHeight;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(253, 250, 245);
        doc.rect(margin, currentY, pageWidth - margin * 2, rowHeight, 'F');
      }
      doc.setDrawColor(240, 235, 227);
      doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      let x = margin;
      doc.setTextColor(41, 36, 58);

      const regTime = formatReportDateTime(r.created_at);
      const apprTime = r.payment?.verified_at
        ? formatReportDateTime(r.payment.verified_at)
        : (r.payment_status === 'PAID' ? 'Verified' : 'Pending');
      const gateTime = r.pass?.redeemed_at
        ? formatReportDateTime(r.pass.redeemed_at)
        : (r.pass?.status === 'USED' ? 'Scanned' : 'Not scanned');
      const dinnerTime = r.pass?.dinner_redeemed_at
        ? formatReportDateTime(r.pass.dinner_redeemed_at)
        : 'Not claimed';

      const values = [
        (idx + 1).toString(),
        r.normalized_roll_number,
        r.full_name.length > 18 ? r.full_name.slice(0, 17) + '…' : r.full_name,
        r.academic_year,
        r.food_preference,
        r.performance_talent ? (r.performance_talent.length > 13 ? r.performance_talent.slice(0, 12) + '…' : r.performance_talent) : '—',
        r.payment_status,
        r.pass?.status || 'NO_PASS',
        regTime,
        apprTime,
        gateTime,
        dinnerTime,
      ];

      values.forEach((val, vIdx) => {
        doc.text(val, x + 3, currentY + 13);
        x += cols[vIdx].width;
      });

      currentY += rowHeight;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(107, 101, 93);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 50, pageHeight - 15);
    }

    doc.save(`PreDiwali_Registrations_Report_${Date.now()}.pdf`);
  };

  const pendingPaymentsCount = allPayments.filter((p) => p.status === 'PENDING').length;
  const paidPaymentsCount = allPayments.filter((p) => p.status === 'PAID').length;
  const rejectedPaymentsCount = allPayments.filter((p) => p.status === 'REJECTED').length;

  const filteredPayments = allPayments.filter((pay) => {
    if (paymentStatusFilter !== 'ALL' && pay.status !== paymentStatusFilter) {
      return false;
    }
    if (paymentSearchTerm.trim()) {
      const q = paymentSearchTerm.toLowerCase();
      const name = (pay.registration?.full_name || '').toLowerCase();
      const roll = (pay.registration?.normalized_roll_number || '').toLowerCase();
      const ref = (pay.transaction_reference || '').toLowerCase();
      return name.includes(q) || roll.includes(q) || ref.includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[82vh] w-full max-w-full min-w-0 bg-[#FFFCF5]">
      {/* ----------------- MOBILE NAVIGATION BAR (< lg) ----------------- */}
      <div className="lg:hidden bg-white border border-[#E8E2D9] rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-xs space-y-3">
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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
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
      <aside className="hidden lg:flex w-60 xl:w-64 bg-white border border-[#E8E2D9] rounded-3xl p-4 xl:p-5 shadow-xs flex-col justify-between shrink-0">
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
      <section className="flex-1 min-w-0 max-w-full space-y-5 lg:space-y-6 overflow-hidden">
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
            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-4 sm:space-y-5 w-full max-w-full min-w-0 overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-[#29243A]">Student Registrations</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#FFF0D9] text-[#6D28D9] font-bold text-xs border border-[#E8E2D9]">
                      {filteredRegistrations.length}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B655D] mt-0.5">
                    Search, filter, roll number sorting, timestamps audit, and full student record management.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={exportRegistrationsExcel}
                    className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#15803D] text-xs font-bold border border-emerald-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title="Export styled Excel workbook (.xls)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#15803D]" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportRegistrationsPdf}
                    className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Export formatted PDF report with timestamps"
                  >
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Export PDF</span>
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 flex-1 min-w-0">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#6B655D] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search name, roll, phone, talent..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9]"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setCurrentPage(1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[#E8E2D9] text-[#6B655D] cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    value={yearFilter}
                    onChange={(e) => {
                      setYearFilter(e.target.value as 'ALL' | AcademicYear | 'FY' | 'SY');
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer truncate"
                  >
                    <option value="ALL">All Academic Years</option>
                    <option value="FY - M.Sc.IT">FY - M.Sc.IT</option>
                    <option value="FY - Data Science">FY - Data Science</option>
                    <option value="SY - M.Sc.IT">SY - M.Sc.IT</option>
                    <option value="SY - Data Science">SY - Data Science</option>
                    <option value="FY">First Year (FY - All)</option>
                    <option value="SY">Second Year (SY - All)</option>
                  </select>

                  <select
                    value={foodFilter}
                    onChange={(e) => {
                      setFoodFilter(e.target.value as 'ALL' | FoodPreference);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer truncate"
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
                    className="px-3 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold cursor-pointer truncate"
                  >
                    <option value="ALL">All Payment Statuses</option>
                    <option value="PAID">PAID</option>
                    <option value="PENDING">PENDING</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>

                {(searchTerm || yearFilter !== 'ALL' || foodFilter !== 'ALL' || paymentFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setYearFilter('ALL');
                      setFoodFilter('ALL');
                      setPaymentFilter('ALL');
                      setEntryFilter('ALL');
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] border border-[#E8E2D9] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0 self-start lg:self-auto"
                    title="Reset all filters to default"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#E99A20]" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>

              {/* ----------------- MOBILE CARD VIEW (< md) ----------------- */}
              <div className="md:hidden space-y-3">
                {paginatedRegistrations.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] text-[#6B655D] text-xs">
                    No registrations match the selected filters.
                  </div>
                ) : (
                  paginatedRegistrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-3.5 rounded-2xl bg-white border border-[#E8E2D9] shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {reg.identity_photo_url ? (
                            <img
                              src={reg.identity_photo_url}
                              alt={reg.full_name}
                              onClick={() =>
                                setViewingStudentPhoto({
                                  url: reg.identity_photo_url!,
                                  name: reg.full_name,
                                  roll: reg.normalized_roll_number,
                                })
                              }
                              className="w-11 h-11 rounded-xl object-cover border border-[#E8E2D9] shadow-xs shrink-0 cursor-pointer"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-[#FFF0D9] border border-[#E8E2D9] flex items-center justify-center text-[#E99A20] text-sm font-bold shrink-0">
                              {reg.full_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs sm:text-sm text-[#29243A] truncate">{reg.full_name}</h3>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] font-bold text-[#6D28D9] bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200">
                                {reg.normalized_roll_number}
                              </span>
                              <span className="text-[10px] text-[#6B655D]">{reg.academic_year}</span>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            reg.payment_status === 'PAID'
                              ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                              : reg.payment_status === 'PENDING'
                              ? 'bg-amber-50 text-[#B45309] border border-amber-200'
                              : 'bg-rose-50 text-[#B91C1C] border border-rose-200'
                          }`}
                        >
                          {reg.payment_status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-[#FFFCF5] p-2.5 rounded-xl border border-[#E8E2D9]/70">
                        <div>
                          <span className="text-[10px] text-[#6B655D] block">Meal</span>
                          <span className="font-bold text-[#29243A] text-xs">{reg.food_preference} Dinner</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6B655D] block">Phone</span>
                          <span className="font-mono text-[#29243A] text-xs">{reg.contact_number}</span>
                        </div>
                        <div className="col-span-2 flex items-center justify-between pt-1 border-t border-[#E8E2D9]/60">
                          <div>
                            <span className="text-[10px] text-[#6B655D] block">Gate Scan</span>
                            {reg.pass?.redeemed_at || reg.pass?.status === 'USED' ? (
                              <span className="text-emerald-700 font-bold text-[11px]">✓ Checked In</span>
                            ) : (
                              <span className="text-amber-700 font-medium text-[11px]">⏳ Not Scanned</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-[#6B655D] block">Dinner Scan</span>
                            {reg.pass?.dinner_redeemed_at ? (
                              <span className="text-emerald-700 font-bold text-[11px]">✓ Claimed</span>
                            ) : (
                              <span className="text-[#6B655D] text-[11px]">Not Claimed</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReg(reg)}
                          className="flex-1 py-1 px-2 rounded-lg bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] text-[11px] font-bold cursor-pointer text-center"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditReg(reg)}
                          className="flex-1 py-1 px-2 rounded-lg bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] border border-[#E8E2D9] text-[11px] font-bold cursor-pointer text-center"
                        >
                          Edit
                        </button>
                        {reg.pass?.status === 'USED' && (
                          <button
                            type="button"
                            onClick={() => handleReactivatePass(reg.pass!.id, reg.full_name)}
                            className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-200 text-[11px] font-bold cursor-pointer"
                          >
                            Re-use QR
                          </button>
                        )}
                        {reg.pass?.status === 'VALID' && !reg.pass?.redeemed_at && (
                          <button
                            type="button"
                            onClick={() => handleMarkGateDone(reg.pass!.id, reg.full_name)}
                            className="py-1 px-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#6D28D9] border border-purple-200 text-[11px] font-bold cursor-pointer"
                          >
                            Mark Gate
                          </button>
                        )}
                        {reg.pass && (reg.pass.redeemed_at || reg.pass.status === 'USED') && !reg.pass.dinner_redeemed_at && (
                          <button
                            type="button"
                            onClick={() => handleMarkDinnerDone(reg.pass!.id, reg.full_name)}
                            className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#B45309] border border-amber-200 text-[11px] font-bold cursor-pointer"
                          >
                            Mark Dinner
                          </button>
                        )}
                        {reg.pass?.dinner_redeemed_at && (
                          <button
                            type="button"
                            onClick={() => handleResetDinnerScan(reg.pass!.id, reg.full_name)}
                            className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#B45309] border border-amber-200 text-[11px] font-bold cursor-pointer"
                          >
                            Reset Dinner
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRegistration(reg.id, reg.full_name)}
                          className="py-1 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-[11px] font-bold cursor-pointer"
                          title="Delete registration permanently"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ----------------- DESKTOP / TABLET RESPONSIVE TABLE (hidden md:block) ----------------- */}
              <div className="hidden md:block overflow-x-auto w-full max-w-full rounded-xl sm:rounded-2xl border border-[#E8E2D9] shadow-2xs scrollbar-thin scrollbar-thumb-amber-300 scrollbar-track-[#FFF0D9]/30">
                <table className="w-full min-w-[1100px] text-left text-xs text-[#29243A] border-collapse">
                  <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                    <tr>
                      <th
                        className="px-3 py-3 cursor-pointer hover:bg-[#FFE6C2] transition-colors select-none w-20 whitespace-nowrap"
                        onClick={() => handleToggleSort('roll')}
                        title="Click to sort by Roll Number"
                      >
                        <div className="flex items-center gap-1">
                          <span>Roll No</span>
                          {sortField === 'roll' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#6D28D9]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#6D28D9]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#6B655D]/40" />
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-3 cursor-pointer hover:bg-[#FFE6C2] transition-colors select-none whitespace-nowrap"
                        onClick={() => handleToggleSort('name')}
                        title="Click to sort by Student Name"
                      >
                        <div className="flex items-center gap-1">
                          <span>Student</span>
                          {sortField === 'name' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#6D28D9]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#6D28D9]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-[#6B655D]/40" />
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-3 whitespace-nowrap">Course & Meal</th>
                      <th className="px-3 py-3 whitespace-nowrap">Timestamps</th>
                      <th className="px-3 py-3 whitespace-nowrap">Gate Entry QR</th>
                      <th className="px-3 py-3 whitespace-nowrap">Dinner QR Scan</th>
                      <th className="px-3 py-3 whitespace-nowrap">Payment</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap sticky right-0 bg-[#FFF0D9] z-10 min-w-[300px] shadow-[-4px_0_6px_rgba(0,0,0,0.03)]">
                        Actions
                      </th>
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
                        <tr key={reg.id} className="hover:bg-[#FFF0D9]/30 transition-colors group">
                          <td className="px-3 py-2.5 sm:py-3 font-mono font-bold text-[#6D28D9] whitespace-nowrap">
                            {reg.normalized_roll_number}
                          </td>
                          <td className="px-3 py-2.5 sm:py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {reg.identity_photo_url ? (
                                <img
                                  src={reg.identity_photo_url}
                                  alt={reg.full_name}
                                  onClick={() =>
                                    setViewingStudentPhoto({
                                      url: reg.identity_photo_url!,
                                      name: reg.full_name,
                                      roll: reg.normalized_roll_number,
                                    })
                                  }
                                  className="w-8 h-8 rounded-lg object-cover border border-[#E8E2D9] shadow-xs cursor-pointer hover:scale-110 transition-transform shrink-0"
                                  title="Click to view full photo"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-[#FFF0D9] border border-[#E8E2D9] flex items-center justify-center text-[#E99A20] text-xs font-bold shrink-0">
                                  {reg.full_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="font-bold text-[#29243A] block truncate max-w-[140px] sm:max-w-none">{reg.full_name}</span>
                                <span className="text-[10px] text-[#6B655D] font-mono">{reg.contact_number}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 sm:py-3 whitespace-nowrap space-y-0.5">
                            <div className="text-[#29243A] font-semibold text-xs">{reg.academic_year}</div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full bg-[#FFF0D9] text-[#29243A] font-bold text-[10px]">
                                {reg.food_preference}
                              </span>
                              {reg.performance_talent && (
                                <span
                                  className="px-2 py-0.5 rounded-full bg-purple-50 text-[#6D28D9] font-bold text-[10px] border border-purple-200 truncate max-w-[100px]"
                                  title={reg.performance_talent}
                                >
                                  🎭 {reg.performance_talent}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 sm:py-3 text-[10px] space-y-0.5 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-[#29243A]">
                              <span className="font-bold text-[#6B655D] w-7">Reg:</span>
                              <span>{formatKolkataDateTime(reg.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-[#6B655D] w-7">Appr:</span>
                              <span
                                className={
                                  reg.payment?.verified_at
                                    ? 'text-[#15803D] font-bold'
                                    : reg.payment_status === 'PAID'
                                    ? 'text-[#15803D] font-medium'
                                    : 'text-[#6B655D]'
                                }
                              >
                                {reg.payment?.verified_at
                                  ? formatKolkataDateTime(reg.payment.verified_at)
                                  : reg.payment_status === 'PAID'
                                  ? 'Verified'
                                  : 'Pending'}
                              </span>
                            </div>
                          </td>

                          {/* 1. Gate Entry QR Checkpoint - Real-time Live Update */}
                          <td className="px-3 py-2.5 sm:py-3 whitespace-nowrap">
                            {(() => {
                              const gateScan = scansList.find(
                                (s) =>
                                  (s.pass_id === reg.pass?.id ||
                                    s.pass_id === reg.id ||
                                    s.roll_number === reg.normalized_roll_number) &&
                                  s.scan_result === 'ENTRY_APPROVED'
                              );

                              let notesGateAt: string | undefined = undefined;
                              if (reg.internal_notes) {
                                try {
                                  if (typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')) {
                                    const parsed = JSON.parse(reg.internal_notes);
                                    if (parsed.gate_entry_redeemed_at) notesGateAt = parsed.gate_entry_redeemed_at;
                                  }
                                } catch {
                                  // ignore
                                }
                              }

                              const isGateDone = Boolean(reg.pass?.redeemed_at || reg.pass?.status === 'USED' || gateScan || notesGateAt);
                              const gateTime = reg.pass?.redeemed_at || gateScan?.scanned_at || notesGateAt;

                              if (isGateDone) {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 font-bold text-[10px]">
                                      <CheckCircle2 className="w-3 h-3 text-[#15803D]" /> Gate Done
                                    </span>
                                    <div className="text-[10px] text-[#6B655D]">
                                      {gateTime ? formatKolkataDateTime(gateTime) : 'Admitted'}
                                    </div>
                                  </div>
                                );
                              }

                              if (reg.pass || reg.payment_status === 'PAID') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[#6B655D] border border-slate-200 font-medium text-[10px]">
                                    ○ Not Scanned
                                  </span>
                                );
                              }

                              return <span className="text-[#6B655D] text-[10px]">No Pass</span>;
                            })()}
                          </td>

                          {/* 2. Dinner QR Scan Checkpoint - Real-time Live Update */}
                          <td className="px-3 py-2.5 sm:py-3 whitespace-nowrap">
                            {(() => {
                              const gateScan = scansList.find(
                                (s) =>
                                  (s.pass_id === reg.pass?.id ||
                                    s.pass_id === reg.id ||
                                    s.roll_number === reg.normalized_roll_number) &&
                                  s.scan_result === 'ENTRY_APPROVED'
                              );

                              const dinnerScan = scansList.find(
                                (s) =>
                                  (s.pass_id === reg.pass?.id ||
                                    s.pass_id === reg.id ||
                                    s.roll_number === reg.normalized_roll_number) &&
                                  s.scan_result === 'DINNER_APPROVED'
                              );

                              let notesGateAt: string | undefined = undefined;
                              let notesDinnerAt: string | undefined = undefined;
                              if (reg.internal_notes) {
                                try {
                                  if (typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')) {
                                    const parsed = JSON.parse(reg.internal_notes);
                                    if (parsed.gate_entry_redeemed_at) notesGateAt = parsed.gate_entry_redeemed_at;
                                    if (parsed.dinner_redeemed_at) notesDinnerAt = parsed.dinner_redeemed_at;
                                  }
                                } catch {
                                  // ignore
                                }
                              }

                              const isGateDone = Boolean(reg.pass?.redeemed_at || reg.pass?.status === 'USED' || gateScan || notesGateAt);
                              const isDinnerDone = Boolean(reg.pass?.dinner_redeemed_at || dinnerScan || notesDinnerAt);
                              const dinnerTime = reg.pass?.dinner_redeemed_at || dinnerScan?.scanned_at || notesDinnerAt;

                              if (isDinnerDone) {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-[#B45309] border border-amber-200 font-bold text-[10px]">
                                      <Utensils className="w-3 h-3 text-[#E99A20]" /> Dinner Done
                                    </span>
                                    <div className="text-[10px] text-[#6B655D]">
                                      {dinnerTime ? formatKolkataDateTime(dinnerTime) : 'Claimed'}
                                    </div>
                                  </div>
                                );
                              }

                              if (isGateDone) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-[#6D28D9] border border-purple-200 font-bold text-[10px]">
                                    Ready for Dinner
                                  </span>
                                );
                              }

                              if (reg.pass || reg.payment_status === 'PAID') {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-[#B91C1C] border border-rose-200 font-medium text-[10px]"
                                    title="Gate Entry QR must be scanned first"
                                  >
                                    🔒 Gate Required
                                  </span>
                                );
                              }

                              return <span className="text-[#6B655D] text-[10px]">No Pass</span>;
                            })()}
                          </td>

                          {/* Payment Status */}
                          <td className="px-3 py-2.5 sm:py-3 whitespace-nowrap">
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

                          {/* Actions Column (Sticky on right with guaranteed width so Delete is never cut off) */}
                          <td className="px-3 py-2.5 sm:py-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-[#FFFDF7] z-10 min-w-[300px] shadow-[-4px_0_6px_rgba(0,0,0,0.03)]">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedReg(reg)}
                                className="px-2 py-1 rounded-lg bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] border border-[#E8E2D9] text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                                title="View full registration details"
                              >
                                Details
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStartEditReg(reg)}
                                className="px-2 py-1 rounded-lg bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] border border-[#E8E2D9] text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                                title="Edit student registration details"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                                <span>Edit</span>
                              </button>

                              {(() => {
                                const gateScan = scansList.find(
                                  (s) =>
                                    (s.pass_id === reg.pass?.id ||
                                      s.pass_id === reg.id ||
                                      s.roll_number === reg.normalized_roll_number) &&
                                    s.scan_result === 'ENTRY_APPROVED'
                                );
                                const dinnerScan = scansList.find(
                                  (s) =>
                                    (s.pass_id === reg.pass?.id ||
                                      s.pass_id === reg.id ||
                                      s.roll_number === reg.normalized_roll_number) &&
                                    s.scan_result === 'DINNER_APPROVED'
                                );

                                let notesGate = false;
                                let notesDinner = false;
                                if (reg.internal_notes) {
                                  try {
                                    if (typeof reg.internal_notes === 'string' && reg.internal_notes.startsWith('{')) {
                                      const p = JSON.parse(reg.internal_notes);
                                      if (p.gate_entry_redeemed_at) notesGate = true;
                                      if (p.dinner_redeemed_at) notesDinner = true;
                                    }
                                  } catch {
                                    // ignore
                                  }
                                }

                                const isGateDone = Boolean(reg.pass?.redeemed_at || reg.pass?.status === 'USED' || gateScan || notesGate);
                                const isDinnerDone = Boolean(reg.pass?.dinner_redeemed_at || dinnerScan || notesDinner);
                                const passId = reg.pass?.id || reg.id;

                                return (
                                  <>
                                    {isGateDone ? (
                                      <button
                                        type="button"
                                        onClick={() => handleReactivatePass(passId, reg.full_name)}
                                        className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                                        title="Allow student to re-enter using their existing QR code"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>Re-use QR</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkGateDone(passId, reg.full_name)}
                                        className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#6D28D9] border border-purple-200 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                                        title="Manually mark Gate Entry QR as Done"
                                      >
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        <span>Mark Gate</span>
                                      </button>
                                    )}

                                    {isGateDone && !isDinnerDone && (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkDinnerDone(passId, reg.full_name)}
                                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#B45309] border border-amber-200 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                                        title="Manually mark Dinner QR Scan as Done"
                                      >
                                        <Utensils className="w-2.5 h-2.5 text-[#E99A20]" />
                                        <span>Mark Dinner</span>
                                      </button>
                                    )}

                                    {isDinnerDone && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetDinnerScan(passId, reg.full_name)}
                                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#B45309] border border-amber-200 text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                                        title="Reset dinner coupon so student can claim meal"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>Reset Dinner</span>
                                      </button>
                                    )}
                                  </>
                                );
                              })()}

                              {/* PROMINENT ALWAYS-VISIBLE DELETE BUTTON */}
                              <button
                                type="button"
                                onClick={() => handleDeleteRegistration(reg.id, reg.full_name)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs hover:border-rose-300 shrink-0"
                                title={`Delete registration for ${reg.full_name}`}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete</span>
                              </button>
                            </div>
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
            <div className="p-6 rounded-3xl bg-white border border-[#E8E2D9] shadow-xs space-y-5">
              {/* Header & Live Cloud Status */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E8E2D9]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest font-bold text-[#E99A20]">
                      Finance & Verification
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-ping" />
                      Live Supabase Sync Active
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-[#29243A] mt-1">UPI Payment Verification & History</h2>
                  <p className="text-xs text-[#6B655D]">
                    Real-time queue for student UPI claims. When students upload payment screenshots on their phone, they appear here live.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={syncAndRefresh}
                    disabled={isRefreshing}
                    className="px-3.5 py-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] border border-[#E8E2D9] text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#E99A20] ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Syncing...' : 'Sync with Supabase'}</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#FFFCF5] border border-[#E8E2D9] rounded-2xl overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('PENDING')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      paymentStatusFilter === 'PENDING'
                        ? 'bg-[#E99A20] text-white shadow-xs'
                        : 'text-[#6B655D] hover:text-[#29243A]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending Queue ({pendingPaymentsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('PAID')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      paymentStatusFilter === 'PAID'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-[#6B655D] hover:text-[#29243A]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verified / Paid ({paidPaymentsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('REJECTED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      paymentStatusFilter === 'REJECTED'
                        ? 'bg-[#B91C1C] text-white shadow-xs'
                        : 'text-[#6B655D] hover:text-[#29243A]'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rejected ({rejectedPaymentsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      paymentStatusFilter === 'ALL'
                        ? 'bg-[#6D28D9] text-white shadow-xs'
                        : 'text-[#6B655D] hover:text-[#29243A]'
                    }`}
                  >
                    All ({allPayments.length})
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <div className="relative min-w-[200px] sm:min-w-[240px] flex-1 sm:flex-initial">
                    <Search className="w-4 h-4 text-[#6B655D] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={paymentSearchTerm}
                      onChange={(e) => setPaymentSearchTerm(e.target.value)}
                      placeholder="Search roll, student, UTR..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] placeholder-[#6B655D]/60 focus:outline-none focus:border-[#6D28D9]"
                    />
                    {paymentSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setPaymentSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[#E8E2D9] text-[#6B655D] cursor-pointer"
                        title="Clear search text"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleClearAllPaymentsByStatus}
                    disabled={
                      isClearingPayments ||
                      (paymentStatusFilter === 'PENDING' && pendingPaymentsCount === 0) ||
                      (paymentStatusFilter === 'PAID' && paidPaymentsCount === 0) ||
                      (paymentStatusFilter === 'REJECTED' && rejectedPaymentsCount === 0) ||
                      (paymentStatusFilter === 'ALL' && allPayments.length === 0)
                    }
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B91C1C] border border-rose-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shadow-2xs hover:shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Clear ${
                      paymentStatusFilter === 'PENDING'
                        ? 'all pending payments in queue'
                        : paymentStatusFilter === 'ALL'
                        ? 'all payment records'
                        : 'all ' + paymentStatusFilter.toLowerCase() + ' payments'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#B91C1C]" />
                    <span>
                      {isClearingPayments
                        ? 'Clearing...'
                        : paymentStatusFilter === 'PENDING'
                        ? `Clear Pending (${pendingPaymentsCount})`
                        : paymentStatusFilter === 'PAID'
                        ? `Clear Paid (${paidPaymentsCount})`
                        : paymentStatusFilter === 'REJECTED'
                        ? `Clear Rejected (${rejectedPaymentsCount})`
                        : `Clear All (${allPayments.length})`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Table or Empty State */}
              {filteredPayments.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-[#FFFCF5] border border-[#E8E2D9] space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-[#15803D] mx-auto" />
                  <h3 className="text-sm font-bold text-[#29243A]">
                    {paymentStatusFilter === 'PENDING' ? 'No Pending Payments in Queue' : 'No Payments Match Filter'}
                  </h3>
                  <p className="text-xs text-[#6B655D]">
                    {paymentStatusFilter === 'PENDING'
                      ? 'All submitted student payments have been reviewed and verified.'
                      : 'Try switching the filter tabs or search terms above.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin scrollbar-thumb-amber-300 scrollbar-track-[#FFF0D9]/30" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full min-w-[760px] text-left text-xs text-[#29243A]">
                    <thead className="bg-[#FFF0D9] text-[#29243A] font-bold border-b border-[#E8E2D9]">
                      <tr>
                        <th className="p-3.5">Student</th>
                        <th className="p-3.5">Roll No</th>
                        <th className="p-3.5">Amount Snapshot</th>
                        <th className="p-3.5">UPI Reference (UTR)</th>
                        <th className="p-3.5">Payment Screenshot</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Claimed At</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E2D9] bg-white">
                      {filteredPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-[#FFF0D9]/30 transition-colors">
                          <td className="p-3.5">
                            <span className="font-bold text-[#29243A] block">
                              {pay.registration?.full_name || 'Student'}
                            </span>
                            <span className="text-[10px] text-[#6B655D]">
                              {pay.registration?.contact_number || pay.registration?.academic_year || ''}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-[#6D28D9]">
                            {pay.registration?.normalized_roll_number || '—'}
                          </td>
                          <td className="p-3.5 font-black text-[#29243A]">
                            {formatINR(pay.expected_amount_minor_units || 30000, pay.currency || 'INR')}
                          </td>
                          <td className="p-3.5">
                            {pay.transaction_reference ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[#E99A20] text-xs">
                                  {pay.transaction_reference}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => navigator.clipboard.writeText(pay.transaction_reference!)}
                                  className="text-[#6B655D] hover:text-[#6D28D9] p-0.5 cursor-pointer"
                                  title="Copy UTR"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[#6B655D] italic text-[11px]">(Not Provided)</span>
                            )}
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
                          <td className="p-3.5">
                            {pay.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Verified (PAID)
                              </span>
                            ) : pay.status === 'REJECTED' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-[#B91C1C] border border-rose-200 text-[10px] font-bold">
                                  <XCircle className="w-3 h-3" /> REJECTED
                                </span>
                                {pay.rejection_reason && (
                                  <p className="text-[10px] text-[#B91C1C] mt-0.5 truncate max-w-[140px]" title={pay.rejection_reason}>
                                    {pay.rejection_reason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-[#B45309] border border-amber-200 text-[10px] font-bold animate-pulse">
                                <Clock className="w-3 h-3" /> Pending Review
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-[#6B655D] whitespace-nowrap">
                            {formatKolkataDateTime(pay.created_at)}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap space-x-2">
                            {pay.status === 'PENDING' ? (
                              <>
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
                              </>
                            ) : pay.status === 'PAID' ? (
                              <span className="text-[11px] text-[#15803D] font-bold">
                                Entry Pass Issued
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVerifyModalPayment(pay)}
                                className="px-2.5 py-1 rounded-lg bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] font-bold text-[11px] border border-[#E8E2D9] cursor-pointer"
                              >
                                Re-verify
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteSinglePayment(
                                  pay.id,
                                  pay.transaction_reference || pay.registration?.full_name || pay.id
                                )
                              }
                              className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-[#6B655D] hover:text-[#B91C1C] border border-[#E8E2D9] hover:border-rose-200 transition-colors cursor-pointer inline-flex items-center align-middle"
                              title="Delete / Clear this payment record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[650px] text-left text-xs text-[#29243A]">
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

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[700px] text-left text-xs text-[#29243A]">
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
                      .filter((r) => r.payment_status === 'PAID' && !!r.pass)
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
                          <td className="p-3.5 text-right space-x-1 whitespace-nowrap">
                            {r.pass!.status === 'USED' && (
                              <button
                                type="button"
                                onClick={() => handleReactivatePass(r.pass!.id, r.full_name)}
                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                title="Allow student to re-enter using their existing QR code"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Re-use QR</span>
                              </button>
                            )}
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
              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[600px] text-left text-xs text-[#29243A]">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#29243A]">Live Gate Entry Scanner Activity</h2>
                  <p className="text-xs text-[#6B655D]">
                    Authoritative chronological stream of all gate scans, admissions, and denied duplicate attempts.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={syncAndRefresh}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE5B4] text-[#6D28D9] text-xs font-bold border border-[#E99A20]/40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#E99A20] ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Syncing...' : 'Refresh Scans'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllScans}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B91C1C] text-xs font-bold border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Scan Logs</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[650px] text-left text-xs text-[#29243A]">
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
                      scansList.map((scan) => {
                        const linkedPass = dataService.getPasses().find((p) => p.id === scan.pass_id || p.registration_id === scan.pass_id);
                        const linkedReg = registrations.find(
                          (r) => r.id === scan.pass_id || (linkedPass && r.id === linkedPass.registration_id)
                        );
                        const studentName = scan.student_name || linkedReg?.full_name || '—';
                        const rollNumber = scan.roll_number || (linkedReg ? formatRollWithCoursePrefix(linkedReg.normalized_roll_number, linkedReg.academic_year) : '—');

                        return (
                          <tr key={scan.id} className="hover:bg-[#FFF0D9]/20 transition-colors">
                            <td className="p-3.5 text-[#6B655D]">{formatKolkataDateTime(scan.scanned_at)}</td>
                            <td className="p-3.5 font-bold text-[#29243A]">{scan.staff_name || scan.staff_user_id}</td>
                            <td className="p-3.5 font-bold text-[#29243A]">{studentName}</td>
                            <td className="p-3.5 font-mono font-bold text-[#6D28D9]">{rollNumber}</td>
                            <td className="p-3.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  scan.scan_result === 'ENTRY_APPROVED' || scan.scan_result === 'DINNER_APPROVED'
                                    ? scan.scan_result === 'DINNER_APPROVED'
                                      ? 'bg-purple-50 text-[#6D28D9] border border-purple-200'
                                      : 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                                    : 'bg-rose-50 text-[#B91C1C] border border-rose-200'
                                }`}
                              >
                                {scan.scan_result}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono text-[10px] text-[#6B655D]">{scan.request_id || '—'}</td>
                          </tr>
                        );
                      })
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
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={exportRegistrationsExcel}
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#15803D] text-xs font-bold border border-emerald-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#15803D]" />
                    <span>Download Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportRegistrationsPdf}
                    className="px-3.5 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download PDF Report</span>
                  </button>
                </div>
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

              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D9] scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full min-w-[700px] text-left text-xs text-[#29243A]">
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
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
              <div>
                <h3 className="text-base font-bold text-[#29243A]">Student Registration Record</h3>
                <span className="text-[11px] text-[#6B655D]">Roll No: {selectedReg.normalized_roll_number}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="text-xs font-bold text-[#6B655D] hover:text-[#29243A] cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Student Verified Identity Photo Card in Modal */}
            {selectedReg.identity_photo_url && (
              <div className="flex items-center gap-4 p-3.5 bg-[#FFFCF5] rounded-2xl border border-[#E8E2D9] shadow-xs">
                <img
                  src={selectedReg.identity_photo_url}
                  alt={selectedReg.full_name}
                  onClick={() =>
                    setViewingStudentPhoto({
                      url: selectedReg.identity_photo_url!,
                      name: selectedReg.full_name,
                      roll: selectedReg.normalized_roll_number,
                    })
                  }
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[#6D28D9] shadow-xs cursor-pointer hover:scale-105 transition-transform"
                  title="Click to view full photo"
                />
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#6D28D9] bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 inline-block">
                    Verified Identity Photo
                  </span>
                  <h4 className="font-bold text-sm text-[#29243A]">{selectedReg.full_name}</h4>
                  <p className="text-[11px] text-[#6B655D]">Click image to inspect high-resolution selfie</p>
                </div>
              </div>
            )}

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
                <span className="text-[#6B655D]">Course / Academic Year:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.academic_year}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Food Preference:</span>
                <span className="font-bold text-[#29243A]">{selectedReg.food_preference} Dinner</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Contact Number:</span>
                <span className="font-mono text-[#29243A]">{selectedReg.contact_number}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Stage Performance Talent:</span>
                <span className="font-bold text-[#6D28D9]">
                  {selectedReg.performance_talent || 'None (General Attendance)'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Registration Timestamp:</span>
                <span className="font-medium text-[#29243A]">{formatKolkataDateTime(selectedReg.created_at)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Payment Approval Timestamp:</span>
                <span
                  className={
                    selectedReg.payment?.verified_at
                      ? 'text-[#15803D] font-bold'
                      : selectedReg.payment_status === 'PAID'
                      ? 'text-[#15803D] font-medium'
                      : 'text-[#6B655D]'
                  }
                >
                  {selectedReg.payment?.verified_at
                    ? formatKolkataDateTime(selectedReg.payment.verified_at)
                    : selectedReg.payment_status === 'PAID'
                    ? 'Verified'
                    : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Gate QR Scanner Timestamp:</span>
                <span
                  className={
                    selectedReg.pass?.redeemed_at
                      ? 'text-[#15803D] font-bold'
                      : selectedReg.pass?.status === 'USED'
                      ? 'text-[#B45309] font-bold'
                      : 'text-[#6B655D]'
                  }
                >
                  {selectedReg.pass?.redeemed_at
                    ? formatKolkataDateTime(selectedReg.pass.redeemed_at)
                    : selectedReg.pass?.status === 'USED'
                    ? 'Scanned & Admitted'
                    : 'Not scanned yet'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Dinner Coupon Scan Timestamp:</span>
                <span
                  className={
                    selectedReg.pass?.dinner_redeemed_at
                      ? 'text-[#E99A20] font-bold'
                      : 'text-[#6B655D]'
                  }
                >
                  {selectedReg.pass?.dinner_redeemed_at
                    ? formatKolkataDateTime(selectedReg.pass.dinner_redeemed_at)
                    : 'Not claimed yet'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Fee Amount:</span>
                <span className="font-black text-[#6D28D9]">
                  {formatINR(selectedReg.expected_amount_minor_units, selectedReg.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E8E2D9]">
                <span className="text-[#6B655D]">Payment Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                    selectedReg.payment_status === 'PAID'
                      ? 'bg-emerald-50 text-[#15803D]'
                      : selectedReg.payment_status === 'PENDING'
                      ? 'bg-amber-50 text-[#B45309]'
                      : 'bg-rose-50 text-[#B91C1C]'
                  }`}
                >
                  {selectedReg.payment_status}
                </span>
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
                <span className="font-mono text-[10px] text-[#6B655D] truncate max-w-[200px]">
                  {selectedReg.pass?.token_hash || 'No pass generated yet'}
                </span>
              </div>
            </div>

            {/* Quick Actions in Detail Modal */}
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const target = selectedReg;
                  setSelectedReg(null);
                  handleStartEditReg(target);
                }}
                className="flex-1 py-2 rounded-xl bg-[#FFF0D9] hover:bg-[#FFE6C2] text-[#6D28D9] font-bold text-xs border border-[#E8E2D9] flex items-center justify-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>

              {selectedReg.pass?.status === 'USED' && (
                <button
                  type="button"
                  onClick={() => {
                    handleReactivatePass(selectedReg.pass!.id, selectedReg.full_name);
                    setSelectedReg(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#15803D] font-bold text-xs border border-emerald-200 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-use Gate QR</span>
                </button>
              )}

              {selectedReg.pass?.status === 'VALID' && !selectedReg.pass?.redeemed_at && (
                <button
                  type="button"
                  onClick={() => {
                    handleMarkGateDone(selectedReg.pass!.id, selectedReg.full_name);
                    setSelectedReg(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark Gate Done</span>
                </button>
              )}

              {selectedReg.pass && (selectedReg.pass.redeemed_at || selectedReg.pass.status === 'USED') && !selectedReg.pass.dinner_redeemed_at && (
                <button
                  type="button"
                  onClick={() => {
                    handleMarkDinnerDone(selectedReg.pass!.id, selectedReg.full_name);
                    setSelectedReg(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#E99A20] hover:bg-[#D98A10] text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Mark Dinner Done</span>
                </button>
              )}

              {selectedReg.pass?.dinner_redeemed_at && (
                <button
                  type="button"
                  onClick={() => {
                    handleResetDinnerScan(selectedReg.pass!.id, selectedReg.full_name);
                    setSelectedReg(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#B45309] font-bold text-xs border border-amber-200 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Reset Dinner</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="py-2 px-4 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- EDIT STUDENT REGISTRATION MODAL ----------------- */}
      {editingReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D9]">
              <div>
                <h3 className="text-base font-bold text-[#29243A]">Edit Student Registration</h3>
                <p className="text-[11px] text-[#6B655D]">Modify details & sync directly to Supabase cloud</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReg(null)}
                className="text-xs font-bold text-[#6B655D] hover:text-[#29243A] cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-[#B91C1C] font-semibold">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEditReg} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#29243A] block">Student Full Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  required
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] font-semibold focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#29243A] block">Roll Number</label>
                  <input
                    type="text"
                    value={editForm.roll_number}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, roll_number: e.target.value }))}
                    required
                    placeholder="e.g. IT101 / DS202"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-mono font-bold text-[#6D28D9] focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#29243A] block">Academic Year / Course</label>
                  <select
                    value={editForm.academic_year}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, academic_year: e.target.value as AcademicYear }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-semibold text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                  >
                    <option value="FY - M.Sc.IT">FY - M.Sc.IT</option>
                    <option value="FY - Data Science">FY - Data Science</option>
                    <option value="SY - M.Sc.IT">SY - M.Sc.IT</option>
                    <option value="SY - Data Science">SY - Data Science</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#29243A] block">Contact Number</label>
                  <input
                    type="tel"
                    value={editForm.contact_number}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, contact_number: e.target.value }))}
                    required
                    placeholder="10-digit mobile number"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-mono text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#29243A] block">Food Preference</label>
                  <select
                    value={editForm.food_preference}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, food_preference: e.target.value as FoodPreference }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs font-semibold text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                  >
                    <option value="Regular">Regular Dinner</option>
                    <option value="Jain">Jain Dinner</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#29243A] block">
                  Stage Performance / Talent Participation
                </label>
                <input
                  type="text"
                  value={editForm.performance_talent}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, performance_talent: e.target.value }))}
                  placeholder="e.g. Solo Singing, Garba Dance, Drama (or leave blank if none)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFCF5] border border-[#E8E2D9] text-xs text-[#29243A] focus:outline-none focus:border-[#6D28D9]"
                />
                <span className="text-[11px] text-[#6B655D] block">
                  If student is performing on stage, specify their act or song/dance details.
                </span>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingReg(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#FFFCF5] hover:bg-[#FFF0D9] text-[#29243A] font-bold text-xs border border-[#E8E2D9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <span>Saving to Supabase...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- STUDENT IDENTITY PHOTO LIGHTBOX MODAL ----------------- */}
      {viewingStudentPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 flex flex-col items-center">
            <div className="flex items-center justify-between w-full pb-3 border-b border-[#E8E2D9]">
              <div>
                <h3 className="text-base font-bold text-[#29243A]">Verified Student Photo</h3>
                <p className="text-xs text-[#6B655D]">
                  {viewingStudentPhoto.name} ({viewingStudentPhoto.roll})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingStudentPhoto(null)}
                className="p-1.5 rounded-xl hover:bg-[#FFF0D9] text-[#6B655D] hover:text-[#29243A] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-black/5 border-2 border-[#6D28D9] flex items-center justify-center shadow-inner">
              <img
                src={viewingStudentPhoto.url}
                alt={viewingStudentPhoto.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-between w-full pt-1">
              <a
                href={viewingStudentPhoto.url}
                target="_blank"
                rel="noreferrer"
                download={`photo-${viewingStudentPhoto.roll}.jpg`}
                className="text-xs text-[#6D28D9] hover:underline flex items-center gap-1.5 font-bold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Photo</span>
              </a>
              <button
                type="button"
                onClick={() => setViewingStudentPhoto(null)}
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

