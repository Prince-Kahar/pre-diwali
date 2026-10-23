import React, { useState, useEffect } from 'react';
import { GraduationCap, ArrowRight } from 'lucide-react';
import { EventSettings, UserProfile, Registration, EntryPass } from './types';
import { dataService } from './services/dataService';
import { Navbar, ActivePortal } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { TermsModal } from './components/common/TermsModal';
import { LandingPage } from './components/student/LandingPage';
import { RegistrationForm } from './components/student/RegistrationForm';
import { PaymentModal } from './components/student/PaymentModal';
import { PassView } from './components/student/PassView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminLogin } from './components/admin/AdminLogin';
import { StaffScanner } from './components/staff/StaffScanner';
import { StaffLogin } from './components/staff/StaffLogin';

export function App() {
  const getInitialPortal = (): ActivePortal => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const portalParam = params.get('portal')?.toUpperCase();
      if (portalParam === 'STAFF') return 'STAFF';
      if (portalParam === 'ADMIN') return 'ADMIN';
    }
    return 'STUDENT';
  };

  const [activePortal, setActivePortal] = useState<ActivePortal>(getInitialPortal);
  const [eventSettings, setEventSettings] = useState<EventSettings>(dataService.getEventSettings());

  // Student portal sub-state
  const [studentStep, setStudentStep] = useState<'LANDING' | 'FORM' | 'PASS'>('LANDING');
  const [currentRegistration, setCurrentRegistration] = useState<Registration | null>(null);
  const [currentPass, setCurrentPass] = useState<(EntryPass & { raw_token?: string }) | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  // Ambiguous roll collision resolution state (e.g. IT2021 and DS2021 both exist)
  const [ambiguousMatches, setAmbiguousMatches] = useState<Registration[] | null>(null);

  // Authenticated state
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [staffUser, setStaffUser] = useState<UserProfile | null>(null);

  // Terms modal
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Sync event settings
  useEffect(() => {
    setEventSettings(dataService.getEventSettings());
  }, []);

  const openStudentPassOrPayment = (reg: Registration) => {
    setCurrentRegistration(reg);
    if (reg.payment_status === 'PAID') {
      const pass = dataService.getEntryPassByRegistration(reg.id);
      if (pass) {
        setCurrentPass(pass);
        setStudentStep('PASS');
        return;
      }
    }
    // If unpaid or pending, open payment modal to view status or complete payment
    setShowPaymentModal(true);
  };

  // Handle Roll Number Lookup from Landing Page (Fix IT vs DS Collision)
  const handleLookupRollNumber = async (roll: string, courseFilter?: string) => {
    setLookupMessage(null);
    setAmbiguousMatches(null);

    // If specific course requested or direct prefixed roll (e.g. IT2021 or DS2021)
    if (courseFilter) {
      let reg = dataService.getRegistrationByRollNumber(roll, courseFilter);
      if (!reg) {
        await dataService.initSupabase();
        reg = dataService.getRegistrationByRollNumber(roll, courseFilter);
      }
      if (!reg) {
        alert(`No registration found for Roll Number "${roll}" in ${courseFilter === 'IT' ? 'M.Sc. IT' : 'Data Science'}.`);
        return;
      }
      openStudentPassOrPayment(reg);
      return;
    }

    // Direct match check first
    let matches = dataService.getRegistrationsByRollNumber(roll);
    if (matches.length === 0) {
      await dataService.initSupabase();
      matches = dataService.getRegistrationsByRollNumber(roll);
    }

    if (matches.length === 0) {
      alert(`No registration found for Roll Number "${roll}". Please check your roll number or register.`);
      return;
    }

    // Collision detected: Multiple students have roll number 2021 across different courses (IT vs DS)!
    if (matches.length > 1) {
      setAmbiguousMatches(matches);
      return;
    }

    // Unique student found safely
    openStudentPassOrPayment(matches[0]);
  };

  // Handle Successful Registration Form Submission
  const handleRegistrationSuccess = (reg: Registration, alreadyRegistered: boolean) => {
    setCurrentRegistration(reg);

    if (alreadyRegistered) {
      if (reg.payment_status === 'PAID') {
        const pass = dataService.getEntryPassByRegistration(reg.id);
        if (pass) {
          setCurrentPass(pass);
          setStudentStep('PASS');
          return;
        }
      }
      alert(`Roll number ${reg.normalized_roll_number} is already registered. Opening payment details...`);
      setShowPaymentModal(true);
      return;
    }

    // New registration -> Open Payment
    setShowPaymentModal(true);
  };

  // Handle Payment Confirmed
  const handlePaymentSuccess = () => {
    if (!currentRegistration) return;
    setShowPaymentModal(false);

    // Refresh registration and pass
    const updatedReg = dataService.getRegistrationById(currentRegistration.id);
    if (updatedReg) setCurrentRegistration(updatedReg);

    const pass = dataService.getEntryPassByRegistration(currentRegistration.id);
    if (pass) {
      setCurrentPass(pass);
      setStudentStep('PASS');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFCF5] text-[#29243A] selection:bg-[#E99A20] selection:text-white">
      {/* Universal Top Navigation */}
      <Navbar
        activePortal={activePortal}
        onSelectPortal={(portal) => {
          setActivePortal(portal);
          setLookupMessage(null);
        }}
        event={eventSettings}
        adminLoggedIn={!!adminUser}
        staffLoggedIn={!!staffUser}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ----------------- 1. STUDENT REGISTRATION PORTAL ----------------- */}
        {activePortal === 'STUDENT' && (
          <div>
            {studentStep === 'LANDING' && (
              <LandingPage
                event={eventSettings}
                onStartRegistration={() => setStudentStep('FORM')}
                onLookupRollNumber={handleLookupRollNumber}
                onOpenTerms={() => setIsTermsOpen(true)}
              />
            )}

            {studentStep === 'FORM' && (
              <RegistrationForm
                event={eventSettings}
                onSuccess={handleRegistrationSuccess}
                onCancel={() => setStudentStep('LANDING')}
                onOpenTerms={() => setIsTermsOpen(true)}
              />
            )}

            {studentStep === 'PASS' && currentRegistration && currentPass && (
              <PassView
                event={eventSettings}
                registration={currentRegistration}
                pass={currentPass}
                onBack={() => setStudentStep('LANDING')}
              />
            )}

            {/* Payment Modal */}
            {showPaymentModal && currentRegistration && (
              <PaymentModal
                event={eventSettings}
                registration={currentRegistration}
                onPaymentSuccess={handlePaymentSuccess}
                onClose={() => setShowPaymentModal(false)}
              />
            )}

            {/* Department / Course Disambiguation Modal (When multiple students have roll 2021) */}
            {ambiguousMatches && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
                <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
                  <div className="text-center space-y-1.5">
                    <div className="inline-flex p-3 rounded-2xl bg-[#FFF0D9] text-[#6D28D9] mb-1">
                      <GraduationCap className="w-6 h-6 text-[#E99A20]" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#29243A]">
                      Select Your Department Profile
                    </h3>
                    <p className="text-xs text-[#6B655D]">
                      Multiple students match this roll number across different courses. Please tap on your profile:
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {ambiguousMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setAmbiguousMatches(null);
                          openStudentPassOrPayment(m);
                        }}
                        className="w-full p-4 rounded-2xl bg-[#FFFCF5] hover:bg-[#FFF0D9] border border-[#E8E2D9] hover:border-[#E99A20] text-left transition-all cursor-pointer shadow-xs flex items-center justify-between group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#29243A] group-hover:text-[#6D28D9]">
                              {m.full_name}
                            </span>
                            <span className="font-mono text-xs font-bold text-[#6D28D9] bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                              {m.normalized_roll_number}
                            </span>
                          </div>
                          <p className="text-xs text-[#6B655D] font-medium">
                            {m.academic_year}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#6D28D9] group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAmbiguousMatches(null)}
                    className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#29243A] text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- 2. ADMIN DASHBOARD PORTAL ----------------- */}
        {activePortal === 'ADMIN' && (
          <div>
            {adminUser ? (
              <AdminDashboard
                adminUser={adminUser}
                event={eventSettings}
                onUpdateEvent={(updated) => setEventSettings(updated)}
                onLogout={() => setAdminUser(null)}
              />
            ) : (
              <AdminLogin onLoginSuccess={(user) => setAdminUser(user)} />
            )}
          </div>
        )}

        {/* ----------------- 3. STAFF QR SCANNER PORTAL ----------------- */}
        {activePortal === 'STAFF' && (
          <div>
            {staffUser ? (
              <StaffScanner
                event={eventSettings}
                staffUser={staffUser}
                onLogout={() => setStaffUser(null)}
              />
            ) : (
              <StaffLogin
                event={eventSettings}
                onLoginSuccess={(user) => setStaffUser(user)}
              />
            )}
          </div>
        )}
      </main>

      {/* Universal Festive Footer */}
      <Footer event={eventSettings} onOpenTerms={() => setIsTermsOpen(true)} />

      {/* Event Rules & Privacy Terms Modal */}
      <TermsModal
        event={eventSettings}
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />
    </div>
  );
}

export default App;
