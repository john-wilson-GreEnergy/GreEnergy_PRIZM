import React from "react";
import logoUrl from "./logo-transparent.svg";

interface GreEnergyLogoProps {
  className?: string;
  strokeWidth?: number; // kept for backwards compatibility in argument list, but unused
}

export function GreEnergyLogo({ className = "w-8 h-8" }: GreEnergyLogoProps) {
  return (
    <img 
      src={logoUrl} 
      className={className} 
      alt="GreEnergy Logo" 
      referrerPolicy="no-referrer"
    />
  );
}
