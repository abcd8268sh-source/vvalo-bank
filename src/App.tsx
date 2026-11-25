import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeftRight, CreditCard, Home, ListOrdered, ShieldCheck } from 'lucide-react';
import type {
  AppTab,
  BankAccount,
  SavedContact,
  TransactionRecord,
  UserProfile,
} from './types/banking';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  adminGrantFunds,
  claimVirtualTopUp,
  ensureUserAccountInitialized,
  toggleAccountFreeze,
  updateAccountHolderName,
} from './lib/bankingService';
import { formatEurFromCents, isAdminEmail } from './lib/validation';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import { TransferView } from './components/TransferView';
import { ActivityView } from './components/ActivityView';
import { CardProfileView } from './components/CardProfileView';
import { AdminView } from './components/AdminView';
import { TransactionReceiptSheet } from './components/TransactionReceiptSheet';
import { FaceIdPromptSheet, type FaceIdChallenge } from './components/FaceIdPromptSheet';

function ValoBankingApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [sentTxs, setSentTxs] = useState<TransactionRecord[]>([]);
  const [receivedTxs, setReceivedTxs] = useState<TransactionRecord[]>([]);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [prefillIban, setPrefillIban] = useState<string | undefined>(undefined);
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [faceIdChallenge, setFaceIdChallenge] = useState<FaceIdChallenge | null>(null);

  useEffect(() => {
    if (!user) {
      setFaceIdEnabled(false);
      return;
    }
    try {
      const stored = window.localStorage.getItem(`valo_faceid_${user.uid}`);
      setFaceIdEnabled(stored === 'true');
    } catch {
      setFaceIdEnabled(false);
    }
  }, [user]);

  const handleToggleFaceId = (nextEnabled: boolean) => {
    setFaceIdEnabled(nextEnabled);
    if (!user) return;
    try {
      window.localStorage.setItem(`valo_faceid_${user.uid}`, String(nextEnabled));
    } catch {
      // Storage unavailable
    }
  };

  // 1. Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setAccountReady(false);
      setInitError(null);

      if (!nextUser) {
        setProfile(null);
        setAccount(null);
        setContacts([]);
        setSentTxs([]);
        setReceivedTxs([]);
        return;
      }

      try {
        await ensureUserAccountInitialized(nextUser);
        setAccountReady(true);
      } catch (err) {
        setInitError(
          err instanceof Error ? err.message : 'Unable to initialize your virtual bank account.'
        );
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore listeners (only active when auth & account initialization succeed)
  useEffect(() => {
    if (!authReady || !accountReady || !user) return;

    const uid = user.uid;

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${uid}`);
      }
    );

    const unsubAccount = onSnapshot(
      doc(db, 'accounts', uid),
      (snap) => {
        if (snap.exists()) {
          setAccount(snap.data() as BankAccount);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `accounts/${uid}`);
      }
    );

    const unsubContacts = onSnapshot(
      query(collection(db, 'users', uid, 'contacts'), where('ownerUid', '==', uid)),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as SavedContact);
        items.sort((a, b) => a.name.localeCompare(b.name));
        setContacts(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/contacts`);
      }
    );

    const unsubSent = onSnapshot(
      query(collection(db, 'transactions'), where('senderUid', '==', uid)),
      (snap) => {
        setSentTxs(snap.docs.map((d) => d.data() as TransactionRecord));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      }
    );

    const unsubReceived = onSnapshot(
      query(collection(db, 'transactions'), where('recipientUid', '==', uid)),
      (snap) => {
        setReceivedTxs(snap.docs.map((d) => d.data() as TransactionRecord));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      }
    );

    return () => {
      unsubProfile();
      unsubAccount();
      unsubContacts();
      unsubSent();
      unsubReceived();
    };
  }, [authReady, accountReady, user]);

  // Merge and sort sent + received transactions in real time
  const transactions = useMemo(() => {
    const map = new Map<string, TransactionRecord>();
    for (const tx of sentTxs) {
      map.set(tx.txId, tx);
    }
    for (const tx of receivedTxs) {
      map.set(tx.txId, tx);
    }
    return Array.from(map.values()).sort((a, b) => {
      const timeA = a.createdAt ? a.createdAt.toMillis() : Date.now();
      const timeB = b.createdAt ? b.createdAt.toMillis() : Date.now();
      return timeB - timeA;
    });
  }, [sentTxs, receivedTxs]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="font-display text-lg font-bold text-[#0B1F1A]">Valo Bank</p>
          <p className="text-xs text-slate-500">Verifying secure session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (initError) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
          <h1 className="text-lg font-semibold text-[#0B1F1A]">Account Setup Issue</h1>
          <p className="text-sm text-slate-600">{initError}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#0B1F1A] text-white text-sm font-medium cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="min-h-[48px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-[#0B1F1A] cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!accountReady || !profile || !account) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="font-display text-lg font-bold text-[#0B1F1A]">Valo Bank</p>
          <p className="text-xs text-slate-500">Loading your virtual IBAN &amp; live ledger...</p>
        </div>
      </div>
    );
  }

  const isAdmin = isAdminEmail(profile.email);

  const navItems: { id: AppTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'send', label: 'Send', icon: ArrowLeftRight },
    { id: 'activity', label: 'Activity', icon: ListOrdered },
    { id: 'card', label: 'Card', icon: CreditCard },
    ...(isAdmin ? [{ id: 'admin' as AppTab, label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const pageTitles: Record<AppTab, string> = {
    home: 'Overview',
    send: 'Send via IBAN',
    activity: 'Activity',
    card: 'Card & IBAN',
    admin: 'Admin Treasury',
  };

  const handleGoToSend = (iban?: string) => {
    setPrefillIban(iban);
    setActiveTab('send');
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0B1F1A]">
      {/* Mobile Scrollable Top Header (not fixed, preserving <15% sticky height cap) */}
      <header className="lg:hidden px-5 pt-5 pb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Valo Bank · Play EUR</p>
          <h1 className="font-display text-xl font-bold tracking-tight text-[#0B1F1A] truncate">
            {pageTitles[activeTab]}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('card')}
          aria-label="Open card and profile"
          className="min-h-[44px] min-w-[44px] rounded-full bg-[#0B1F1A] text-white text-xs font-semibold flex items-center justify-center shrink-0 cursor-pointer"
        >
          {profile.displayName
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </button>
      </header>

      {/* Responsive Workspace Shell: Edge-to-edge on mobile, 2-column workspace on desktop */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 lg:py-8 pb-24 lg:pb-12 lg:grid lg:grid-cols-12 lg:gap-8">
        {/* Desktop Navigation Rail */}
        <aside className="hidden lg:flex lg:col-span-4 xl:col-span-3 flex-col gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-6 sticky top-8">
            <div className="space-y-1">
              <p className="font-display text-lg font-bold tracking-tight text-[#0B1F1A]">
                Valo Bank
              </p>
              <p className="text-xs text-slate-500">
                Virtual Play EUR · Not real money
              </p>
            </div>

            <nav aria-label="Primary navigation" className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'send') setPrefillIban(undefined);
                      setActiveTab(item.id);
                    }}
                    className={`w-full min-h-[48px] px-4 rounded-2xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#0B1F1A] text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B1F1A]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-100 space-y-1">
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Admin Balance' : 'Balance'}
              </p>
              <p className="font-display text-xl font-bold text-[#0B1F1A] tabular-nums">
                {isAdmin ? '∞ Unlimited' : formatEurFromCents(account.balanceCents)}
              </p>
              <p className="text-xs text-slate-500 truncate">{profile.displayName}</p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-8 xl:col-span-9 max-w-2xl lg:max-w-none mx-auto w-full">
          <div className="hidden lg:flex items-center justify-between mb-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F1A]">
              {pageTitles[activeTab]}
            </h1>
            <p className="text-xs text-slate-500">
              Real-time IBAN ledger · Virtual simulation
            </p>
          </div>

          {activeTab === 'home' && (
            <HomeView
              profile={profile}
              account={account}
              transactions={transactions}
              contacts={contacts}
              onGoToSend={(iban) => handleGoToSend(iban)}
              onGoToActivity={() => setActiveTab('activity')}
              onSelectTransaction={setSelectedTx}
              onClaimTopUp={async () => {
                if (isAdmin) {
                  await adminGrantFunds({
                    recipientUid: profile.uid,
                    recipientIban: account.iban,
                    recipientName: profile.displayName,
                    amountCents: 50_000,
                    note: 'Admin quick top-up',
                  });
                } else {
                  await claimVirtualTopUp(profile, account);
                }
              }}
            />
          )}

          {activeTab === 'send' && (
            <TransferView
              profile={profile}
              account={account}
              contacts={contacts}
              prefillIban={prefillIban}
              faceIdEnabled={faceIdEnabled}
              onRequireFaceId={setFaceIdChallenge}
              onTransferComplete={() => {
                setPrefillIban(undefined);
                setActiveTab('home');
              }}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityView
              currentUid={profile.uid}
              transactions={transactions}
              onSelectTransaction={setSelectedTx}
            />
          )}

          {activeTab === 'card' && (
            <CardProfileView
              profile={profile}
              account={account}
              faceIdEnabled={faceIdEnabled}
              onToggleFaceId={handleToggleFaceId}
              onRequireFaceId={setFaceIdChallenge}
              onToggleFreeze={(nextStatus) => toggleAccountFreeze(profile.uid, nextStatus)}
              onUpdateName={(nextName) =>
                updateAccountHolderName(profile.uid, account.iban, nextName)
              }
              onSignOut={() => signOut(auth)}
            />
          )}

          {activeTab === 'admin' && isAdmin && (
            <AdminView
              currentProfile={profile}
              faceIdEnabled={faceIdEnabled}
              onRequireFaceId={setFaceIdChallenge}
              onGoToSend={(iban) => handleGoToSend(iban)}
              onSelectTransaction={setSelectedTx}
            />
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Tab Bar (56px height = <9% mobile viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className={`grid h-14 items-center ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'send') setPrefillIban(undefined);
                  setActiveTab(item.id);
                }}
                className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-[#059669]' : 'text-slate-500 hover:text-[#0B1F1A]'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transaction Receipt Bottom Sheet */}
      <TransactionReceiptSheet
        transaction={selectedTx}
        currentUid={profile.uid}
        onClose={() => setSelectedTx(null)}
        onSendAgain={(iban) => handleGoToSend(iban)}
      />

      {/* Simulated Biometric FaceID Verification Sheet */}
      <FaceIdPromptSheet
        challenge={faceIdChallenge}
        onClose={() => setFaceIdChallenge(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ValoBankingApp />
    </ErrorBoundary>
  );
}
