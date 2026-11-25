import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed?.error) {
        readable = parsed.error.includes('Missing or insufficient permissions')
          ? 'This action was blocked by account security rules. Please verify recipient status and try again.'
          : parsed.error;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, errorMessage: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-[#0B1F1A]">Something went wrong</h1>
              <p className="text-sm text-slate-600 leading-relaxed">{this.state.errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#0B1F1A] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#13322A] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload Valo Bank</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
