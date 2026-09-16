# GreEnergy Prizm - Automated Setup & Run Guide

**GreEnergy Prizm** is a professional diagnostic lens, telemetry monitor, and field operations control center for Battery Energy Storage Systems (BESS). 

This guide describes how a technician can unzip the package and run the automated **Windows or Linux installer** to configure dependencies, compile optimized assets, and automatically create a **Desktop Icon / Shortcut** for simple one-click operations.

---

## 🛠️ System Requirements

To run this application locally, you only need to have **Node.js** installed on your laptop:
- **Node.js**: **v20.0.0 or higher** (LTS v20 or v22 are highly recommended. Note that Tailwind CSS v4 and Vite 6 require Native bindings which fail on under-versioned Node.js v18 engines).
- **NPM**: Package manager built-in with Node.js (normally installed automatically)

---

## 🚀 One-Click Automated Installers

We provide automated setup installers that will detect system environments, install missing modules, compile production packages, and generate beautiful Desktop shortcuts.

### 🪟 Windows Setup (Windows 10 / 11)
1. Unzip the distributed project folder.
2. Locate and double-click the **`install.bat`** file.
3. **What it does**:
   - Detects Node.js. If missing, it offers to install it automatically using Windows Package Manager (`winget`).
   - Restores all server-side and client-side code packages (`npm install`).
   - Compiles and bundles production static assets (`npm run build`).
   - Creates a **"GreEnergy PRIZM"** desktop shortcut matching the system's power/battery icon profile.
   - Offers to immediately launch the application dashboard.

---

### 🐧 Linux Setup (Ubuntu, Arch, Fedora, etc.)
1. Open your terminal app and navigate to the unzipped project folder.
2. Grant execution privileges to the installer script:
   ```bash
   chmod +x install.sh
   ```
3. Run the installer script:
   ```bash
   ./install.sh
   ```
4. **What it does**:
   - Detects Node.js environment. Guides installation if missing via matching package managers (`apt`, `snap`, `pacman`, `dnf`).
   - Synchronizes NPM modules and builds the application bundle.
   - Generates a **`GreEnergy PRIZM` Desktop Shortcut** (`GreEnergy-Prizm.desktop`) both on your desktop and in your Applications Search Menu. Fully references the official SVG logo.
   - *Note (GNOME/Ubuntu Desktop)*: After the desktop icon appears, right-click it and choose **"Allow Launching"** (or **"Trust Launcher"**) to permit clicking it from the GUI.

---

## ⚡ Running the Application

### Desktop or headless deployment

For a macOS or Linux desktop deployment, build PRIZM once (`npm run build`), then run
`bash scripts/install_prizm_desktop_launcher.sh`. The new desktop icon starts the
production server if necessary and opens PRIZM in the browser. Subsequent clicks
reuse the running server. On macOS this is a `PRIZM.app` launcher with the
GreEnergy logo; on Linux it is
a `.desktop` launcher. Linux desktop environments may require marking the icon
as trusted before the first launch. Windows has its own one-click launcher under
`deployment/windows/`.

The macOS launcher shows a brief checking window, then a status window before
opening the dashboard. The launcher reports whether PRIZM was already running
or had to be started.
It also pings the EMS host (default `10.0.0.3`) and reports reachability without
blocking PRIZM when EMS is offline. Set `PRIZM_EMS_HOST` in the launcher's
environment to use a different site address. A successful ping confirms network
reachability only; the PRIZM telemetry view remains the authority for EMS data
health and freshness.

For a **CL250 with a fresh Ubuntu Server 22.04 or 24.04 installation**, first copy or
clone this complete repository onto the CL250, sign in as a non-root account
with `sudo` access, then run from the repository directory:

```bash
./install-headless.sh
```

On Ubuntu 22.04 or 24.04, the installer installs build tools, SSH/sshpass,
curl, ping, and other shell dependencies, plus Node.js 24 LTS when needed,
from the signed NodeSource apt repository. It then installs locked npm dependencies,
builds PRIZM, installs the service, and waits for local HTTP readiness. The first
run needs internet access to Ubuntu, NodeSource, and npm package repositories.
Use `--offline` only after Node.js and npm are installed and npm dependencies are
already present or cached; use `--reinstall-deps` to refresh an existing
dependency tree. The installer does not pull Git changes, configure a firewall,
or enable remote authentication. Outside those Ubuntu releases, install Node.js 20+ and
npm and the required system utilities first. The ioLogik workspace additionally
requires its separate fleet script and golden configuration to be deployed and
configured on the CL250; package installation alone does not provide those assets.
The service installer runs
PRIZM as the non-root account that invoked `sudo`, enables startup on boot, starts
it immediately, and restarts it after an unexpected exit. When installing from a
root shell, specify `PRIZM_RUN_USER=<deployment-account>` explicitly. The service
uses an absolute Node.js path and the current repository location, so reinstall
it if either moves. Check it with `systemctl status prizm`; inspect logs with
`journalctl -u prizm -f`. To stop boot startup, run
`sudo systemctl disable --now prizm`. A previous service file is timestamp-backed
up before replacement. Configure access controls separately before deploying on
a site LAN.

**Network warning:** the current PRIZM server binds to all interfaces. The
headless installer does not create firewall rules or authentication. Deploy it
only on an approved, restricted site network and configure the host firewall or
an authenticated access gateway before granting remote access. The installer
refuses to rebuild over an already-running PRIZM service; use a planned update
procedure for an existing installation.

Do not run the terminal launcher and the boot service simultaneously; both use
port 3000. The desktop launcher detects and reuses an already-running PRIZM.

Once installed, there are two easy ways to start the dashboard:

1. **Desktop Shortcut**: Double-click your new desktop icon!
2. **Interactive Launchers (Command Line)**:
   - On Windows: Run `run.bat`
   - On Linux/macOS: Run `./run.sh`

Both launchers automatically boot the system server and **launch your default web browser** directly to the telemetry center at **`http://localhost:3000`** within 3 seconds.

---

## 🔒 Environment Configuration

If you're utilizing features requiring remote processing (like the **Gemini AI Diagnostics Assistant**), ensure you create a `.env` file in the root directory (based on `.env.example`) and provide your secure access credentials:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 💎 Features of this Package
- **Zero-Configuration Run**: The application automatically auto-compiles if it detects missing build assets (`dist/`), ensuring robust operations even if folders are accidentally cleared.
- **Unified Local Port Access**: The entire backend server and web assets bind to port **`3000`**. Ideal for industrial host computers with rigid multi-port local firewall access policies.
- **Crisp Desktop Integration**: Embeds the official GreEnergy vector SVG branding inside Linux and links standard energy diagnostics iconography on Windows.
