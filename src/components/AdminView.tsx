import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import type { BankAccount, TransactionRecord, UserProfile } from '../types/banking';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { adminGrantFunds, toggleAccountFreeze } from '../lib/bankingService';
import {
  formatEurFromCents,
  formatIban,
  isAdminEmail,
  parseEuroAmountToCents,
  VALIDATION_RULES,
} from '../lib/validation';

import type { FaceIdChallenge } from './FaceIdPromptSheet';

interface AdminViewProps {
  currentProfile: UserProfile;
  faceIdEnabled: boolean;
  onRequireFaceId: (challenge: FaceIdChallenge) => void;
  onGoToSend: (iban: string) => void;
  onSelectTransaction: (tx: TransactionRecord) => void;
}

const ADMIN_PRESETS = [1000, 10000, 100000, 1000000];

export function AdminView({
  currentProfile,
  faceIdEnabled,
  onRequireFaceId,
  onGoToSend,
  onSelectTransaction,
}: AdminViewProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionRecord[]>([]);

  const [selectedUid, setSelectedUid] = useState<string>(currentProfile.uid);
  const [mintAmount, setMintAmount] = useState('10000');
  const [mintNote, setMintNote] = useState('Admin treasury mint');
  const [minting, setMinting] = useState(false);
  const [mintMessage, setMintMessage] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserProfile));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );

    const unsubAccounts = onSnapshot(
      collection(db, 'accounts'),
      (snap) => {
        setAccounts(snap.docs.map((d) => d.data() as BankAccount));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'accounts');
      }
    );

    const unsubTxs = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as TransactionRecord);
        list.sort((a, b) => {
          const tA = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const tB = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return tB - tA;
        });
        setAllTransactions(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      }
    );

    return () => {
      unsubUsers();
      unsubAccounts();
      unsubTxs();
    };
  }, []);

  const memberRows = useMemo(() => {
    const accountMap = new Map<string, BankAccount>();
    for (const acc of accounts) {
      accountMap.set(acc.ownerUid, acc);
    }
    return users
      .map((u) => ({
        user: u,
        account: accountMap.get(u.uid) || null,
      }))
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  }, [users, accounts]);

  const selectedMember = memberRows.find((m) => m.user.uid === selectedUid) || null;

  const executeMint = async (cents: number) => {
    if (!selectedMember || !selectedMember.account) return;
    setMinting(true);
    try {
      await adminGrantFunds({
        recipientUid: selectedMember.user.uid,
        recipientIban: selectedMember.user.iban,
        recipientName: selectedMember.user.displayName,
        amountCents: cents,
        note: mintNote,
      });
      setMintMessage(
        `Minted ${formatEurFromCents(cents)} to ${selectedMember.user.displayName}.`
      );
    } catch (err) {
      setMintError(err instanceof Error ? err.message : 'Unable to mint funds.');
    } finally {
      setMinting(false);
    }
  };

  const handleMintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMintMessage(null);
    setMintError(null);

    if (!selectedMember || !selectedMember.account) {
      setMintError('Select a valid member account first.');
      return;
    }

    const cents = parseEuroAmountToCents(mintAmount, true);
    if (cents === null) {
      setMintError('Enter an amount between €0.01 and €1,000,000,000.00.');
      return;
    }

    if (faceIdEnabled && cents >= VALIDATION_RULES.LARGE_TRANSFER_THRESHOLD_CENTS) {
      onRequireFaceId({
        title: 'Authorize Treasury Mint',
        description: `Mint ${formatEurFromCents(cents)} to ${selectedMember.user.displayName}`,
        onSuccess: () => executeMint(cents),
      });
      return;
    }

    void executeMint(cents);
  };

  const handleFreezeToggle = async (uid: string, currentStatus: 'active' | 'frozen') => {
    setTogglingUid(uid);
    try {
      await toggleAccountFreeze(uid, currentStatus === 'active' ? 'frozen' : 'active');
    } finally {
      setTogglingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Summary */}
      <section className="bg-[#0B1F1A] text-white rounded-3xl p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrator · Unlimited Treasury</span>
          </div>
          <span className="text-xs text-emerald-100/70 tabular-nums">
            {memberRows.length} members · {allTransactions.length} entries
          </span>
        </div>
        <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Unlimited Virtual Funds
        </p>
        <p className="text-xs text-emerald-100/75 leading-relaxed">
          Signed in as {currentProfile.email}. Outgoing IBAN transfers never deplete your
          account, and you can mint virtual EUR to any member or manage account locks.
        </p>
      </section>

      {/* Treasury Mint / Grant Form */}
      <form
        onSubmit={handleMintSubmit}
        className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Mint Virtual Funds</h2>
          <p className="text-xs text-slate-500">
            Credit any registered account instantly via the system treasury.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="mint-recipient" className="text-xs font-medium text-slate-600">
            Target Account
          </label>
          <select
            id="mint-recipient"
            value={selectedUid}
            onChange={(e) => setSelectedUid(e.target.value)}
            className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none text-sm text-[#0B1F1A]"
          >
            {memberRows.map(({ user, account }) => (
              <option key={user.uid} value={user.uid}>
                {user.displayName} ({user.email}) —{' '}
                {account ? formatEurFromCents(account.balanceCents) : 'Pending'}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="mint-amount" className="text-xs font-medium text-slate-600">
            Amount (EUR)
          </label>
          <input
            id="mint-amount"
            type="text"
            inputMode="decimal"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="10000"
            className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none font-display text-lg font-bold tabular-nums text-[#0B1F1A]"
          />
          <div className="grid grid-cols-4 gap-2">
            {ADMIN_PRESETS.map((eur) => (
              <button
                key={eur}
                type="button"
                onClick={() => setMintAmount(String(eur))}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-[#0B1F1A] tabular-nums cursor-pointer"
              >
                +€{eur >= 1000 ? `${eur / 1000}k` : eur}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="mint-note" className="text-xs font-medium text-slate-600">
            Ledger Note
          </label>
          <input
            id="mint-note"
            type="text"
            maxLength={VALIDATION_RULES.NOTE_MAX}
            value={mintNote}
            onChange={(e) => setMintNote(e.target.value)}
            className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none text-sm text-[#0B1F1A]"
          />
        </div>

        {mintError && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800"
          >
            {mintError}
          </div>
        )}

        {mintMessage && (
          <div
            role="status"
            className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900"
          >
            {mintMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={minting || !selectedMember?.account}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{minting ? 'Minting...' : 'Mint Virtual EUR'}</span>
        </button>
      </form>

      {/* Member Accounts Directory */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">All Member Accounts</h2>
        </div>

        <div className="divide-y divide-slate-100">
          {memberRows.map(({ user, account }) => {
            const isUserAdmin = isAdminEmail(user.email);
            const status = account?.accountStatus || 'active';
            return (
              <div
                key={user.uid}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-[#0B1F1A] truncate">
                    {user.displayName}
                    {isUserAdmin && (
                      <span className="text-xs font-medium text-emerald-700 ml-2">
                        Admin · Unlimited
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <p className="font-mono text-xs text-slate-500 tabular-nums">
                    {formatIban(user.iban)}
                    <span aria-hidden="true" className="mx-1.5">·</span>
                    <span className="text-[#0B1F1A] font-medium">
                      {isUserAdmin
                        ? '∞ Unlimited'
                        : account
                        ? formatEurFromCents(account.balanceCents)
                        : '—'}
                    </span>
                    <span aria-hidden="true" className="mx-1.5">·</span>
                    <span>{status === 'frozen' ? 'Frozen' : 'Active'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.uid !== currentProfile.uid && (
                    <button
                      type="button"
                      onClick={() => onGoToSend(user.iban)}
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1F1A] text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  )}

                  {account && (
                    <button
                      type="button"
                      onClick={() => void handleFreezeToggle(user.uid, status)}
                      disabled={togglingUid === user.uid}
                      className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-[#0B1F1A] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {status === 'frozen' ? (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Unfreeze</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-slate-600" />
                          <span>Freeze</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Global Live Ledger */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Global Live Ledger</h2>
        </div>

        <div className="divide-y divide-slate-100">
          {allTransactions.slice(0, 25).map((tx) => {
            const isTopUp = tx.type === 'topup';
            return (
              <button
                key={tx.txId}
                type="button"
                onClick={() => onSelectTransaction(tx)}
                className="w-full min-h-[60px] px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isTopUp
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-[#0B1F1A]'
                    }`}
                  >
                    {isTopUp ? (
                      <Plus className="w-4 h-4" />
                    ) : tx.senderUid === currentProfile.uid ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownLeft className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0B1F1A] truncate">
                      {tx.senderName} → {tx.recipientName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      <span>{isTopUp ? 'Treasury Mint' : 'IBAN Transfer'}</span>
                      {tx.note && (
                        <>
                          <span aria-hidden="true" className="mx-1.5">·</span>
                          <span>{tx.note}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <span className="text-sm font-semibold tabular-nums text-[#0B1F1A] whitespace-nowrap shrink-0">
                  {formatEurFromCents(tx.amountCents)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
