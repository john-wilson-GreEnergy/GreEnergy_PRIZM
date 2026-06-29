import React, { useState, useEffect } from "react";
import { Search, Filter, BookOpen, AlertCircle, RefreshCw, X, ChevronRight, HelpCircle } from "lucide-react";

interface TroubleshootingEntry {
  id: string;
  sourceDocument: string;
  sourcePage: string;
  section: string;
  system: string;
  component: string;
  issueName: string;
  aliases?: string[];
  faultCodes?: number[];
  warningCodes?: number[];
  infoCodes?: number[];
  warrantyCodes?: number[];
  summaryAction: string;
  recommendedActions: string[];
  validationChecks: string[];
  clearingCriteria: string[];
  detailView?: string;
  managerSummary?: string;
  technicianDetail?: string;
  safetyNote?: string;
  fieldCorrections?: string;
}

export default function TroubleshootingLibrary() {
  const [entries, setEntries] = useState<TroubleshootingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filters
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  
  // Selected Entry for Detail View
  const [selectedEntry, setSelectedEntry] = useState<TroubleshootingEntry | null>(null);

  const fetchLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/local/troubleshooting/library");
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries);
        if (data.entries.length > 0 && !selectedEntry) {
          setSelectedEntry(data.entries[0]);
        }
      } else {
        setError(data.error || "Failed to load troubleshooting library.");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const systemsList = [
    "String", "BPC", "Cell Group", "Balancing", "HVAC", "Fire", 
    "UPS", "Network", "Feather", "Team Box", "PCS", "Meter", "Transformer"
  ];

  const severitiesList = ["Alarm", "Warning", "Info", "Warranty", "Advisory"];

  const sectionsList = ["String Issues", "Team Box Issues", "Warnings, Alarms, & Info"];

  // Search and filter logic
  const filteredEntries = entries.filter(entry => {
    // 1. Text Search query matching
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchName = entry.issueName.toLowerCase().includes(query);
      const matchId = entry.id.toLowerCase().includes(query);
      const matchComp = entry.component.toLowerCase().includes(query);
      const matchSys = entry.system.toLowerCase().includes(query);
      const matchSummary = entry.summaryAction.toLowerCase().includes(query);
      const matchAction = entry.recommendedActions.some(act => act.toLowerCase().includes(query));
      const matchClearing = entry.clearingCriteria.some(crit => crit.toLowerCase().includes(query));
      const matchAlias = entry.aliases?.some(alias => alias.toLowerCase().includes(query)) || false;
      
      const codes = [
        ...(entry.faultCodes || []),
        ...(entry.warningCodes || []),
        ...(entry.infoCodes || []),
        ...(entry.warrantyCodes || [])
      ].map(String);
      const matchCode = codes.some(c => c.includes(query));

      if (!matchName && !matchId && !matchComp && !matchSys && !matchSummary && !matchAction && !matchClearing && !matchAlias && !matchCode) {
        return false;
      }
    }

    // 2. System filter
    if (selectedSystem !== "all") {
      if (entry.system.toLowerCase() !== selectedSystem.toLowerCase()) {
        return false;
      }
    }

    // 3. Severity filter
    if (selectedSeverity !== "all") {
      const s = selectedSeverity.toLowerCase();
      if (s === "alarm" && (!entry.faultCodes || entry.faultCodes.length === 0)) return false;
      if (s === "warning" && (!entry.warningCodes || entry.warningCodes.length === 0)) return false;
      if (s === "info" && (!entry.infoCodes || entry.infoCodes.length === 0)) return false;
      if (s === "warranty" && (!entry.warrantyCodes || entry.warrantyCodes.length === 0)) return false;
      if (s === "advisory" && (
        (!entry.faultCodes || entry.faultCodes.length === 0) &&
        (!entry.warningCodes || entry.warningCodes.length === 0) &&
        (!entry.infoCodes || entry.infoCodes.length === 0) &&
        (!entry.warrantyCodes || entry.warrantyCodes.length === 0)
      )) {
        // advisory fallback has no codes
      } else if (s === "advisory") {
        // entry has codes but we selected advisory
        return false;
      }
    }

    // 4. Section filter
    if (selectedSection !== "all") {
      const sec = selectedSection.toLowerCase();
      const entrySec = entry.section.toLowerCase();
      if (!entrySec.includes(sec.replace("issues", "").trim())) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-prizm-surface p-4 font-mono select-none" id="troubleshooting-library-page">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-prizm-border pb-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
            <BookOpen size={16} className="text-prizm-primary" />
            PRIZM Troubleshooting Library
          </h2>
          <p className="text-[10px] text-prizm-text-muted mt-1 uppercase">
            Curated troubleshooting matrix based on Stack750 Troubleshooting Cheat Sheet v2
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            onClick={fetchLibrary}
            className="p-1.5 bg-prizm-surface-strong border border-prizm-border/60 text-prizm-text hover:text-white rounded transition-colors flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold cursor-pointer"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
            Sync Library
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-prizm-danger/10 border border-prizm-danger/30 text-prizm-danger p-3 rounded mb-4 text-[10px] uppercase flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Control Filters Section */}
      <div className="bg-black/10 border border-prizm-border/40 rounded p-3 mb-4 flex flex-col gap-3">
        {/* Search Input Bar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <Search size={12} className="text-prizm-text-muted" />
          </span>
          <input
            type="text"
            placeholder="Search by issue name, code, alias, system, recommended action, or clearing criteria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-prizm-surface-strong border border-prizm-border rounded py-1.5 pl-8 pr-8 text-[11px] text-white placeholder-prizm-text-muted focus:border-prizm-primary focus:outline-none font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-prizm-text-muted hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
          {/* System filter */}
          <div>
            <label className="block text-prizm-text-muted uppercase font-bold mb-1 tracking-wider">System Filter</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSystem("all")}
                className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  selectedSystem === "all"
                    ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                    : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                }`}
              >
                All Systems
              </button>
              {systemsList.map(sys => (
                <button
                  key={sys}
                  onClick={() => setSelectedSystem(sys)}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    selectedSystem.toLowerCase() === sys.toLowerCase()
                      ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                      : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                  }`}
                >
                  {sys}
                </button>
              ))}
            </div>
          </div>

          {/* Severity type filter */}
          <div>
            <label className="block text-prizm-text-muted uppercase font-bold mb-1 tracking-wider">Severity Filter</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSeverity("all")}
                className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  selectedSeverity === "all"
                    ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                    : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                }`}
              >
                All Severities
              </button>
              {severitiesList.map(sev => (
                <button
                  key={sev}
                  onClick={() => setSelectedSeverity(sev)}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    selectedSeverity.toLowerCase() === sev.toLowerCase()
                      ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                      : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Source Section filter */}
          <div>
            <label className="block text-prizm-text-muted uppercase font-bold mb-1 tracking-wider">Source Section</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSection("all")}
                className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  selectedSection === "all"
                    ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                    : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                }`}
              >
                All Sections
              </button>
              {sectionsList.map(sec => (
                <button
                  key={sec}
                  onClick={() => setSelectedSection(sec)}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    selectedSection.toLowerCase() === sec.toLowerCase()
                      ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold"
                      : "bg-prizm-surface border-prizm-border text-prizm-text-muted hover:text-white"
                  }`}
                >
                  {sec.replace("Issues", "").trim()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main List and Detail Panel Split View */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        {/* Left Side List View */}
        <div className="w-full lg:w-5/12 flex flex-col border border-prizm-border/60 rounded bg-prizm-surface-strong/30 overflow-hidden min-h-0">
          <div className="bg-prizm-surface-strong py-2 px-3 border-b border-prizm-border flex items-center justify-between text-[10px] font-bold text-prizm-text-muted uppercase tracking-wider">
            <span>Troubleshooting Entries ({filteredEntries.length})</span>
          </div>
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted text-[10px] uppercase gap-2 animate-pulse">
              <RefreshCw size={16} className="animate-spin text-prizm-primary" />
              Loading Curated Knowledge Base...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted text-[10px] uppercase gap-2 text-center">
              <HelpCircle size={20} className="text-prizm-warning/70" />
              No matching troubleshooting entries found.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-prizm-border/30">
              {filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                
                // Get display codes list
                const codes = [
                  ...(entry.faultCodes || []),
                  ...(entry.warningCodes || []),
                  ...(entry.infoCodes || []),
                  ...(entry.warrantyCodes || [])
                ];

                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`p-3 text-[10px] text-left transition-all cursor-pointer flex justify-between items-start ${
                      isSelected 
                        ? "bg-prizm-primary/10 border-l-2 border-prizm-primary" 
                        : "hover:bg-prizm-surface-strong/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-white font-extrabold truncate text-[11px] block">{entry.issueName}</span>
                        {codes.map(c => (
                          <span key={c} className="bg-black/40 px-1 rounded text-[8.5px] font-bold text-prizm-primary tracking-tight font-mono">
                            #{c}
                          </span>
                        ))}
                      </div>
                      
                      <p className="text-prizm-text-muted line-clamp-1 mb-1.5 italic text-[9px] font-sans">
                        {entry.summaryAction}
                      </p>

                      <div className="flex gap-2 text-[8.5px] uppercase font-bold text-prizm-text-muted">
                        <span className="bg-prizm-surface px-1 border border-prizm-border/40 rounded">
                          {entry.system}
                        </span>
                        <span className="bg-prizm-surface px-1 border border-prizm-border/40 rounded">
                          {entry.component}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`text-prizm-text-muted mt-1 shrink-0 ${isSelected ? "text-prizm-primary" : ""}`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side Detail View */}
        <div className="w-full lg:w-7/12 flex flex-col border border-prizm-border/60 rounded bg-prizm-surface-strong/20 overflow-hidden min-h-0">
          {selectedEntry ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar p-4 gap-4 text-[11px]">
              {/* Header Title Info */}
              <div className="border-b border-prizm-border/60 pb-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2 uppercase tracking-wide">
                      {selectedEntry.issueName}
                    </h3>
                    {selectedEntry.aliases && selectedEntry.aliases.length > 0 && (
                      <p className="text-[9px] text-prizm-text-muted font-sans mt-0.5 uppercase tracking-wider">
                        Aliases: {selectedEntry.aliases.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <span className="px-1.5 py-0.5 bg-prizm-primary/10 border border-prizm-primary/30 rounded text-prizm-primary font-bold uppercase text-[9px]">
                      {selectedEntry.system}
                    </span>
                    <span className="px-1.5 py-0.5 bg-prizm-surface-strong border border-prizm-border/60 rounded text-prizm-text font-bold uppercase text-[9px]">
                      {selectedEntry.component}
                    </span>
                  </div>
                </div>

                {/* Code categorization pills */}
                <div className="flex gap-3 flex-wrap mt-3 text-[9px] font-sans">
                  {selectedEntry.faultCodes && selectedEntry.faultCodes.length > 0 && (
                    <div className="flex items-center gap-1 bg-rose-500/10 text-rose-400 px-1.5 py-0.5 border border-rose-500/20 rounded font-bold uppercase">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                      Alarms: {selectedEntry.faultCodes.join(", ")}
                    </div>
                  )}
                  {selectedEntry.warningCodes && selectedEntry.warningCodes.length > 0 && (
                    <div className="flex items-center gap-1 bg-amber-500/10 text-amber-400 px-1.5 py-0.5 border border-amber-500/20 rounded font-bold uppercase">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                      Warnings: {selectedEntry.warningCodes.join(", ")}
                    </div>
                  )}
                  {selectedEntry.infoCodes && selectedEntry.infoCodes.length > 0 && (
                    <div className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-1.5 py-0.5 border border-blue-500/20 rounded font-bold uppercase">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      Infos: {selectedEntry.infoCodes.join(", ")}
                    </div>
                  )}
                  {selectedEntry.warrantyCodes && selectedEntry.warrantyCodes.length > 0 && (
                    <div className="flex items-center gap-1 bg-teal-500/10 text-teal-400 px-1.5 py-0.5 border border-teal-500/20 rounded font-bold uppercase">
                      <span className="w-1.5 h-1.5 bg-teal-500 rounded-full"></span>
                      Warranty: {selectedEntry.warrantyCodes.join(", ")}
                    </div>
                  )}
                </div>
              </div>

              {/* Manager Summary View */}
              {selectedEntry.managerSummary && (
                <div className="bg-prizm-surface p-3 border border-prizm-border rounded">
                  <div className="text-[9px] uppercase font-bold text-prizm-primary mb-1.5 font-sans tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-prizm-primary rounded-full"></span>
                    Operational / Manager Summary
                  </div>
                  <p className="text-prizm-text font-bold leading-relaxed">
                    {selectedEntry.managerSummary}
                  </p>
                </div>
              )}

              {/* Source Document Metadata */}
              <div className="flex items-center gap-1.5 bg-black/20 p-2.5 rounded border border-prizm-border/40 text-prizm-text-muted text-[10px] uppercase">
                <span className="font-extrabold text-prizm-primary font-sans">Source Documentation:</span>
                <span>{selectedEntry.sourceDocument}</span>
                <span className="text-white bg-prizm-surface px-1 border border-prizm-border rounded">
                  Page {selectedEntry.sourcePage}
                </span>
              </div>

              {/* Grid block for actions, validations & clearing criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Curated Remediation Recommended Actions */}
                <div className="flex flex-col gap-2">
                  <div className="font-sans uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                    Recommended Field Actions
                  </div>
                  <ul className="list-none space-y-1.5 pr-2 pl-1.5">
                    {selectedEntry.recommendedActions.map((act, idx) => (
                      <li key={idx} className="relative pl-3 text-prizm-text leading-tight">
                        <span className="absolute left-0 text-emerald-400">•</span>
                        {act}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 2. Validation Checks */}
                <div className="flex flex-col gap-2">
                  <div className="font-sans uppercase font-bold text-prizm-text-muted tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-prizm-text-muted rounded-full"></span>
                    Validation Checks
                  </div>
                  <ul className="list-none space-y-1.5 pr-2 pl-1.5">
                    {selectedEntry.validationChecks.map((check, idx) => (
                      <li key={idx} className="relative pl-3 text-prizm-text-muted leading-tight">
                        <span className="absolute left-0 text-prizm-text-muted">•</span>
                        {check}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 border-t border-prizm-border/40 pt-3">
                {/* 3. Clearing Criteria */}
                <div className="flex flex-col gap-2">
                  <div className="font-sans uppercase font-bold text-blue-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                    Clearing Criteria
                  </div>
                  <ul className="list-none space-y-1.5 pr-2 pl-1.5">
                    {selectedEntry.clearingCriteria.map((crit, idx) => (
                      <li key={idx} className="relative pl-3 text-prizm-text-muted leading-tight">
                        <span className="absolute left-0 text-blue-400">•</span>
                        {crit}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Safety or technician detail note */}
                {(selectedEntry.technicianDetail || selectedEntry.fieldCorrections || selectedEntry.safetyNote) && (
                  <div className="flex flex-col gap-2">
                    <div className="font-sans uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                      Technician Field Guidance
                    </div>
                    {selectedEntry.fieldCorrections && (
                      <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded font-mono text-[10px] text-prizm-text tracking-wide leading-relaxed">
                        <span className="font-sans font-bold text-amber-400 uppercase text-[9px] block mb-1">Corrected Field Wording</span>
                        {selectedEntry.fieldCorrections}
                      </div>
                    )}
                    {selectedEntry.technicianDetail && (
                      <p className="text-prizm-text-muted italic leading-relaxed pl-1">
                        {selectedEntry.technicianDetail}
                      </p>
                    )}
                    {selectedEntry.safetyNote && (
                      <div className="bg-rose-950/20 border border-rose-800/55 p-2 rounded text-[9.5px] text-rose-300 font-bold tracking-tight mt-1 uppercase">
                        ⚠️ SAFETY NOTE: {selectedEntry.safetyNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted text-[10px] uppercase">
              Select an entry to view full troubleshooting metadata.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
