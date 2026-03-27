<p align="center">
  <img src="public/focussense_banner.png" width="800" alt="FocusSense Banner">
</p>

<h1 align="center">FocusSense</h1>

<p align="center">
  <strong>Your ethical productivity sanctuary — grow a farm, master your focus.</strong>
</p>

<p align="center">
  <a href="https://github.com/yashitamoulin01-star/Focussense/releases/latest">
    <img src="https://img.shields.io/github/v/release/yashitamoulin01-star/Focussense?label=Download&style=for-the-badge&color=4CAF50" alt="Download Latest">
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Built%20With-Tauri%20%2B%20React-blueviolet?style=for-the-badge" alt="Tech Stack">
</p>

---

## What is FocusSense?

FocusSense is a **privacy-first, gamified focus tracker** for Windows. Instead of shaming you for distractions, it rewards deep work — every focused minute grows your digital pixel-art farm. It monitors your active window via a local Python agent (zero cloud, zero tracking), builds an AI-powered picture of your cognitive peaks, and helps you work *with* your brain, not against it.

---

## Table of Contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Download & Install](#-download--install-for-users)
- [Full Setup](#-full-setup-for-developers)
  - [Prerequisites](#prerequisites)
  - [1 — Python Agent](#1--python-activity-agent)
  - [2 — Desktop App](#2--desktop-app)
  - [3 — Browser Extension](#3--browser-extension)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [License](#-license)

---

## Features

| Feature | Description |
|---|---|
| **Farm Gamification** | Focus minutes grow crops, fill a pond, and build your farm. Your attention has visible, rewarding consequences. |
| **Local-Only Privacy** | A local Python agent reads your active window title. No data ever leaves your machine. No accounts. No cloud. |
| **AI Focus Coach** | Analyzes your focus history to identify your peak hours and schedule tasks around your actual cognitive rhythm. |
| **Multiple Work Modes** | Switch between Deep Work, Study, Creative, Admin, and more — each with its own themed UI and timer style. |
| **Analytics Dashboard** | Recharts-powered graphs showing daily focus totals, mood trends, category breakdowns, and session history. |
| **Pomodoro + Stopwatch** | Built-in Pomodoro timer and freeform stopwatch modes with automatic session logging. |
| **Data Export** | Export your full focus history as JSON or CSV for personal analysis. |
| **One-Click Agent Pairing** | Secure local WebSocket handshake — connect your Python agent in one click with no manual configuration. |

---

## Screenshots

> **Farm World** — your focus becomes a living, growing ecosystem.

<!-- Replace the paths below with actual screenshots once taken -->
<!-- Recommended: take screenshots and save to docs/screenshots/ -->

| Farm View | Analytics Dashboard |
|---|---|
| *(Add screenshot: Farm in progress)* | *(Add screenshot: Analytics view)* |

| Focus Timer | Session Log |
|---|---|
| *(Add screenshot: Timer running)* | *(Add screenshot: History/session log)* |

> **Tip:** To add screenshots, take them while the app is running, save them to a `docs/screenshots/` folder, and replace the text above with `![description](docs/screenshots/your-file.png)`.

---

## Download & Install (for Users)

**No compilation required.** Download the pre-built Windows installer from GitHub Releases.

### Step 1 — Download the App

Go to the [**Releases page**](https://github.com/yashitamoulin01-star/Focussense/releases/latest) and download:

```
FocusSense_x.x.x_x64-setup.exe
```

Run the installer — it will install FocusSense to your system and create a desktop shortcut.

---

### Step 2 — Set Up the Python Activity Agent

The app UI is standalone, but the **activity monitoring** (knowing which app/website you're using) requires a small local Python agent. Without it, the timer still works — you just won't get automatic app tracking.

**Requirements:** [Python 3.10 or newer](https://www.python.org/downloads/)

**Setup (one-time):**

```bash
# 1. Download or clone the repository (for the agent folder only)
git clone https://github.com/yashitamoulin01-star/Focussense.git
cd Focussense/agent

# 2. Create a virtual environment
python -m venv .venv

# 3. Activate it
# On Windows (Command Prompt):
.venv\Scripts\activate
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt
```

**Agent dependencies installed:**
- `psutil` — reads running processes
- `pygetwindow` — reads the active window title
- `websockets` — communicates with the FocusSense app over a local WebSocket

**Run the agent:**

```bash
# Every time you want activity tracking, run this before opening the app:
python main.py
```

The agent runs silently in the background. Open FocusSense, go to **Settings → Connect Agent**, and click **Connect** to pair.

---

### Step 3 — Install the Browser Extension (Optional)

For tracking which website you're on in your browser (not just that the browser is open):

1. Open Chrome or Edge and go to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from the cloned repository

The extension will automatically send the current tab's title to the agent when your browser is the active window.

---

## Full Setup (for Developers)

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Rust (stable)](https://www.rust-lang.org/tools/install)
- [Python 3.10+](https://www.python.org/downloads/)

### Clone & Install

```bash
git clone https://github.com/yashitamoulin01-star/Focussense.git
cd Focussense
npm install
```

### Run in Development Mode

Start all three pieces in separate terminals:

**Terminal 1 — Python Agent:**
```bash
cd agent
.venv\Scripts\activate
python main.py
```

**Terminal 2 — Tauri Dev App:**
```bash
npm run tauri dev
```

**Terminal 3 (optional) — Browser Extension:**
Load `extension/` as an unpacked extension in Chrome/Edge (see above).

### Build a Production Installer

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/FocusSense_x.x.x_x64-setup.exe
```

---

## How It Works

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   FocusSense UI             │        │  Python Activity Agent   │
│   (Tauri + React + PixiJS)  │◄──────►│  (psutil + pygetwindow)  │
│                             │  WS    │                          │
│  • Farm canvas (PixiJS)     │        │  • Reads active window   │
│  • Timer & sessions         │        │  • Sends app name + URL  │
│  • Analytics (Recharts)     │        │  • Runs on localhost     │
│  • AI coach                 │        └──────────────────────────┘
│  • localStorage data        │
└─────────────────────────────┘        ┌──────────────────────────┐
                                       │  Browser Extension       │
                                       │  (Chrome / Edge)         │
                                       │  • Sends tab title/URL   │
                                       └──────────────────────────┘
```

All communication is local WebSocket (`ws://127.0.0.1:8765`). No internet connection is required after installation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | [Tauri v2](https://tauri.app/) (Rust) |
| Frontend | [React 18](https://react.dev/) + [Vite 7](https://vitejs.dev/) |
| Farm Rendering | [PixiJS](https://pixijs.com/) (WebGL 2D engine) |
| Analytics Charts | [Recharts](https://recharts.org/) |
| Activity Agent | Python 3 (`psutil`, `pygetwindow`, `websockets`) |
| Browser Extension | Vanilla JS Web Extension (Chrome/Edge) |
| Data Storage | `localStorage` (fully local, no database server) |
| Communication | Local WebSockets (zero network egress) |

---

## License

**Proprietary — All Rights Reserved.**

Copyright © 2026 Yashita Moulin.

You may download and personally use the compiled application. You may view the source code for reference. You may **not** copy, redistribute, modify, or replicate the concept, design, or code in another product.

See [LICENSE](LICENSE) for the full legal terms.

---

<p align="center">
  Built with focus, ethics, and a lot of pixel-art love.
</p>
