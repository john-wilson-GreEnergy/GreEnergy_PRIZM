import { parseNullableBool } from "../../lib/nullableBool";

export interface CanonicalPcsRow {
  arrayNumber: number;
  pcsIndex: number;
  pcsId: string;
  communicating: boolean | null;
  inRotation: boolean | null;
  outRotation: boolean | null;
  rotationStatus: "IN_ROTATION" | "OUT_OF_ROTATION" | "UNKNOWN";
  rotationSource: string;
  dcVoltage: number | null;
  dcCurrent: number | null;
  acVoltageAB: number | null;
  acVoltageBC: number | null;
  acVoltageCA: number | null;
  acCurrent: number | null;
  acRealPowerKw: number | null;
  acReactivePowerKvar: number | null;
  frequencyHz: number | null;
  sourcePath: string;
  raw: any;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizePcsRow(rawRow: any, context?: any): CanonicalPcsRow {
  if (!rawRow) {
    throw new Error("Cannot normalize null rawRow in normalizePcsRow");
  }

  const arrayNumber = num(rawRow.arrayNumber ?? rawRow.arrayIndex ?? rawRow.array ?? context?.arrayNumber) ?? 0;
  const pcsIndex = num(rawRow.pcsIndex ?? rawRow.pcsNumber ?? rawRow.index ?? context?.pcsIndex) ?? 0;
  const pcsId = rawRow.pcsId ?? rawRow.id ?? `A${arrayNumber}-PCS${pcsIndex}`;

  const communicating = parseNullableBool(rawRow.communicating ?? rawRow.isReady ?? rawRow.sourceOk);

  // Rotation must be parsed from explicit PCS fields only. Do not derive from string bucket state!
  let outRotation: boolean | null = null;
  if (rawRow.outRotation !== undefined && rawRow.outRotation !== null && rawRow.outRotation !== "") {
    outRotation = parseNullableBool(rawRow.outRotation);
  } else if (rawRow.OutRotation !== undefined && rawRow.OutRotation !== null && rawRow.OutRotation !== "") {
    outRotation = parseNullableBool(rawRow.OutRotation);
  } else if (rawRow.out_rotation !== undefined && rawRow.out_rotation !== null && rawRow.out_rotation !== "") {
    outRotation = parseNullableBool(rawRow.out_rotation);
  }

  let inRotation: boolean | null = null;
  if (rawRow.inRotation !== undefined && rawRow.inRotation !== null && rawRow.inRotation !== "") {
    inRotation = parseNullableBool(rawRow.inRotation);
  } else if (rawRow.InRotation !== undefined && rawRow.InRotation !== null && rawRow.InRotation !== "") {
    inRotation = parseNullableBool(rawRow.InRotation);
  } else if (outRotation !== null) {
    inRotation = !outRotation;
  }

  if (outRotation === null && inRotation !== null) {
    outRotation = !inRotation;
  }

  let rotationStatus: "IN_ROTATION" | "OUT_OF_ROTATION" | "UNKNOWN" = "UNKNOWN";
  if (inRotation === true) {
    rotationStatus = "IN_ROTATION";
  } else if (inRotation === false) {
    rotationStatus = "OUT_OF_ROTATION";
  }

  const rotationSource = rawRow.rotationSource ?? (outRotation !== null ? "explicit-pcs-field" : "none");

  // DC
  const dcVoltage = num(rawRow.dcVoltageVolt ?? rawRow.dcVoltage ?? rawRow.dcVoltageVdc ?? rawRow.DcVoltage);
  const dcCurrent = num(rawRow.dcCurrentAmp ?? rawRow.dcCurrent ?? rawRow.dcCurrentAdc ?? rawRow.DcCurrent);

  // Phase data extraction for AC current and voltage
  let acVoltageAB = num(rawRow.acVoltageAB ?? rawRow.acVoltage ?? rawRow.acVoltageVolt);
  let acVoltageBC = num(rawRow.acVoltageBC);
  let acVoltageCA = num(rawRow.acVoltageCA);
  let acCurrent = num(rawRow.acCurrentAmp ?? rawRow.acCurrent);

  if (Array.isArray(rawRow.phaseData) || Array.isArray(rawRow.arrayPcsPhaseData)) {
    const phases = rawRow.phaseData || rawRow.arrayPcsPhaseData || [];
    const phaseA = phases.find((p: any) => String(p.phase || p.arrayPcsPhase).toUpperCase().includes("PHASE_A") || String(p.phase || p.arrayPcsPhase).toUpperCase().includes("_A") || String(p.phase || p.arrayPcsPhase) === "A");
    const phaseB = phases.find((p: any) => String(p.phase || p.arrayPcsPhase).toUpperCase().includes("PHASE_B") || String(p.phase || p.arrayPcsPhase).toUpperCase().includes("_B") || String(p.phase || p.arrayPcsPhase) === "B");
    const phaseC = phases.find((p: any) => String(p.phase || p.arrayPcsPhase).toUpperCase().includes("PHASE_C") || String(p.phase || p.arrayPcsPhase).toUpperCase().includes("_C") || String(p.phase || p.arrayPcsPhase) === "C");
    
    if (phaseA) {
      if (acVoltageAB === null) acVoltageAB = num(phaseA.acVoltageVolt ?? phaseA.acVoltage);
      if (acCurrent === null) acCurrent = num(phaseA.acCurrentAmp ?? phaseA.acCurrent);
    }
    if (phaseB) {
      if (acVoltageBC === null) acVoltageBC = num(phaseB.acVoltageVolt ?? phaseB.acVoltage);
    }
    if (phaseC) {
      if (acVoltageCA === null) acVoltageCA = num(phaseC.acVoltageVolt ?? phaseC.acVoltage);
    }
  }

  const acRealPowerKw = num(rawRow.acRealPowerKW ?? rawRow.acRealPowerKw ?? rawRow.acRealPower ?? rawRow.acPower ?? rawRow.acPowerKw);
  const acReactivePowerKvar = num(rawRow.acReactivePowerKVAR ?? rawRow.acReactivePowerKvar ?? rawRow.acReactivePower);
  const frequencyHz = num(rawRow.acFrequencyHz ?? rawRow.frequencyHz ?? rawRow.acFrequency ?? rawRow.frequency);

  const sourcePath = rawRow.sourcePath ?? context?.sourcePath ?? "unknown";

  return {
    arrayNumber,
    pcsIndex,
    pcsId,
    communicating,
    inRotation,
    outRotation,
    rotationStatus,
    rotationSource,
    dcVoltage,
    dcCurrent,
    acVoltageAB,
    acVoltageBC,
    acVoltageCA,
    acCurrent,
    acRealPowerKw,
    acReactivePowerKvar,
    frequencyHz,
    sourcePath,
    raw: rawRow
  };
}
