const fs = require('fs');
let appStr = fs.readFileSync('src/App.tsx', 'utf8');

const repollFnObj = `
  const handleManualRepoll = async () => {
    if (manualRepolling) return;
    setManualRepolling(true);
    setManualRepollError(null);
    setManualRepollMessage(null);
    try {
      const refreshRes = await fetch("/api/local/system/refresh-live", { method: "POST" });
      const refreshBody = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok) throw new Error(refreshBody?.error || "Refresh failed with HTTP " + refreshRes.status);
      const connRes = await fetch("/api/local/ems/connection-status");
      const connBody = await connRes.json().catch(() => null);
      if (connRes.ok && connBody) { setConnectionStatus(connBody); setEmsMetadata(connBody); }
      const bootRes = await fetch("/api/local/system/boot-status").catch(() => null);
      if (bootRes && bootRes.ok) { const bootBody = await bootRes.json().catch(() => null); if (bootBody) setBootStatus(bootBody); }
      const debugRes = await fetch("/api/local/debug/sources").catch(() => null);
      let sourceMsg = "";
      if (debugRes && debugRes.ok) {
        const sources = await debugRes.json().catch(() => []);
        const okCount = sources.filter((s) => s.success).length;
        sourceMsg = " · Sources: " + okCount + " OK / " + (sources.length - okCount) + " Failed";
      }
      let connMsg = "";
      if (connBody) {
        if (connBody.status === "LIVE") connMsg = " · Connection Live";
        else if (connBody.status === "PARTIAL") connMsg = " · Partial Connection";
        else connMsg = " · " + (connBody.status || "Offline");
      }
      setManualRepollMessage("EMS Repoll Complete" + connMsg + sourceMsg);
      setTimeout(() => setManualRepollMessage(null), 6000);
    } catch (err) {
      setManualRepollError(err?.message || "EMS repoll failed");
      setTimeout(() => setManualRepollError(null), 6000);
    } finally {
      setManualRepolling(false);
    }
  };
`;

// Remove the bad old lines from App.tsx
appStr = appStr.replace(/const handleManualRepoll = async \(\) => \{[\s\S]*?setManualRepolling\(false\);\s*\}\s*\};/, repollFnObj.trim());
appStr = appStr.replace(/const handleManualRepoll = async \(\) => \{[\s\S]*?setManualRepolling\(false\);\s*\}\s*\};/, '');

fs.writeFileSync('src/App.tsx', appStr);
