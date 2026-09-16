import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import "./style.css";

type Json = Record<string, any>;
type Settings = {
  port: number; browserLaunch: boolean; automaticStartup: boolean;
  logRetention: number; startupTimeoutSeconds: number;
  workspaceUrl: string; updateChannel: string;
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <img src="/logo.svg" alt="GreEnergy" />
    <div><h1>GreEnergy PRIZM Manager</h1><p>Battery Energy Storage Platform</p></div>
    <div class="version" id="version">Version — · Build —<br>Branch — · Commit —</div>
  </header>
  <main>
    <section class="status-panel">
      <div><span class="eyebrow">PLATFORM STATUS</span><h2><i id="status-dot"></i><span id="status">Checking</span></h2></div>
      <div class="facts">
        <label>PID <b id="pid">—</b></label><label>Port <b id="port">—</b></label>
        <label>CPU <b id="cpu">—</b></label><label>Memory <b id="memory">—</b></label>
        <label>Uptime <b id="uptime">—</b></label><label>Latest Cycle <b id="cycle">—</b></label>
        <label>Coordinator <b id="coordinator-duration">—</b></label><label>Publication <b id="publication-duration">—</b></label>
      </div>
    </section>
    <nav class="actions">
      <button data-service="start">Start</button><button data-service="stop">Stop</button>
      <button data-service="restart">Restart</button><button id="open-prizm" class="primary">Open PRIZM</button>
      <button id="health-check">Health Check</button><button id="view-logs">View Logs</button>
      <button id="backup">Backup</button><button id="restore">Restore</button>
      <button id="update">Update</button><button id="settings-button">Settings</button>
    </nav>
    <div id="notice"></div>
    <section class="grid">
      <article>
        <div class="section-title"><h3>System Health</h3><span id="health-time">Not checked</span></div>
        <div id="health-grid" class="health-grid"></div>
      </article>
      <article id="logs-panel">
        <div class="section-title"><h3>Log Viewer</h3><div><button id="export-log">Export</button><button id="open-log-folder">Open Folder</button></div></div>
        <div class="log-tools"><select id="log-select"></select><input id="log-search" placeholder="Search logs" />
          <label><input type="checkbox" id="errors-only"/> Errors</label><label><input type="checkbox" id="warnings-only"/> Warnings</label></div>
        <pre id="log-content">Select View Logs to load the latest service log.</pre>
      </article>
    </section>
  </main>
  <dialog id="settings-dialog">
    <form method="dialog"><h3>Manager Settings</h3>
      <div class="settings-grid">
        <label>Port<input name="port" type="number" min="1" max="65535" required /></label>
        <label>Log retention<input name="logRetention" type="number" min="1" max="1000" required /></label>
        <label>Startup timeout (seconds)<input name="startupTimeoutSeconds" type="number" min="10" required /></label>
        <label>Workspace URL<input name="workspaceUrl" required /></label>
        <label>Update channel<select name="updateChannel"><option value="manual">Manual / offline package</option></select></label>
        <label class="check"><input name="browserLaunch" type="checkbox"/> Launch browser after start</label>
        <label class="check"><input name="automaticStartup" type="checkbox"/> Automatic startup</label>
      </div>
      <p class="hint">Port changes take effect after restarting PRIZM. Automatic service startup is established by the installer.</p>
      <footer><button value="cancel">Cancel</button><button id="save-settings" value="default" class="primary">Save</button></footer>
    </form>
  </dialog>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let settings: Settings;
let health: Json = {};
let logText = "";

function notice(message: string, error = false) {
  $("notice").textContent = message;
  $("notice").className = error ? "error" : "success";
  setTimeout(() => { if ($("notice").textContent === message) $("notice").textContent = ""; }, 8000);
}
function duration(seconds: number) {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
function bytes(value: number) {
  return value ? `${(value / 1024 / 1024).toFixed(1)} MB` : "—";
}
function path(root: any, keys: string[], fallback: any = "—") {
  let value = root;
  for (const key of keys) value = value?.[key];
  return value ?? fallback;
}
async function refreshStatus() {
  try {
    const value = await invoke<Json>("get_status");
    $("status").textContent = value.status;
    $("status-dot").className = value.status.toLowerCase();
    $("pid").textContent = value.pid ?? "—";
    $("cpu").textContent = value.pid ? `${Number(value.cpu).toFixed(1)}%` : "—";
    $("memory").textContent = bytes(value.memory);
    $("uptime").textContent = duration(value.uptime);
    const b = value.buildInfo;
    $("version").innerHTML = `Version ${b.version} · Build ${String(b.build).slice(0, 19)}<br>Branch ${b.branch} · Commit ${b.commit}`;
  } catch (error) {
    $("status").textContent = "Error";
    $("status-dot").className = "error";
  }
}
function healthState(name: string, result: any): [string, string] {
  if (!result?.ok) return ["ERROR", result?.error || `HTTP ${result?.status || 0}`];
  const body = result.body || {};
  if (name === "Canonical Publication") return [path(body, ["latest", "state"], "UNKNOWN"), `Cycle ${path(body, ["latest", "publicationCycleId"])}`];
  if (name === "Workspace") return [body.ready ? "HEALTHY" : "STARTING", `Cycle ${body.cycleId ?? "—"}`];
  if (name === "Projection") return [body.health?.toUpperCase?.() || "HEALTHY", `Cycle ${body.cycleId ?? "—"}`];
  return ["HEALTHY", `HTTP ${result.status}`];
}
async function refreshHealth() {
  health = await invoke<Json>("get_health");
  const names: Record<string, string> = {
    coordinator: "Coordinator", publication: "Canonical Publication", ems: "EMS",
    stringViewer: "StringViewer", feather: "Feather", telemetry: "Telemetry",
    workspace: "Workspace", projection: "Projection"
  };
  $("health-grid").innerHTML = Object.entries(names).map(([key, label]) => {
    const [state, detail] = healthState(label, health[key]);
    return `<div class="health-card"><span class="${state.toLowerCase()}">${state}</span><b>${label}</b><small>${detail}</small></div>`;
  }).join("");
  $("health-time").textContent = `Checked ${new Date().toLocaleTimeString()}`;
  $("cycle").textContent = path(health, ["publication", "body", "latest", "publicationCycleId"]);
  $("publication-duration").textContent = `${Number(path(health, ["publication", "body", "latest", "durationMs"], 0)).toFixed(0)} ms`;
  $("coordinator-duration").textContent = `${Number(path(health, ["coordinatorProfile", "body", "latest", "durationMs"], 0)).toFixed(0)} ms`;
}
function filterLog() {
  const query = ($<HTMLInputElement>("log-search").value || "").toLowerCase();
  const errors = $<HTMLInputElement>("errors-only").checked;
  const warnings = $<HTMLInputElement>("warnings-only").checked;
  $("log-content").textContent = logText.split(/\r?\n/).filter(line => {
    const lower = line.toLowerCase();
    return (!query || lower.includes(query)) && (!errors || lower.includes("error")) && (!warnings || lower.includes("warn"));
  }).join("\n");
}
async function loadSelectedLog() {
  const name = $<HTMLSelectElement>("log-select").value;
  if (!name) return;
  logText = await invoke<string>("read_log", { name });
  filterLog();
}
async function loadLogs() {
  const logs = await invoke<string[]>("list_logs");
  $<HTMLSelectElement>("log-select").innerHTML = logs.map(name => `<option>${name}</option>`).join("");
  await loadSelectedLog();
}
async function loadSettings() {
  settings = await invoke<Settings>("load_settings");
  $("port").textContent = String(settings.port);
  const form = $<HTMLDialogElement>("settings-dialog").querySelector("form")!;
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    if (!field) continue;
    if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = Boolean(value);
    else field.value = String(value);
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-service]").forEach(button => button.addEventListener("click", async () => {
  try { notice(`${button.dataset.service} requested…`); await invoke("control_service", { action: button.dataset.service }); await refreshStatus(); }
  catch (error) { notice(String(error), true); }
}));
$("open-prizm").addEventListener("click", () => openUrl(settings.workspaceUrl));
$("health-check").addEventListener("click", () => refreshHealth().catch(e => notice(String(e), true)));
$("view-logs").addEventListener("click", () => loadLogs().catch(e => notice(String(e), true)));
$("backup").addEventListener("click", async () => { try { notice(`Backup created: ${await invoke("create_backup")}`); } catch (e) { notice(String(e), true); } });
$("restore").addEventListener("click", async () => {
  if (!confirm("Restore the latest backup? PRIZM must be stopped. Current Config, Cache, and Telemetry files may be replaced.")) return;
  try { notice(`Restored: ${await invoke("restore_latest_backup")}`); } catch (e) { notice(String(e), true); }
});
$("update").addEventListener("click", async () => {
  if (!confirm("Install the approved MSI from ProgramData\\GreEnergy\\PRIZM\\Updates?")) return;
  try { notice(await invoke("install_staged_update")); } catch (e) { notice(String(e), true); }
});
$("settings-button").addEventListener("click", () => $<HTMLDialogElement>("settings-dialog").showModal());
$("save-settings").addEventListener("click", async event => {
  event.preventDefault();
  const form = $<HTMLDialogElement>("settings-dialog").querySelector("form")!;
  const data = new FormData(form);
  const next: Settings = {
    port: Number(data.get("port")), browserLaunch: data.get("browserLaunch") === "on",
    automaticStartup: data.get("automaticStartup") === "on", logRetention: Number(data.get("logRetention")),
    startupTimeoutSeconds: Number(data.get("startupTimeoutSeconds")), workspaceUrl: String(data.get("workspaceUrl")),
    updateChannel: String(data.get("updateChannel"))
  };
  try { await invoke("save_settings", { settings: next }); settings = next; $("port").textContent = String(next.port); $<HTMLDialogElement>("settings-dialog").close(); notice("Settings saved."); }
  catch (e) { notice(String(e), true); }
});
$("log-select").addEventListener("change", () => loadSelectedLog().catch(e => notice(String(e), true)));
["log-search", "errors-only", "warnings-only"].forEach(id => $(id).addEventListener("input", filterLog));
$("open-log-folder").addEventListener("click", () => openPath("C:\\ProgramData\\GreEnergy\\PRIZM\\Logs"));
$("export-log").addEventListener("click", async () => {
  const name = $<HTMLSelectElement>("log-select").value;
  if (!name) return;
  try { notice(`Exported: ${await invoke("export_log", { name })}`); } catch (e) { notice(String(e), true); }
});

Promise.all([loadSettings(), refreshStatus()]).then(() => refreshHealth()).catch(e => notice(String(e), true));
setInterval(refreshStatus, 5000);
