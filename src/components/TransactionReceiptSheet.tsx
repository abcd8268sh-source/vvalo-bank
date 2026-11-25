import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Plus, Send } from 'lucide-react';
import type { TransactionRecord } from '../types/banking';
import { formatEurFromCents, formatIban } from '../lib/validation';
import { BottomSheet } from './BottomSheet';

interface TransactionReceiptSheetProps {
  transaction: TransactionRecord | null;
  currentUid: string;
  onClose: () => void;
  onSendAgain: (iban: string, name: string) => void;
}

export function TransactionReceiptSheet({
  transaction,
  currentUid,
  onClose,
  onSendAgain,
}: TransactionReceiptSheetProps) {
  const [copiedId, setCopiedId] = useState(false);

  if (!transaction) {
    return <BottomSheet open={false} onClose={onClose} title="Receipt">{null}</BottomSheet>;
  }

  const isTopUp = transaction.type === 'topup';
  const isIncoming = transaction.recipientUid === currentUid;
  const counterpartyName = isIncoming ? transaction.senderName : transaction.recipientName;
  const counterpartyIban = isIncoming ? transaction.senderIban : transaction.recipientIban;

  const formattedTime = transaction.createdAt
    ? transaction.createdAt.toDate().toLocaleString('en-IE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Just now';

  const handleCopyTxId = async () => {
    try {
      await navigator.clipboard.writeText(transaction.txId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <BottomSheet open={Boolean(transaction)} onClose={onClose} title="Transaction Receipt">
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center space-y-2 py-2">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              isIncoming
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-[#0B1F1A]'
            }`}
          >
            {isTopUp ? (
              <Plus className="w-5 h-5" />
            ) : isIncoming ? (
              <ArrowDownLeft className="w-5 h-5" />
            ) : (
              <ArrowUpRight className="w-5 h-5" />
            )}
          </div>
          <p className="text-xs text-slate-500">
            {isTopUp
              ? 'Virtual Play Top-Up'
              : isIncoming
              ? `Received from ${transaction.senderName}`
              : `Sent to ${transaction.recipientName}`}
          </p>
          <p
            className={`text-3xl font-bold tabular-nums tracking-tight ${
              isIncoming ? 'text-emerald-700' : 'text-[#0B1F1A]'
            }`}
          >
            {formatEurFromCents(transaction.amountCents, {
              showSign: true,
              isCredit: isIncoming,
            })}
          </p>
          <p className="text-xs text-slate-500">
            Completed · {formattedTime}
          </p>
        </div>

        <div className="divide-y divide-slate-100 border-t border-b border-slate-100 text-sm">
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">From</span>
            <div className="text-right">
              <p className="font-medium text-[#0B1F1A]">{transaction.senderName}</p>
              <p className="font-mono text-xs text-slate-500 tabular-nums">
                {formatIban(transaction.senderIban)}
              </p>
            </div>
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">To</span>
            <div className="text-right">
              <p className="font-medium text-[#0B1F1A]">{transaction.recipientName}</p>
              <p className="font-mono text-xs text-slate-500 tabular-nums">
                {formatIban(transaction.recipientIban)}
              </p>
            </div>
          </div>

          {transaction.note && (
            <div className="py-3 flex items-start justify-between gap-4">
              <span className="text-slate-500 shrink-0">Reference</span>
              <span className="text-right text-[#0B1F1A] break-words">
                {transaction.note}
              </span>
            </div>
          )}

          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">Currency</span>
            <span className="text-[#0B1F1A]">Virtual Play EUR</span>
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">Reference ID</span>
            <button
              type="button"
              onClick={handleCopyTxId}
              className="min-h-[44px] -my-2 px-2 flex items-center gap-1.5 font-mono text-xs text-slate-600 hover:text-[#0B1F1A] cursor-pointer"
            >
              <span className="max-w-[160px] truncate">{transaction.txId}</span>
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {!isTopUp && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onSendAgain(counterpartyIban, counterpartyName);
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#0B1F1A] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#13322A] transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Send Money to {counterpartyName}</span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
