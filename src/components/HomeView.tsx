import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import type {
  BankAccount,
  SavedContact,
  TransactionRecord,
  UserProfile,
} from '../types/banking';
import { formatEurFromCents, formatIban, isAdminEmail } from '../lib/validation';

interface HomeViewProps {
  profile: UserProfile;
  account: BankAccount;
  transactions: TransactionRecord[];
  contacts: SavedContact[];
  onGoToSend: (prefillIban?: string, prefillName?: string) => void;
  onGoToActivity: () => void;
  onSelectTransaction: (tx: TransactionRecord) => void;
  onClaimTopUp: () => Promise<void>;
}

export function HomeView({
  profile,
  account,
  transactions,
  contacts,
  onGoToSend,
  onGoToActivity,
  onSelectTransaction,
  onClaimTopUp,
}: HomeViewProps) {
  const [hideBalance, setHideBalance] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpMessage, setTopUpMessage] = useState<string | null>(null);

  const isAdmin = isAdminEmail(profile.email);
  const isFrozen = account.accountStatus === 'frozen';
  const recentTransactions = transactions.slice(0, 6);

  const handleCopyIban = async () => {
    try {
      await navigator.clipboard.writeText(account.iban);
      setCopiedIban(true);
      setTimeout(() => setCopiedIban(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleTopUp = async () => {
    setTopUpMessage(null);
    setToppingUp(true);
    try {
      await onClaimTopUp();
      setTopUpMessage('Added €500.00 in virtual play funds.');
      setTimeout(() => setTopUpMessage(null), 3000);
    } catch (err) {
      setTopUpMessage(err instanceof Error ? err.message : 'Could not add virtual funds.');
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary Balance & IBAN Card */}
      <section className="bg-[#0B1F1A] text-white rounded-3xl p-6 sm:p-7 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-emerald-100/80">
            <span>Virtual Play EUR</span>
            <span aria-hidden="true" className="mx-1.5">·</span>
            <span>Not real money</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-200">
            {isFrozen ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-amber-200">Frozen</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>Active</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-emerald-100/70">
              {isAdmin ? 'Admin Balance · Unlimited' : 'Available Balance'}
            </p>
            <p className="font-display text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-white truncate">
              {hideBalance
                ? '€••••••'
                : isAdmin
                ? '∞ Unlimited'
                : formatEurFromCents(account.balanceCents)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setHideBalance((prev) => !prev)}
            aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-emerald-100 transition-colors cursor-pointer shrink-0"
          >
            {hideBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
        </div>

        {/* Copyable Personal IBAN Bar */}
        <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-emerald-100/65">Your IBAN · {profile.displayName}</p>
            <p className="font-mono text-sm text-white tracking-wider tabular-nums mt-0.5 break-all">
              {formatIban(account.iban)}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyIban}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white/12 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedIban ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy IBAN</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Primary Action Buttons */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onGoToSend()}
          className="min-h-[52px] px-4 py-3 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap cursor-pointer"
        >
          <Send className="w-4 h-4 shrink-0" />
          <span>Send via IBAN</span>
        </button>

        <button
          type="button"
          onClick={handleTopUp}
          disabled={toppingUp || isFrozen}
          className="min-h-[52px] px-4 py-3 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-[#0B1F1A] text-sm font-medium flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-50 whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{toppingUp ? 'Adding...' : 'Add €500 Play'}</span>
        </button>
      </section>

      {topUpMessage && (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900"
        >
          {topUpMessage}
        </div>
      )}

      {/* Quick Send Contacts */}
      {contacts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0B1F1A]">Quick Contacts</h2>
            <button
              type="button"
              onClick={() => onGoToSend()}
              className="min-h-[44px] px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap cursor-pointer"
            >
              New transfer
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {contacts.map((contact) => {
              const initials = contact.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <button
                  key={contact.iban}
                  type="button"
                  onClick={() => onGoToSend(contact.iban, contact.name)}
                  className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-600/40 flex items-center gap-2.5 transition-colors shrink-0 cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-medium text-[#0B1F1A] whitespace-nowrap">
                      {contact.name}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                      ···{contact.iban.slice(-4)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Real-Time Recent Transactions */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Recent Activity</h2>
          <button
            type="button"
            onClick={onGoToActivity}
            className="min-h-[44px] -my-2 px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <span>See all</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="px-5 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#0B1F1A]">No transactions yet</p>
            <p className="text-xs text-slate-500">
              Send virtual funds using another user&apos;s IBAN or add play funds above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentTransactions.map((tx) => {
              const isTopUp = tx.type === 'topup';
              const isIncoming = tx.recipientUid === profile.uid;
              const title = isTopUp
                ? tx.senderName
                : isIncoming
                ? tx.senderName
                : tx.recipientName;
              const timestamp = tx.createdAt
                ? tx.createdAt.toDate().toLocaleString('en-IE', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now';

              return (
                <button
                  key={tx.txId}
                  type="button"
                  onClick={() => onSelectTransaction(tx)}
                  className="w-full min-h-[64px] px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        isIncoming
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-[#0B1F1A]'
                      }`}
                    >
                      {isTopUp ? (
                        <Plus className="w-4 h-4" />
                      ) : isIncoming ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0B1F1A] truncate">
                        {title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        <span>{isTopUp ? 'Top-up' : isIncoming ? 'Received' : 'Sent'}</span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span>{timestamp}</span>
                        {tx.note && (
                          <>
                            <span aria-hidden="true" className="mx-1.5">·</span>
                            <span>{tx.note}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-sm font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                      isIncoming ? 'text-emerald-700' : 'text-[#0B1F1A]'
                    }`}
                  >
                    {formatEurFromCents(tx.amountCents, {
                      showSign: true,
                      isCredit: isIncoming,
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
