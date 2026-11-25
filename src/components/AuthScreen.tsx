import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

export function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Sign-in was cancelled or blocked.';
      if (message.includes('popup-closed-by-user')) {
        setError('Sign-in popup was closed before completing.');
      } else if (message.includes('popup-blocked')) {
        setError('Please allow popups for this site to sign in securely with Google.');
      } else {
        setError(message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex flex-col lg:grid lg:grid-cols-12">
      {/* Editorial Brand Column (Desktop left / Mobile top) */}
      <div className="lg:col-span-7 bg-[#0B1F1A] text-white px-6 py-10 sm:px-10 lg:px-16 lg:py-16 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap">
            Valo Bank
          </span>
          <span className="text-xs text-emerald-200/80 tracking-normal">
            Virtual Play EUR · Not real money
          </span>
        </div>

        <div className="my-10 lg:my-0 max-w-xl space-y-6">
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.12] text-white"
            style={{ textWrap: 'balance' }}
          >
            Mobile banking built for instant virtual IBAN transfers.
          </h1>
          <p className="text-base sm:text-lg text-emerald-100/80 leading-relaxed max-w-lg">
            Sign in securely to receive your personal virtual IBAN with €1,000.00 in play
            funds, verify other members by IBAN and name, and track every transaction live.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Verified Login</span>
              </div>
              <p className="text-xs text-emerald-100/70 leading-relaxed">
                Google authentication with isolated account rules.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Mobile-First</span>
              </div>
              <p className="text-xs text-emerald-100/70 leading-relaxed">
                Thumb-friendly controls and instant IBAN sharing.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>Live Ledger</span>
              </div>
              <p className="text-xs text-emerald-100/70 leading-relaxed">
                Real-time balance and transfer updates.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-emerald-100/50 hidden lg:block">
          Play-money simulator only · No real bank accounts, cards, or fiat deposits.
        </p>
      </div>

      {/* Sign-in Action Column */}
      <div className="lg:col-span-5 flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-7 sm:p-9 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-700">
              Secure Account Access
            </p>
            <h2 className="text-2xl font-bold text-[#0B1F1A] tracking-tight">
              Open or access your account
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              New members automatically receive a unique <span className="font-mono text-xs text-[#0B1F1A]">VA42</span> IBAN
              and €1,000.00 in virtual play funds.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-[#0B1F1A] text-white font-medium text-sm flex items-center justify-center gap-3 hover:bg-[#13322A] active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <span>Signing in securely...</span>
            ) : (
              <>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            Virtual simulation environment. Balances hold zero real-world monetary value.
          </div>
        </div>
      </div>
    </div>
  );
}
