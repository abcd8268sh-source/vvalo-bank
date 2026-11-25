import { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  BookmarkCheck,
  CheckCircle2,
  Lock,
  ScanFace,
  Search,
  Send,
  UserCheck,
} from 'lucide-react';
import type {
  BankAccount,
  IbanDirectoryEntry,
  SavedContact,
  UserProfile,
} from '../types/banking';
import {
  lookupIbanRecipient,
  removeBeneficiaryContact,
  saveBeneficiaryContact,
  sendIbanTransfer,
} from '../lib/bankingService';
import {
  formatEurFromCents,
  formatIban,
  isAdminEmail,
  isValidIban,
  normalizeIban,
  parseEuroAmountToCents,
  VALIDATION_RULES,
} from '../lib/validation';
import { BottomSheet } from './BottomSheet';
import type { FaceIdChallenge } from './FaceIdPromptSheet';

interface TransferViewProps {
  profile: UserProfile;
  account: BankAccount;
  contacts: SavedContact[];
  prefillIban?: string;
  faceIdEnabled: boolean;
  onRequireFaceId: (challenge: FaceIdChallenge) => void;
  onTransferComplete: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100];

export function TransferView({
  profile,
  account,
  contacts,
  prefillIban,
  faceIdEnabled,
  onRequireFaceId,
  onTransferComplete,
}: TransferViewProps) {
  const [ibanInput, setIbanInput] = useState(prefillIban ? formatIban(prefillIban) : '');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [verifiedRecipient, setVerifiedRecipient] = useState<IbanDirectoryEntry | null>(null);

  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedTxId, setCompletedTxId] = useState<string | null>(null);
  const [sentSnapshot, setSentSnapshot] = useState<{
    recipientName: string;
    recipientIban: string;
    amountCents: number;
  } | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const isAdmin = isAdminEmail(profile.email);
  const cleanIban = normalizeIban(ibanInput);
  const isFrozen = account.accountStatus === 'frozen';
  const parsedAmountCents = parseEuroAmountToCents(amountInput, isAdmin);
  const isRecipientSaved = Boolean(
    verifiedRecipient && contacts.some((c) => c.iban === verifiedRecipient.iban)
  );

  const verifyIban = async (rawValue: string) => {
    const clean = normalizeIban(rawValue);
    setLookupError(null);

    if (!clean) {
      setVerifiedRecipient(null);
      return;
    }
    if (!isValidIban(clean)) {
      setVerifiedRecipient(null);
      setLookupError('Enter a valid 18-character Valo IBAN (starts with VA followed by 16 digits).');
      return;
    }
    if (clean === account.iban) {
      setVerifiedRecipient(null);
      setLookupError('This is your own IBAN. Enter another member’s IBAN to send funds.');
      return;
    }

    setLookupLoading(true);
    try {
      const entry = await lookupIbanRecipient(clean);
      if (!entry) {
        setVerifiedRecipient(null);
        setLookupError('No registered Valo Bank user matches this IBAN.');
      } else {
        setVerifiedRecipient(entry);
      }
    } catch (err) {
      setVerifiedRecipient(null);
      setLookupError(err instanceof Error ? err.message : 'Unable to verify IBAN right now.');
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    if (prefillIban) {
      const formatted = formatIban(prefillIban);
      setIbanInput(formatted);
      void verifyIban(prefillIban);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillIban]);

  const handleIbanChange = (value: string) => {
    const cleaned = normalizeIban(value).slice(0, VALIDATION_RULES.IBAN_LENGTH);
    setIbanInput(formatIban(cleaned));
    setLookupError(null);
    if (verifiedRecipient && verifiedRecipient.iban !== cleaned) {
      setVerifiedRecipient(null);
    }
    if (cleaned.length === VALIDATION_RULES.IBAN_LENGTH) {
      void verifyIban(cleaned);
    }
  };

  const handleSelectContact = (contact: SavedContact) => {
    setIbanInput(formatIban(contact.iban));
    void verifyIban(contact.iban);
  };

  const handleToggleContact = async () => {
    if (!verifiedRecipient) return;
    setSavingContact(true);
    try {
      if (isRecipientSaved) {
        await removeBeneficiaryContact(profile.uid, verifiedRecipient.iban);
      } else {
        await saveBeneficiaryContact(profile.uid, verifiedRecipient);
      }
    } finally {
      setSavingContact(false);
    }
  };

  const handleReviewClick = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitError(null);
    setCompletedTxId(null);

    if (isFrozen) {
      setFormError('Your account is frozen. Unfreeze it in the Card tab before sending.');
      return;
    }
    if (!verifiedRecipient) {
      setFormError('Please enter and verify a valid recipient IBAN first.');
      return;
    }
    if (parsedAmountCents === null) {
      setFormError(
        isAdmin
          ? 'Enter an amount between €0.01 and €1,000,000,000.00.'
          : 'Enter an amount between €0.01 and €100,000.00.'
      );
      return;
    }
    if (!isAdmin && parsedAmountCents > account.balanceCents) {
      setFormError('Amount exceeds your available virtual balance.');
      return;
    }

    setConfirmOpen(true);
  };

  const executeTransfer = async () => {
    if (!verifiedRecipient || parsedAmountCents === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const txId = await sendIbanTransfer({
        senderProfile: profile,
        senderAccount: account,
        recipient: verifiedRecipient,
        amountCents: parsedAmountCents,
        note: noteInput,
      });
      setSentSnapshot({
        recipientName: verifiedRecipient.accountHolderName,
        recipientIban: verifiedRecipient.iban,
        amountCents: parsedAmountCents,
      });
      setCompletedTxId(txId);
      setAmountInput('');
      setNoteInput('');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Transfer could not be completed. The recipient account may be frozen.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requiresFaceId =
    faceIdEnabled &&
    parsedAmountCents !== null &&
    parsedAmountCents >= VALIDATION_RULES.LARGE_TRANSFER_THRESHOLD_CENTS;

  const handleConfirmSend = () => {
    if (!verifiedRecipient || parsedAmountCents === null) return;
    if (requiresFaceId) {
      setConfirmOpen(false);
      onRequireFaceId({
        title: 'Authorize Large Transfer',
        description: `Send ${formatEurFromCents(parsedAmountCents)} to ${verifiedRecipient.accountHolderName}`,
        onSuccess: async () => {
          setConfirmOpen(true);
          await executeTransfer();
        },
      });
      return;
    }
    void executeTransfer();
  };

  const closeSheetAndReset = () => {
    const didComplete = Boolean(completedTxId);
    setConfirmOpen(false);
    setCompletedTxId(null);
    setSentSnapshot(null);
    setSubmitError(null);
    if (didComplete) {
      onTransferComplete();
    }
  };

  return (
    <div className="space-y-5">
      {isFrozen && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5 flex items-start gap-3 text-sm text-amber-900">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Account frozen. Outgoing transfers are paused until you unfreeze your card.
          </span>
        </div>
      )}

      {/* Saved Recipients */}
      {contacts.length > 0 && (
        <section className="space-y-2.5">
          <p className="text-xs font-medium text-slate-600">Saved Beneficiaries</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {contacts.map((contact) => {
              const selected = cleanIban === contact.iban;
              return (
                <button
                  key={contact.iban}
                  type="button"
                  onClick={() => handleSelectContact(contact)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left transition-colors shrink-0 cursor-pointer ${
                    selected
                      ? 'bg-[#0B1F1A] border-[#0B1F1A] text-white'
                      : 'bg-white border-slate-200 text-[#0B1F1A] hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-medium whitespace-nowrap">{contact.name}</p>
                  <p
                    className={`font-mono text-[11px] tabular-nums ${
                      selected ? 'text-emerald-200' : 'text-slate-500'
                    }`}
                  >
                    ···{contact.iban.slice(-4)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Transfer Form */}
      <form
        onSubmit={handleReviewClick}
        className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-5"
      >
        {/* IBAN Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="iban-input" className="text-sm font-medium text-[#0B1F1A]">
              Recipient IBAN
            </label>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {cleanIban.length}/{VALIDATION_RULES.IBAN_LENGTH}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              id="iban-input"
              type="text"
              value={ibanInput}
              onChange={(e) => handleIbanChange(e.target.value)}
              placeholder="VA42 0000 0000 0000 00"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none font-mono text-sm uppercase tracking-wider text-[#0B1F1A] placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void verifyIban(ibanInput)}
              disabled={lookupLoading || cleanIban.length === 0}
              className="min-h-[48px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-[#0B1F1A] flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>{lookupLoading ? 'Checking' : 'Verify'}</span>
            </button>
          </div>

          {lookupError && (
            <p className="text-xs text-rose-700 pt-1">{lookupError}</p>
          )}

          {verifiedRecipient && (
            <div className="mt-2 rounded-2xl bg-emerald-50/80 border border-emerald-200 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-emerald-800">Verified Recipient</p>
                  <p className="text-sm font-semibold text-[#0B1F1A] truncate">
                    {verifiedRecipient.accountHolderName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleContact}
                disabled={savingContact}
                className="min-h-[44px] px-3 rounded-xl bg-white border border-emerald-200 text-xs font-medium text-emerald-800 hover:bg-emerald-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isRecipientSaved ? (
                  <>
                    <BookmarkCheck className="w-4 h-4" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="amount-input" className="text-sm font-medium text-[#0B1F1A]">
              Amount (Virtual EUR)
            </label>
            <span className="text-xs text-slate-500 tabular-nums">
              {isAdmin
                ? 'Available: Unlimited (Admin)'
                : `Available: ${formatEurFromCents(account.balanceCents)}`}
            </span>
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-xl font-semibold text-slate-400">
              €
            </span>
            <input
              id="amount-input"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setFormError(null);
              }}
              placeholder="0.00"
              className="w-full min-h-[56px] pl-10 pr-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none font-display text-2xl font-bold tabular-nums text-[#0B1F1A] placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((euro) => (
              <button
                key={euro}
                type="button"
                onClick={() => {
                  setAmountInput(String(euro));
                  setFormError(null);
                }}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-[#0B1F1A] tabular-nums cursor-pointer"
              >
                €{euro}
              </button>
            ))}
          </div>
        </div>

        {/* Reference Note */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="note-input" className="text-sm font-medium text-[#0B1F1A]">
              Reference Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <span className="text-xs text-slate-400 tabular-nums">
              {noteInput.length}/{VALIDATION_RULES.NOTE_MAX}
            </span>
          </div>
          <input
            id="note-input"
            type="text"
            maxLength={VALIDATION_RULES.NOTE_MAX}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Dinner split, rent, gift..."
            className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none text-sm text-[#0B1F1A] placeholder:text-slate-400"
          />
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800"
          >
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={isFrozen || !verifiedRecipient || parsedAmountCents === null}
          className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-[#0B1F1A] hover:bg-[#13322A] text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-45 whitespace-nowrap cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>Review Transfer</span>
        </button>
      </form>

      {/* Review & Confirm Bottom Sheet */}
      <BottomSheet
        open={confirmOpen}
        onClose={closeSheetAndReset}
        title={completedTxId ? 'Transfer Completed' : 'Confirm IBAN Transfer'}
      >
        {completedTxId && sentSnapshot ? (
          <div className="space-y-6 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500">Sent to {sentSnapshot.recipientName}</p>
              <p className="font-display text-3xl font-bold text-[#0B1F1A] tabular-nums">
                {formatEurFromCents(sentSnapshot.amountCents)}
              </p>
              <p className="font-mono text-xs text-slate-500 tabular-nums">
                {formatIban(sentSnapshot.recipientIban)}
              </p>
            </div>

            <button
              type="button"
              onClick={closeSheetAndReset}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#0B1F1A] text-white text-sm font-medium hover:bg-[#13322A] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : verifiedRecipient && parsedAmountCents !== null ? (
          <div className="space-y-5">
            <div className="text-center py-2 space-y-1">
              <p className="text-xs text-slate-500">Sending Virtual Play EUR</p>
              <p className="font-display text-3xl font-bold text-[#0B1F1A] tabular-nums">
                {formatEurFromCents(parsedAmountCents)}
              </p>
            </div>

            <div className="divide-y divide-slate-100 border-t border-b border-slate-100 text-sm">
              <div className="py-3 flex items-center justify-between gap-4">
                <span className="text-slate-500">Recipient</span>
                <span className="font-medium text-[#0B1F1A] text-right">
                  {verifiedRecipient.accountHolderName}
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <span className="text-slate-500">IBAN</span>
                <span className="font-mono text-xs text-[#0B1F1A] tabular-nums text-right">
                  {formatIban(verifiedRecipient.iban)}
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <span className="text-slate-500">Transfer Fee</span>
                <span className="text-emerald-700 font-medium tabular-nums">€0.00</span>
              </div>
              {noteInput.trim() && (
                <div className="py-3 flex items-start justify-between gap-4">
                  <span className="text-slate-500 shrink-0">Reference</span>
                  <span className="text-[#0B1F1A] text-right break-words">
                    {noteInput.trim()}
                  </span>
                </div>
              )}
            </div>

            {requiresFaceId && (
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-emerald-900">
                <ScanFace className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>FaceID unlock required for transfers of €100.00 or more.</span>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800"
              >
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeSheetAndReset}
                disabled={submitting}
                className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#0B1F1A] hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={submitting}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {requiresFaceId && <ScanFace className="w-4 h-4 shrink-0" />}
                <span>{submitting ? 'Sending...' : requiresFaceId ? 'FaceID & Send' : 'Send Now'}</span>
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
