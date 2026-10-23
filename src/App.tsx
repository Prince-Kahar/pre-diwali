import React, { useState, useEffect } from 'react';
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

  // Authenticated state
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [staffUser, setStaffUser] = useState<UserProfile | null>(null);

  // Terms modal
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Sync event settings
  useEffect(() => {
    setEventSettings(dataService.getEventSettings());
  }, []);

  // Handle Roll Number Lookup from Landing Page
  const handleLookupRollNumber = async (roll: string) => {
    setLookupMessage(null);
    let reg = dataService.getRegistrationByRollNumber(roll);

    // If not found in memory, query live Supabase database
    if (!reg) {
      await dataService.initSupabase();
      reg = dataService.getRegistrationByRollNumber(roll);
    }

    if (!reg) {
      alert(`No registration found for Roll Number "${roll}". Please complete the registration form.`);
      return;
    }

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
