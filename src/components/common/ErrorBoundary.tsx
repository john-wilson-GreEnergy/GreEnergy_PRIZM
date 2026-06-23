import React, { ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  props!: Props;
  state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Uncaught error]:", error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-8 max-w-xl w-full text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-50 text-rose-500 mb-6">
              <ShieldAlert size={36} />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2 uppercase">
              Application Error
            </h1>
            
            <p className="text-sm text-slate-600 mb-6">
              PRIZM encountered an unexpected runtime exception. The details of the failure are displayed below:
            </p>

            <div className="bg-slate-900 rounded-lg p-4 mb-6 text-left border border-slate-800">
              <div className="text-xs text-rose-400 font-mono font-bold uppercase mb-1">
                {this.state.error?.name || "Exception"}
              </div>
              <div className="text-xs text-slate-300 font-mono break-words select-all">
                {this.state.error?.message || "No error message provided"}
              </div>
              {this.state.error?.stack && (
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500 font-mono block mb-1">STACK TRACE:</span>
                  <pre className="text-[10px] text-slate-400 font-mono max-h-36 overflow-y-auto whitespace-pre-wrap select-all no-scrollbar">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-mono text-xs uppercase font-bold tracking-wider rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <RotateCcw size={14} />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
