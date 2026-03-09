#!/usr/bin/env python3
"""
PromoPe CRM — Remote Control Agent
=====================================
Run this script on an employee's machine to allow managers to view and
control the screen remotely through the CRM.

Setup:
  pip install mss pyautogui websocket-client Pillow

Usage:
  python remote_agent.py --server ws://localhost:8000 --token YOUR_AGENT_TOKEN

  Where YOUR_AGENT_TOKEN is found in:
    CRM → Settings → My Account → Remote Agent Token

The agent will:
  1. Connect to the CRM server
  2. Wait for a manager to request a remote control session
  3. Prompt you to Accept (y) or Reject (n) each request
  4. If accepted, send screen frames and execute mouse/keyboard events
  5. Show a clear indicator while a session is active
"""

import argparse
import base64
import json
import sys
import threading
import time
import traceback

try:
    import mss
    from PIL import Image
    from io import BytesIO
    import pyautogui
    import websocket
except ImportError as e:
    print(f"\n[ERROR] Missing dependency: {e}")
    print("Install with: pip install mss pyautogui websocket-client Pillow\n")
    sys.exit(1)

# Suppress pyautogui fail-safe warning
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0


def capture_screen(quality: int = 50) -> tuple[str, int, int]:
    """Capture the primary monitor and return (base64_jpeg, width, height)."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]   # primary monitor
        screenshot = sct.grab(monitor)
        img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=quality, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        return b64, monitor['width'], monitor['height']


class RemoteAgent:
    def __init__(self, server_url: str, agent_token: str):
        self.url          = f"{server_url.rstrip('/')}/ws/remote/agent/{agent_token}/"
        self.fps          = 2
        self.quality      = 50
        self.session_active   = False
        self.active_session_id = None
        self.ws           = None
        self._stop        = threading.Event()

    # ── WebSocket event handlers ───────────────────────────────────────────────

    def on_open(self, ws):
        print("✓ Connected to PromoPe CRM server.")
        print("  Waiting for a manager to request remote control...\n")

    def on_message(self, ws, message):
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return

        t = data.get('type') or data.get('event')

        if t == 'session_request' or data.get('event') == 'session_request':
            controller = data.get('controller_name', 'A manager')
            session_id = data.get('session_id')
            print(f"\n{'='*50}")
            print(f"⚠  REMOTE CONTROL REQUEST")
            print(f"   {controller} is requesting remote access.")
            print(f"   Session ID: {session_id}")
            print(f"{'='*50}")

            # Prompt in a separate thread to avoid blocking the WS receive loop
            threading.Thread(
                target=self._prompt_accept,
                args=(ws, session_id, data.get('fps', 2), data.get('quality', 50)),
                daemon=True,
            ).start()

        elif t in ('session_ended', 'ended') or data.get('event') == 'ended':
            if self.session_active:
                self.session_active    = False
                self.active_session_id = None
                print("\n[Session ended by manager]")
                print("Waiting for next request...\n")

        elif t == 'mouse_move':
            screen_w, screen_h = pyautogui.size()
            x = int(float(data.get('x', 0)) * screen_w)
            y = int(float(data.get('y', 0)) * screen_h)
            pyautogui.moveTo(x, y, duration=0.03)

        elif t == 'mouse_click':
            screen_w, screen_h = pyautogui.size()
            x = int(float(data.get('x', 0)) * screen_w)
            y = int(float(data.get('y', 0)) * screen_h)
            button = data.get('button', 'left')
            pyautogui.click(x, y, button=button)

        elif t == 'mouse_scroll':
            screen_w, screen_h = pyautogui.size()
            x = int(float(data.get('x', 0)) * screen_w)
            y = int(float(data.get('y', 0)) * screen_h)
            dy = int(data.get('dy', 0))
            pyautogui.scroll(dy, x=x, y=y)

        elif t == 'key':
            raw = data.get('key', '')
            if raw:
                keys = [k.strip() for k in raw.split('+') if k.strip()]
                try:
                    pyautogui.hotkey(*keys)
                except Exception:
                    pass

        elif t == 'pong':
            pass  # heartbeat response

    def on_error(self, ws, error):
        print(f"[WebSocket error] {error}")

    def on_close(self, ws, close_code, close_msg):
        self.session_active = False
        print(f"\nDisconnected from server (code={close_code}). Retrying in 5s...")

    # ── Accept/reject prompt ───────────────────────────────────────────────────

    def _prompt_accept(self, ws, session_id, fps, quality):
        try:
            choice = input("Accept session? (y/n): ").strip().lower()
        except EOFError:
            choice = 'n'

        if choice == 'y':
            ws.send(json.dumps({'type': 'session_accept', 'session_id': session_id}))
            self.session_active    = True
            self.active_session_id = session_id
            self.fps               = max(1, min(fps, 10))
            self.quality           = max(10, min(quality, 90))
            print(f"\n✓ Session accepted. Streaming at {self.fps} FPS, quality {self.quality}%.")
            print("  Press Ctrl+C to disconnect.\n")
        else:
            ws.send(json.dumps({'type': 'session_reject', 'session_id': session_id}))
            print("\n✗ Session rejected.\n")

    # ── Frame streaming thread ─────────────────────────────────────────────────

    def _stream_frames(self):
        while not self._stop.is_set():
            if self.session_active and self.ws and self.ws.sock:
                try:
                    frame, w, h = capture_screen(self.quality)
                    self.ws.send(json.dumps({
                        'type': 'frame',
                        'data': frame,
                        'w': w,
                        'h': h,
                    }))
                except Exception as e:
                    # Don't crash the thread — log and continue
                    print(f"[Frame error] {e}")
            time.sleep(1.0 / max(self.fps, 1))

    # ── Main run loop ──────────────────────────────────────────────────────────

    def run(self):
        print(f"PromoPe Remote Agent")
        print(f"Connecting to: {self.url}\n")

        frame_thread = threading.Thread(target=self._stream_frames, daemon=True)
        frame_thread.start()

        while not self._stop.is_set():
            try:
                self.ws = websocket.WebSocketApp(
                    self.url,
                    on_open    = self.on_open,
                    on_message = self.on_message,
                    on_error   = self.on_error,
                    on_close   = self.on_close,
                )
                self.ws.run_forever(ping_interval=20, ping_timeout=10)
            except KeyboardInterrupt:
                print("\nStopping agent...")
                self._stop.set()
                break
            except Exception:
                traceback.print_exc()

            if not self._stop.is_set():
                print("Reconnecting in 5 seconds...")
                time.sleep(5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='PromoPe CRM Remote Control Agent',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python remote_agent.py --server ws://localhost:8000 --token abc123...
  python remote_agent.py --server wss://crm.company.com --token abc123...
        """,
    )
    parser.add_argument(
        '--server', required=True,
        help='CRM server WebSocket URL (e.g. ws://localhost:8000 or wss://crm.company.com)',
    )
    parser.add_argument(
        '--token', required=True,
        help='Your agent token from CRM → Settings → My Account',
    )
    args = parser.parse_args()

    agent = RemoteAgent(args.server, args.token)
    try:
        agent.run()
    except KeyboardInterrupt:
        print("\nAgent stopped.")
