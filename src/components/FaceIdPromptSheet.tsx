import { useEffect, useState } from 'react';
import { CheckCircle2, ScanFace, ShieldCheck } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

export interface FaceIdChallenge {
  title: string;
  description: string;
  onSuccess: () => void | Promise<void>;
}

interface FaceIdPromptSheetProps {
  challenge: FaceIdChallenge | null;
  onClose: () => void;
}

type ScanState = 'scanning' | 'verified';

export function FaceIdPromptSheet({ challenge, onClose }: FaceIdPromptSheetProps) {
  const [scanState, setScanState] = useState<ScanState>('scanning');

  useEffect(() => {
    if (!challenge) return;
    setScanState('scanning');

    const verifyTimer = window.setTimeout(() => {
      setScanState('verified');
    }, 750);

    const completeTimer = window.setTimeout(() => {
      const callback = challenge.onSuccess;
      onClose();
      void callback();
    }, 1150);

    return () => {
      window.clearTimeout(verifyTimer);
      window.clearTimeout(completeTimer);
    };
  }, [challenge, onClose]);

  return (
    <BottomSheet
      open={Boolean(challenge)}
      onClose={onClose}
      title="FaceID Security Check"
    >
      {challenge && (
        <div className="py-3 flex flex-col items-center text-center space-y-5">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center transition-colors ${
              scanState === 'verified'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-[#0B1F1A] text-emerald-300'
            }`}
          >
            {scanState === 'verified' ? (
              <CheckCircle2 className="w-10 h-10" />
            ) : (
              <ScanFace className="w-10 h-10" />
            )}
          </div>

          <div className="space-y-1.5 max-w-xs">
            <p className="text-base font-semibold text-[#0B1F1A]">
              {scanState === 'verified' ? 'FaceID Verified' : challenge.title}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {challenge.description}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {scanState === 'verified'
                ? 'Authorized · Proceeding'
                : 'Verifying biometric identity...'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#0B1F1A] hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
