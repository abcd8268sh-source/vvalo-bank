import { useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Lock,
  LogOut,
  ScanFace,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import type { BankAccount, UserProfile } from '../types/banking';
import { formatIban, isAdminEmail, VALIDATION_RULES } from '../lib/validation';
import type { FaceIdChallenge } from './FaceIdPromptSheet';

interface CardProfileViewProps {
  profile: UserProfile;
  account: BankAccount;
  faceIdEnabled: boolean;
  onToggleFaceId: (nextEnabled: boolean) => void;
  onRequireFaceId: (challenge: FaceIdChallenge) => void;
  onToggleFreeze: (nextStatus: 'active' | 'frozen') => Promise<void>;
  onUpdateName: (nextName: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function CardProfileView({
  profile,
  account,
  faceIdEnabled,
  onToggleFaceId,
  onRequireFaceId,
  onToggleFreeze,
  onUpdateName,
  onSignOut,
}: CardProfileViewProps) {
  const [copiedIban, setCopiedIban] = useState(false);
  const [togglingFreeze, setTogglingFreeze] = useState(false);
  const [nameInput, setNameInput] = useState(profile.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const isAdmin = isAdminEmail(profile.email);
  const isFrozen = account.accountStatus === 'frozen';
  const lastFour = account.iban.slice(-4);

  const handleCopyIban = async () => {
    try {
      await navigator.clipboard.writeText(account.iban);
      setCopiedIban(true);
      setTimeout(() => setCopiedIban(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const executeFreezeToggle = async (nextStatus: 'active' | 'frozen') => {
    setTogglingFreeze(true);
    try {
      await onToggleFreeze(nextStatus);
    } finally {
      setTogglingFreeze(false);
    }
  };

  const handleFreezeToggle = () => {
    if (isFrozen && faceIdEnabled) {
      onRequireFaceId({
        title: 'Authorize Account Unfreeze',
        description: 'Confirm your FaceID identity before reactivating card & IBAN transfers.',
        onSuccess: () => executeFreezeToggle('active'),
      });
      return;
    }
    void executeFreezeToggle(isFrozen ? 'active' : 'frozen');
  };

  const handleFaceIdSwitch = () => {
    if (faceIdEnabled) {
      onRequireFaceId({
        title: 'Disable FaceID Protection',
        description: 'Verify FaceID to turn off biometric confirmation for large transfers.',
        onSuccess: () => onToggleFaceId(false),
      });
    } else {
      onToggleFaceId(true);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    setNameMessage(null);
    try {
      await onUpdateName(trimmed);
      setNameMessage('Account holder name updated across your IBAN directory.');
      setTimeout(() => setNameMessage(null), 3000);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Virtual Card Preview */}
      <section
        className={`rounded-3xl p-6 sm:p-7 text-white transition-colors ${
          isFrozen ? 'bg-slate-800' : 'bg-[#0B1F1A]'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-300" />
            <span className="font-display text-sm font-semibold">Valo Virtual</span>
          </div>
          <span className="text-xs font-medium flex items-center gap-1.5">
            {isFrozen ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-amber-200">Frozen</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-emerald-200">Active</span>
              </>
            )}
          </span>
        </div>

        <div className="my-8 space-y-1">
          <p className="text-xs text-white/60">Virtual Card Number</p>
          <p className="font-mono text-lg sm:text-xl tracking-widest tabular-nums">
            4242 ···· ···· {lastFour}
          </p>
        </div>

        <div className="flex items-end justify-between gap-4 pt-2 border-t border-white/10">
          <div className="min-w-0">
            <p className="text-[11px] text-white/60">Account Holder</p>
            <p className="text-sm font-medium truncate">{profile.displayName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-white/60">{isAdmin ? 'Privilege' : 'Currency'}</p>
            <p className="text-sm font-medium">{isAdmin ? 'Admin · Unlimited' : 'Play EUR'}</p>
          </div>
        </div>
      </section>

      {/* Security & FaceID Controls */}
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Security</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Manage biometric FaceID confirmation and instant card freeze protection.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-3 border-t border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <ScanFace className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-[#0B1F1A]">FaceID Biometric Lock</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Require FaceID unlock for transfers of €100.00+ and unfreezing your account.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={faceIdEnabled}
            aria-label="Toggle FaceID Biometric Lock"
            onClick={handleFaceIdSwitch}
            className={`relative inline-flex min-h-[44px] items-center shrink-0 cursor-pointer px-1`}
          >
            <span
              className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                faceIdEnabled ? 'bg-[#059669]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full bg-white shadow-xs transition-transform ${
                  faceIdEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleFreezeToggle}
          disabled={togglingFreeze}
          className={`w-full min-h-[48px] px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            isFrozen
              ? 'bg-[#059669] hover:bg-[#047857] text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-[#0B1F1A]'
          }`}
        >
          {isFrozen ? (
            <>
              <Unlock className="w-4 h-4" />
              <span>{togglingFreeze ? 'Updating...' : 'Unfreeze Account'}</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>{togglingFreeze ? 'Updating...' : 'Freeze Account'}</span>
            </>
          )}
        </button>
      </section>

      {/* Share IBAN */}
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Receive Virtual Funds</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Share this IBAN with another Valo Bank user so they can verify your name and send you play funds.
          </p>
        </div>

        <div className="rounded-2xl bg-[#F6F7F9] border border-slate-200 px-4 py-3.5 flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-[#0B1F1A] tabular-nums break-all">
            {formatIban(account.iban)}
          </span>
          <button
            type="button"
            onClick={handleCopyIban}
            className="min-h-[44px] px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-[#0B1F1A] hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedIban ? (
              <>
                <Check className="w-4 h-4 text-emerald-700" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Account Holder Profile */}
      <form
        onSubmit={handleSaveName}
        className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-[#0B1F1A]">Account Profile</h2>
          <p className="text-xs text-slate-500 truncate">{profile.email}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="holder-name" className="text-xs font-medium text-slate-600">
            Account Holder Name
          </label>
          <div className="flex gap-2">
            <input
              id="holder-name"
              type="text"
              maxLength={VALIDATION_RULES.DISPLAY_NAME_MAX}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl border border-slate-200 bg-[#F6F7F9] focus:bg-white focus:border-[#059669] focus:outline-none text-sm text-[#0B1F1A]"
            />
            <button
              type="submit"
              disabled={savingName || nameInput.trim().length === 0 || nameInput.trim() === profile.displayName}
              className="min-h-[48px] px-4 rounded-xl bg-[#0B1F1A] hover:bg-[#13322A] text-white text-xs font-medium disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {savingName ? 'Saving...' : 'Save'}
            </button>
          </div>
          {nameMessage && <p className="text-xs text-emerald-700">{nameMessage}</p>}
        </div>
      </form>

      {/* Sign Out */}
      <button
        type="button"
        onClick={onSignOut}
        className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>
    </div>
  );
}
