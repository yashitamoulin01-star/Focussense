"""
FocusSense Desktop Agent — main.py
===================================
Monitors active OS windows and reports to the FocusSense UI via WebSocket.
Acts as a hub: the browser extension connects and sends tab data, and
the desktop app connects and receives the combined activity stream.

Requirements:
    pip install websockets psutil pygetwindow

Run:
    python agent/main.py
"""

import asyncio
import json
import time
import sys
import ctypes
import os
from typing import Optional, Tuple

try:
    import websockets
    import websockets.exceptions
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("ERROR: 'websockets' not installed. Run: pip install websockets")
    sys.exit(1)

try:
    import psutil
except ImportError:
    print("WARNING: 'psutil' not installed. Run: pip install psutil")
    psutil = None  # type: ignore

try:
    import pygetwindow as gw
except ImportError:
    print("WARNING: 'pygetwindow' not installed. Run: pip install pygetwindow")
    gw = None  # type: ignore


# ── Config ────────────────────────────────────────────────────────────────────
VERSION = "1.1.0"
PORT = 8765

DISTRACTING_PROCESSES = {
    "discord.exe", "steam.exe", "spotify.exe", "vlc.exe",
    "netflix.exe", "obsidian.exe"
}

DISTRACTING_SITES = [
    "youtube.com", "netflix.com", "facebook.com", "twitter.com",
    "x.com", "reddit.com", "twitch.tv", "instagram.com", "tiktok.com"
]


# ── Global shared state ───────────────────────────────────────────────────────
class GlobalState:
    def __init__(self):
        self.browser_activity: dict = {
            "domain": "",
            "title": "",
            "url": "",
            "idleState": "active",
            "isAudible": False,
            "timestamp": 0
        }

state = GlobalState()


# ── Token ─────────────────────────────────────────────────────────────────────
def load_token() -> str:
    """Load auth token from relayConfig.json."""
    paths = [
        os.path.join(os.path.dirname(__file__), "..", "src", "engine", "session", "relayConfig.json"),
        os.path.join(os.path.dirname(__file__), "relayConfig.json"),
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r") as f:
                    data = json.load(f)
                    return data.get("token", "")
            except Exception:
                continue
    return ""


# ── OS Signal Readers ─────────────────────────────────────────────────────────
def get_system_idle_time() -> float:
    """Returns seconds since last mouse/keyboard input (Windows only)."""
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    try:
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):  # type: ignore
            millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime  # type: ignore
            return max(0.0, millis / 1000.0)
    except Exception:
        pass
    return 0.0


def get_active_window_info() -> Tuple[Optional[str], str]:
    """Returns (window_title, process_name_guess) for the active foreground window."""
    try:
        if gw is None:
            return None, "unknown"
        window = gw.getActiveWindow()
        if not window:
            return None, "unknown"

        title: str = window.title or ""
        lower = title.lower()

        if "chrome" in lower:
            process = "chrome.exe"
        elif "edge" in lower:
            process = "msedge.exe"
        elif "firefox" in lower:
            process = "firefox.exe"
        elif "brave" in lower:
            process = "brave.exe"
        elif "code" in lower or "visual studio" in lower:
            process = "Code.exe"
        elif "word" in lower:
            process = "WINWORD.exe"
        elif "excel" in lower:
            process = "EXCEL.exe"
        elif "discord" in lower:
            process = "discord.exe"
        elif "terminal" in lower or "powershell" in lower or "cmd" in lower:
            process = "WindowsTerminal.exe"
        elif "notion" in lower:
            process = "Notion.exe"
        elif "obsidian" in lower:
            process = "Obsidian.exe"
        elif "spotify" in lower:
            process = "spotify.exe"
        elif "steam" in lower:
            process = "steam.exe"
        else:
            process = "unknown"

        return title, process
    except Exception as e:
        print(f"[Agent] Window read error: {e}", flush=True)
        return None, "unknown"


def get_top_cpu_process() -> Tuple[str, float]:
    """Returns (name, cpu%) for the highest CPU process."""
    if psutil is None:
        return "unknown", 0.0
    try:
        top_proc, max_cpu = None, 0.0
        skip = {"System Idle Process", "System", "Registry", "Idle"}
        for proc in psutil.process_iter(["name", "cpu_percent"]):
            try:
                name = proc.info["name"]
                cpu = proc.info["cpu_percent"] or 0.0
                if name in skip:
                    continue
                if cpu > max_cpu:
                    max_cpu = cpu
                    top_proc = name
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        return str(top_proc or "idle"), float(max_cpu)
    except Exception:
        return "error", 0.0


def compute_focus(active_process: str, is_idle: bool) -> Tuple[int, str]:
    """Compute focus score and state from current signals."""
    if is_idle:
        return 0, "idle"

    score = 100
    state_label = "focused"
    proc_lower = active_process.lower()

    # Explicitly distracting app
    if proc_lower in DISTRACTING_PROCESSES:
        score -= 40
        state_label = "distracted"

    # Browser with known distracting site (from extension data)
    is_browser = any(b in proc_lower for b in ["chrome", "msedge", "firefox", "brave"])
    browser_domain = state.browser_activity.get("domain", "")
    if is_browser and browser_domain:
        if any(site in browser_domain for site in DISTRACTING_SITES):
            score = max(0, score - 50)
            state_label = "distracted"

    return max(0, min(100, score)), state_label


# ── WebSocket Handler ─────────────────────────────────────────────────────────
async def handle_connection(websocket: WebSocketServerProtocol, path: str = "/") -> None:
    """
    Authenticate, then route by role:
      - 'extension' → receive ACTIVITY_REPORT and update shared state
      - 'app' (default) → broadcast window_activity every 2s
    """
    print("[Agent] New connection — awaiting auth...", flush=True)

    # Step 1: Handshake & Identity Verification
    try:
        raw = await asyncio.wait_for(websocket.recv(), timeout=5.0)
        msg = json.loads(raw)
        
        # New: Challenge-Response Handshake
        if msg.get("type") == "HELLO":
            nonce = msg.get("payload", {}).get("nonce")
            print(f"[Agent] Received HELLO with nonce: {nonce}", flush=True)
            
            # Respond with HELLO_ACK + echoed nonce + version
            # In a more production environment, we'd sign this nonce with a local secret.
            # For now, echoing it confirms the agent is alive and following protocol.
            ack_msg = {
                "type": "HELLO_ACK",
                "payload": {
                    "nonce": nonce,
                    "version": VERSION,
                    "status": "ready"
                }
            }
            await websocket.send(json.dumps(ack_msg))
            
            # Now wait for the actual AUTH_CLIENT
            raw = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            msg = json.loads(raw)

        if msg.get("type") != "AUTH_CLIENT":
            print(f"[Agent] Unexpected message type: {msg.get('type')}", flush=True)
            await websocket.close(1008, "Expected AUTH_CLIENT")
            return

        client_token = msg.get("payload", {}).get("token", "")
        client_role  = msg.get("payload", {}).get("role", "app")
        expected     = load_token()

        # Only enforce token if one is configured
        if expected and expected != "pending" and client_token != expected:
            print("[Agent] Rejected: invalid token.", flush=True)
            await websocket.close(1008, "Invalid token")
            return

        print(f"[Agent] Auth OK — role: {client_role}", flush=True)

    except asyncio.TimeoutError:
        print("[Agent] Rejected: handshake/auth timeout.", flush=True)
        await websocket.close(1008, "Timeout")
        return
    except (json.JSONDecodeError, KeyError):
        await websocket.close(1008, "Malformed message")
        return
    except websockets.exceptions.ConnectionClosed:
        return

    # Step 2: Role-based loop
    try:
        if client_role == "extension":
            # Browser extension → receives activity reports, updates shared state
            async for raw_msg in websocket:
                try:
                    data = json.loads(raw_msg)
                    if data.get("type") == "ACTIVITY_REPORT":
                        state.browser_activity.update(data.get("payload", {}))
                except (json.JSONDecodeError, TypeError):
                    pass

        else:
            # Desktop app → send window_activity every 2s
            while True:
                now = time.time()
                title, proc = get_active_window_info()
                idle_sec = get_system_idle_time()
                top_proc, top_cpu = get_top_cpu_process()

                if not title:
                    title = "Desktop"
                    proc = "system"

                is_idle = idle_sec > 60.0
                score, focus_state = compute_focus(proc, is_idle)

                # Stale data cleanup: if browser data is older than 60s, clear it
                if state.browser_activity.get("timestamp", 0) > 0:
                    if (now * 1000) - state.browser_activity["timestamp"] > 60000:
                        state.browser_activity = {
                            "domain": "", "title": "", "url": "", 
                            "idleState": "active", "isAudible": False, "timestamp": 0
                        }

                payload = {
                    "type": "window_activity",
                    "timestamp": int(now * 1000),
                    "processName": proc,
                    "windowTitle": title,
                    "isIdle": is_idle,
                    "idleSeconds": int(idle_sec),
                    "topCpuProcess": top_proc,
                    "topCpuUsage": round(top_cpu, 1),
                    "pcFocusScore": score,
                    "focusState": focus_state,
                    "browserData": dict(state.browser_activity),
                    "source": "desktop_agent",
                }

                await websocket.send(json.dumps(payload))
                await asyncio.sleep(2)

    except websockets.exceptions.ConnectionClosed:
        print(f"[Agent] {client_role.capitalize()} disconnected.", flush=True)
    except Exception as e:
        print(f"[Agent] Error ({client_role}): {e}", flush=True)


# ── Entry Point ───────────────────────────────────────────────────────────────
async def main() -> None:
    print(f"[Agent] FocusSense Desktop Agent v1.1 — ws://localhost:{PORT}", flush=True)

    token = load_token()
    if token and token != "pending":
        print(f"[Agent] Token loaded: {token[:8]}...", flush=True)
    else:
        print("[Agent] WARNING: No token — running without auth enforcement.", flush=True)

    try:
        async with websockets.serve(handle_connection, "127.0.0.1", PORT):
            print(f"[Agent] Listening on ws://localhost:{PORT}", flush=True)
            print("[Agent] Press Ctrl+C to stop.\n", flush=True)
            await asyncio.Future()  # run forever
    except OSError as e:
        print(f"[Agent] ERROR: Cannot bind to port {PORT}: {e}", flush=True)
        print("[Agent] Kill existing instances with: Stop-Process -Name python -Force", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Agent] Stopped.", flush=True)
