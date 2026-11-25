import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Search } from 'lucide-react';
import type { TransactionRecord } from '../types/banking';
import { formatEurFromCents } from '../lib/validation';

interface ActivityViewProps {
  currentUid: string;
  transactions: TransactionRecord[];
  onSelectTransaction: (tx: TransactionRecord) => void;
}

type ActivityFilter = 'all' | 'sent' | 'received' | 'topup';

export function ActivityView({
  currentUid,
  transactions,
  onSelectTransaction,
}: ActivityViewProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const totals = useMemo(() => {
    let incomingCents = 0;
    let outgoingCents = 0;
    for (const tx of transactions) {
      if (tx.recipientUid === currentUid) {
        incomingCents += tx.amountCents;
      } else if (tx.senderUid === currentUid) {
        outgoingCents += tx.amountCents;
      }
    }
    return { incomingCents, outgoingCents };
  }, [transactions, currentUid]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filter === 'sent' && (tx.senderUid !== currentUid || tx.type !== 'transfer')) {
        return false;
      }
      if (filter === 'received' && (tx.recipientUid !== currentUid || tx.type !== 'transfer')) {
        return false;
      }
      if (filter === 'topup' && tx.type !== 'topup') {
        return false;
      }

      if (!q) return true;
      const haystack = [
        tx.senderName,
        tx.recipientName,
        tx.senderIban,
        tx.recipientIban,
        tx.note,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [transactions, filter, searchQuery, currentUid]);

  const filterTabs: { id: ActivityFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'sent', label: 'Sent' },
    { id: 'received', label: 'Received' },
    { id: 'topup', label: 'Top-ups' },
  ];

  return (
    <div className="space-y-5">
      {/* Live Inflow / Outflow Totals */}
      <section className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Total Received</p>
          <p className="font-display text-xl font-bold text-emerald-700 tabular-nums">
            +{formatEurFromCents(totals.incomingCents)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Total Sent</p>
          <p className="font-display text-xl font-bold text-[#0B1F1A] tabular-nums">
            -{formatEurFromCents(totals.outgoingCents)}
          </p>
        </div>
      </section>

      {/* Search & Segmented Filter Controls */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, IBAN, or note"
            aria-label="Search transactions"
            className="w-full min-h-[48px] pl-10 pr-4 rounded-2xl border border-slate-200 bg-white focus:border-[#059669] focus:outline-none text-sm text-[#0B1F1A] placeholder:text-slate-400"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter transactions"
          className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-xl"
        >
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-[#0B1F1A] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1F1A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Real-Time Ledger List */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-1.5">
            <p className="text-sm font-medium text-[#0B1F1A]">No matching transactions</p>
            <p className="text-xs text-slate-500">
              Try clearing your search or switching transaction filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map((tx) => {
              const isTopUp = tx.type === 'topup';
              const isIncoming = tx.recipientUid === currentUid;
              const title = isTopUp
                ? tx.senderName
                : isIncoming
                ? tx.senderName
                : tx.recipientName;
              const counterpartyIban = isIncoming ? tx.senderIban : tx.recipientIban;
              const formattedTime = tx.createdAt
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
                  className="w-full min-h-[68px] px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
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

                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-[#0B1F1A] truncate">
                        {title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        <span>{formattedTime}</span>
                        {!isTopUp && (
                          <>
                            <span aria-hidden="true" className="mx-1.5">·</span>
                            <span className="font-mono tabular-nums">
                              ···{counterpartyIban.slice(-4)}
                            </span>
                          </>
                        )}
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
