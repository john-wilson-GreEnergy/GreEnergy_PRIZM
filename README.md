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
