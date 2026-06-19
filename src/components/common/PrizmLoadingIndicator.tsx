import React from 'react';

interface PrizmLoadingIndicatorProps {
  show: boolean;
}

export const PrizmLoadingIndicator: React.FC<PrizmLoadingIndicatorProps> = ({ show }) => {
  if (!show) return null;

  return (
    <div 
      className="fixed top-14 right-4 z-[9999] bg-[#1a1f2e]/90 text-white border border-[#2e374a] px-3 py-2 rounded-lg shadow-2xl flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest pointer-events-none transition-all animate-fade-in"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <svg
        width="60"
        height="40"
        viewBox="0 0 60 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Animated incoming white light beam */}
        <path
          d="M 2 20 L 26 20"
          stroke="#F8FAFC"
          strokeWidth="1.5"
          className="animate-pulse"
        />

        {/* The Prism (Triangle) */}
        <polygon
          points="25,12 35,28 15,28"
          stroke="#475569"
          strokeWidth="1.5"
          fill="#1E293B"
          fillOpacity="0.6"
        />

        {/* Refracted rays splitting into shades of green */}
        {/* Ray 1: Mint Green */}
        <path
          d="M 26 21 L 52 10"
          stroke="#34D399"
          strokeWidth="1.5"
          strokeDasharray="3 1"
          className="animate-[dash_1.5s_linear_infinite]"
        />
        {/* Ray 2: GreEnergy Primary Emerald */}
        <path
          d="M 26 21 L 55 20"
          stroke="#10B981"
          strokeWidth="2"
          strokeDasharray="4 2"
          className="animate-[dash_1s_linear_infinite]"
        />
        {/* Ray 3: Forest Green */}
        <path
          d="M 26 21 L 52 30"
          stroke="#047857"
          strokeWidth="1.5"
          className="animate-pulse"
        />
      </svg>
      <div>
        <span className="text-emerald-400 font-bold">Refracting</span>
        <span className="text-slate-400 animate-pulse block">Loading view...</span>
      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -10;
          }
        }
      `}</style>
    </div>
  );
};

export default PrizmLoadingIndicator;
