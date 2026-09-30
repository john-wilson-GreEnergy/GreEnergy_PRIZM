import React, {memo} from 'react';
import type {FeatherHvacDevice} from '../server/feather/deviceEnrichment';
import {supportsFanSpeedFeedback} from '../lib/hvacFeedbackProfile';
import {sameFeatherRow, sameHvacDisplay, sameSensorDisplay} from '../lib/featherTablePresentation';

  // HVAC mismatch logic helper
export const detectHvacMismatch = (device: any) => {
    const hvac1 = device.hvac1 || {};
    const hvac2 = device.hvac2 || {};
    const rpmSupported = supportsFanSpeedFeedback(device.hvacType);

    const hvac1Cmd = !!(hvac1.fanLowOn || hvac1.fanHighOn || hvac1.compressorOn || hvac1.electricHeatOn);
    const hvac1Act = !!((hvac1.currentA && hvac1.currentA > 0.2) || (rpmSupported && hvac1.fanSpeedRpm && hvac1.fanSpeedRpm > 0));

    const hvac2Cmd = !!(hvac2.fanLowOn || hvac2.fanHighOn || hvac2.compressorOn || hvac2.electricHeatOn);
    const hvac2Act = !!((hvac2.currentA && hvac2.currentA > 0.2) || (rpmSupported && hvac2.fanSpeedRpm && hvac2.fanSpeedRpm > 0));

    let mismatchType: "none" | "commanded_not_active" | "active_not_commanded" = "none";
    let description = "";

    if ((hvac1Cmd && !hvac1Act) || (hvac2Cmd && !hvac2Act)) {
      mismatchType = "commanded_not_active";
      description = rpmSupported ? "HVAC commanded but no active current/RPM feedback detected." : "HVAC commanded but no active current feedback detected.";
    } else if ((!hvac1Cmd && hvac1Act) || (!hvac2Cmd && hvac2Act)) {
      mismatchType = "active_not_commanded";
      description = "HVAC active feedback detected without any command.";
    }

    return {
      isMismatched: mismatchType !== "none",
      mismatchType,
      description
    };
  };

  const getSingleHvacMismatchState = (hvac: any, hvacType: unknown) => {
    const unit = hvac || {};
    const commanded = !!(
      unit.fanLowOn ||
      unit.fanHighOn ||
      unit.compressorOn ||
      unit.electricHeatOn ||
      unit.reversingValveOn
    );

    const active = !!(
      (Number(unit.currentA || 0) > 0.2) ||
      (supportsFanSpeedFeedback(hvacType) && Number(unit.fanSpeedRpm || 0) > 0)
    );

    let mismatchType: "none" | "commanded_not_active" | "active_not_commanded" = "none";

    if (commanded && !active) mismatchType = "commanded_not_active";
    else if (!commanded && active) mismatchType = "active_not_commanded";

    return {
      commanded,
      active,
      isMismatched: mismatchType !== "none",
      mismatchType
    };
  };

export const deviceMatchesHvacFilter = (device: any, hvacFilter: string): boolean => {
    if (hvacFilter === "all") return true;

    const hvac1 = getSingleHvacMismatchState(device?.hvac1, device?.hvacType);
    const hvac2 = getSingleHvacMismatchState(device?.hvac2, device?.hvacType);

    if (hvacFilter === "mismatch") {
      return hvac1.isMismatched || hvac2.isMismatched;
    }

    if (hvacFilter === "hvac1-mismatch") {
      return hvac1.isMismatched;
    }

    if (hvacFilter === "hvac2-mismatch") {
      return hvac2.isMismatched;
    }

    if (hvacFilter === "commanded-no-current") {
      return hvac1.mismatchType === "commanded_not_active" || hvac2.mismatchType === "commanded_not_active";
    }

    if (hvacFilter === "current-no-command") {
      return hvac1.mismatchType === "active_not_commanded" || hvac2.mismatchType === "active_not_commanded";
    }

    return true;
  };


  // Compact HVAC rendering for Main Table
  const renderHvacCompact = (hvac: any, hvacId: string, hvacType: unknown) => {
    if (!hvac) return <span className="text-prizm-text-muted">--</span>;

    const relays = [
      { key: "fanLowOn", label: "FanL" },
      { key: "fanHighOn", label: "FanH" },
      { key: "compressorOn", label: "Comp" },
      { key: "reversingValveOn", label: "Rev.V" },
      { key: "electricHeatOn", label: "HT" }
    ];

    return (
      <div className="flex flex-col gap-1 text-[10px]">
        <div className="flex items-center gap-1">
          {relays.map(r => {
            const val = hvac[r.key];
            if (val === undefined || val === null) {
              return <span key={r.key} className="text-prizm-text-muted">--</span>;
            }
            return (
              <span
                key={r.key}
                title={`${r.label}: ${val ? "Commanded ON" : "Commanded OFF"}`}
                className={`px-1 rounded text-[9px] font-bold ${
                  val
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "bg-black/20 text-prizm-text-muted/40 border border-prizm-border/10"
                }`}
              >
                {r.label}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-prizm-text-muted font-medium">
          <span>{(hvac.currentA || 0).toFixed(1)}A</span>
          {supportsFanSpeedFeedback(hvacType) && <><span>•</span><span>{hvac.fanSpeedRpm || 0} RPM</span></>}
        </div>
      </div>
    );
  };

  // Mismatch badge indicator
  const renderHvacMismatchBadge = (d: any) => {
    const mismatch1 = detectHvacMismatch({ hvac1: d.hvac1 });
    const mismatch2 = detectHvacMismatch({ hvac2: d.hvac2 });

    if (mismatch1.isMismatched || mismatch2.isMismatched) {
      return (
        <span
          title={`${mismatch1.isMismatched ? "HVAC1: " + mismatch1.description : ""} ${mismatch2.isMismatched ? "HVAC2: " + mismatch2.description : ""}`}
          className="px-1 py-0.5 bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 rounded font-bold text-[8px] animate-pulse whitespace-nowrap"
        >
          ⚠️ MISMATCH
        </span>
      );
    }
    return null;
  };

  const getSensorBadgeState = (d: any, type: 'FSS' | 'LeakDet' | 'TopCap' | 'BattDoor' | 'AcDoor' | 'DcDoor') => {
    const fss = d.fssSignals;
    const doors = d.doors;

    if (type === 'FSS') {
      if (!fss || fss.valid === false) return 'unavailable';
      const problem = !!(
        fss.fssAlarm ||
        fss.fssTrouble ||
        fss.fssAlarmOrTrouble ||
        fss.fireAlarm ||
        fss.fireTrouble ||
        fss.smokeAlarm ||
        fss.smokeAlarmTrouble ||
        fss.heatSensor ||
        fss.hydrogenAlarm ||
        fss.hydrogenFault ||
        fss.statXRelease
      );
      return problem ? 'problem' : 'normal';
    }

    if (type === 'LeakDet') {
      if (!fss) return 'unavailable';
      if (fss.leakAlarm === true) return 'problem';
      if (fss.leakAlarm === false) return 'normal';
      return 'unavailable';
    }

    if (type === 'TopCap') {
      if (d.doorApplicability?.monitorsTopCap === false) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.lowerTopcapClosed === true) return 'normal';
      if (doors.lowerTopcapClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'BattDoor') {
      if (d.doorApplicability?.monitorsBatteryDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.batteryDoorsClosed === true) return 'normal';
      if (doors.batteryDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'AcDoor') {
      if (d.doorApplicability?.monitorsAcDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.acDoorsClosed === true) return 'normal';
      if (doors.acDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'DcDoor') {
      if (d.doorApplicability?.monitorsDcDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.dcDoorsClosed === true) return 'normal';
      if (doors.dcDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    return 'unavailable';
  };

  // Compact sensor status badges
  const renderSensorsCompact = (d: any) => {
    const types: ('FSS' | 'LeakDet' | 'TopCap' | 'BattDoor' | 'AcDoor' | 'DcDoor')[] = [
      'FSS', 'LeakDet', 'TopCap', 'BattDoor', 'AcDoor', 'DcDoor'
    ];

    return (
      <div className="flex flex-wrap items-center gap-1 text-[9px]">
        {types.map(t => {
          const state = getSensorBadgeState(d, t);
          if (state === 'hidden') return null;

          let colorClass = "bg-slate-200 text-slate-700 border border-slate-400";
          if (state === 'normal') {
            colorClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          } else if (state === 'problem') {
            colorClass = "bg-rose-500/10 text-rose-500 border border-rose-500/20";
          }

          return (
            <span
              key={t}
              className={`px-1 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] border ${colorClass}`}
              title={`${t}: State is ${state}`}
            >
              {t}
            </span>
          );
        })}
      </div>
    );
  };


const HvacDisplay = ({hvac, hvacType}: {hvac: FeatherHvacDevice['hvac1']; hvacType: unknown}) => renderHvacCompact(hvac, '', hvacType);
const MemoHvacDisplay = memo(HvacDisplay, (a,b) => a.hvacType === b.hvacType && sameHvacDisplay(a.hvac,b.hvac));
const SensorsDisplay = ({device}: {device: FeatherHvacDevice}) => renderSensorsCompact(device);
const MemoSensorsDisplay = memo(SensorsDisplay, (a,b) => sameSensorDisplay(a.device,b.device));
export type FeatherDeviceRowProps = {device: FeatherHvacDevice; onSelect: (ip: string) => void; optimized?: boolean};
export function FeatherDeviceRow({device: d, onSelect, optimized = true}: FeatherDeviceRowProps) {
 const HvacComponent = optimized ? MemoHvacDisplay : HvacDisplay;
 const SensorsComponent = optimized ? MemoSensorsDisplay : SensorsDisplay;
 return (                    <tr

                      onClick={() => onSelect(d.ip)}
                      className="hover:bg-prizm-surface-strong transition-colors cursor-pointer"
                    >
                      {/* Reachable status node indicator */}
                      <td className="p-3 text-center">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          d.reachable ? "bg-emerald-400 shadow-sm shadow-emerald-500/20" : "bg-rose-500"
                        }`} />
                      </td>

                      <td className="p-3 text-prizm-text font-bold whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{d.ip}</span>
                          <span className="text-[9px] text-prizm-text-muted font-normal">{d.firmwareVersion || d.softwareVersion || "No Fw"}</span>
                        </div>
                      </td>

                      <td className="p-3 text-prizm-text-muted leading-tight whitespace-nowrap">
                        <span className="block font-bold">Array {d.arrayIndex ?? "?"}</span>
                        <span className="block text-[9px]">{d.segmentLabel ?? ""}</span>
                      </td>

                      <td className="p-3 text-prizm-text-muted max-w-44 truncate font-medium title-cell" title={d.entityDescription || "Unmapped"}>
                        {d.entityDescription || "Unmapped"}
                      </td>

                      {/* State / Ping */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              d.reachable && d.deviceState === "NORMAL"
                                ? "bg-green-500/5 text-green-400 border border-green-500/10"
                                : d.reachable && d.deviceState === "ALARM"
                                ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20"
                                : d.reachable && d.deviceState === "WARNING"
                                ? "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20"
                                : !d.reachable && d.sourceCoverage?.directFeather
                                ? "bg-black/40 text-prizm-text-muted border border-prizm-border"
                                : "bg-prizm-surface-strong text-prizm-text-muted"
                            }`}>
                              {d.reachable ? (d.deviceState || "NORMAL") : (d.sourceCoverage?.directFeather ? 'OFFLINE' : 'Not reporting')}
                            </span>
                            {renderHvacMismatchBadge(d)}
                          </div>
                          <span className="text-[9px] text-prizm-primary font-bold">
                            {d.reachable ? `${(d.pingMs || 0)} ms` : "n/a"}
                          </span>
                        </div>
                      </td>

                      {/* Stage column */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-prizm-surface-strong border border-prizm-border text-[9px] font-bold text-prizm-primary uppercase">
                          {d.thermostatStage || d.hvacRuntimeState || d.hvacMode || d.hvacStatus || "–"}
                        </span>
                      </td>

                      {/* HVAC Unit 1 */}
                      <td className="p-3">
                        <HvacComponent hvac={d.hvac1} hvacType={d.hvacType} />
                      </td>

                      {/* HVAC Unit 2 */}
                      <td className="p-3">
                        <HvacComponent hvac={d.hvac2} hvacType={d.hvacType} />
                      </td>

                      {/* Sensors Summary */}
                      <td className="p-3">
                        <SensorsComponent device={d} />
                      </td>

                      <td className="p-3 text-prizm-text-muted">
                        {d.lastSuccessUtc ? d.lastSuccessUtc.slice(11, 19) + " UTC" : "N/A"}
                      </td>
                    </tr>);
}
export const MemoFeatherDeviceRow = memo(FeatherDeviceRow, (a,b) => a.onSelect === b.onSelect && a.optimized === b.optimized && sameFeatherRow(a.device,b.device));
