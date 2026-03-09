"""
WebSocket concurrency load test for Staff Management CRM.

Opens 100 concurrent WebSocket connections:
  40 → ws://localhost:8000/ws/activity/?token=<jwt>
  30 → ws://localhost:8000/ws/chat/direct/<conv_id>/?token=<jwt>
  30 → ws://localhost:8000/ws/notifications/?token=<jwt>

Each worker authenticates via HTTP POST /api/auth/login/ first, then
establishes its WS connection and exercises it for the test duration.

Usage:
    python ws_load_test.py
    python ws_load_test.py --duration 60 --host ws://localhost:8000

Prerequisites:
    pip install websockets>=12.0 aiohttp>=3.9.0
    python manage.py seed_load_test_data  (creates test_users.json)
"""

import argparse
import asyncio
import json
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import aiohttp
    import websockets
    import websockets.exceptions
    from websockets.asyncio.client import connect as ws_connect
except ImportError:
    print("ERROR: Missing deps. Run: pip install websockets>=12.0 aiohttp>=3.9.0")
    sys.exit(1)

WS_HEADERS: dict = {"Origin": "http://localhost:8000"}  # updated at runtime

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
HTTP_BASE    = "http://localhost:8000"
WS_BASE      = "ws://localhost:8000"
DATA_FILE    = Path(__file__).parent / "test_users.json"
OUTPUT_FILE  = Path(__file__).parent / "ws_results.json"

CONNECT_TIMEOUT_S = 45.0
MESSAGE_TIMEOUT_S = 15.0

_CHAT_MESSAGES = [
    "Hey team, any updates?",
    "I've pushed the latest changes.",
    "Can someone review my PR?",
    "The build is passing now.",
    "Working on the issue.",
    "Need help with this bug.",
    "Deployment is done.",
    "Stand-up in 5 minutes.",
]


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class WorkerStats:
    ws_type:          str           # 'activity' | 'chat' | 'notifications'
    user_email:       str
    connected:        bool  = False
    connect_time_ms:  float = 0.0
    messages_sent:    int   = 0
    messages_received: int  = 0
    latencies_ms:     list  = field(default_factory=list)
    errors:           list  = field(default_factory=list)
    disconnected:     bool  = False


@dataclass
class AggregateStats:
    total_attempted:    int  = 0
    total_connected:    int  = 0
    total_failed:       int  = 0
    total_disconnected: int  = 0
    all_latencies_ms:   list = field(default_factory=list)
    workers:            list = field(default_factory=list)


# ---------------------------------------------------------------------------
# HTTP auth helper
# ---------------------------------------------------------------------------

async def _get_jwt(session: aiohttp.ClientSession, email: str, password: str) -> Optional[str]:
    try:
        async with session.post(
            f"{HTTP_BASE}/api/auth/login/",
            json={"email": email, "password": password},
            timeout=aiohttp.ClientTimeout(total=45),
        ) as r:
            if r.status == 200:
                body = await r.json()
                return body.get("access")
    except Exception as exc:
        pass
    return None


async def _pre_authenticate(
    session: aiohttp.ClientSession,
    all_users: list,
    concurrency: int = 8,
) -> dict:
    """
    Pre-fetch JWT tokens for all users before launching WS workers.
    Uses a separate session per login to avoid shared-session timeouts.
    Returns {email: token_or_None} mapping.
    """
    sem    = asyncio.Semaphore(concurrency)
    tokens = {}

    async def _login_one(email: str, password: str):
        async with sem:
            for _attempt in range(3):   # retry up to 3 times on transient failure
                async with aiohttp.ClientSession() as s:
                    t = await _get_jwt(s, email, password)
                if t:
                    break
                await asyncio.sleep(0.5)
            tokens[email] = t

    unique_users = {u["email"]: u for u in all_users}.values()
    await asyncio.gather(*[
        _login_one(u["email"], u["password"]) for u in unique_users
    ])
    ok = sum(1 for t in tokens.values() if t)
    print(f"  Pre-auth: {ok}/{len(tokens)} tokens obtained")
    return tokens


# ---------------------------------------------------------------------------
# Worker coroutines
# ---------------------------------------------------------------------------

async def activity_worker(
    token:  str,
    stats:  WorkerStats,
    stop:   asyncio.Event,
):
    """Connects to ws/activity/, then sends a ping every 5 seconds."""
    if not token:
        stats.errors.append("login failed")
        return

    uri = f"{WS_BASE}/ws/activity/?token={token}"
    t0  = time.monotonic()
    try:
        async with ws_connect(
            uri, open_timeout=CONNECT_TIMEOUT_S, close_timeout=5, ping_interval=None,
            additional_headers=WS_HEADERS,
        ) as ws:
            stats.connected       = True
            stats.connect_time_ms = (time.monotonic() - t0) * 1000

            # Consume the initial_feed frame
            try:
                await asyncio.wait_for(ws.recv(), timeout=MESSAGE_TIMEOUT_S)
                stats.messages_received += 1
            except asyncio.TimeoutError:
                pass

            while not stop.is_set():
                try:
                    send_t = time.monotonic()
                    await ws.send(json.dumps({"type": "ping"}))
                    stats.messages_sent += 1

                    msg = await asyncio.wait_for(ws.recv(), timeout=MESSAGE_TIMEOUT_S)
                    stats.latencies_ms.append((time.monotonic() - send_t) * 1000)
                    stats.messages_received += 1

                    await asyncio.sleep(5)
                except asyncio.TimeoutError:
                    stats.errors.append("message timeout")
                except websockets.exceptions.ConnectionClosed as e:
                    stats.disconnected = True
                    stats.errors.append(f"closed: {e.code}")
                    break

    except Exception as exc:
        stats.connected = False
        stats.errors.append(f"connect error: {exc}")


async def chat_worker(
    token:   str,
    conv_id: int,
    stats:   WorkerStats,
    stop:    asyncio.Event,
):
    """
    Connects to ws/chat/direct/<conv_id>/, receives history,
    then sends typing indicators every 3 seconds to simulate live chat.
    """
    if not token:
        stats.errors.append("login failed")
        return

    uri = f"{WS_BASE}/ws/chat/direct/{conv_id}/?token={token}"
    t0  = time.monotonic()
    try:
        async with ws_connect(
            uri, open_timeout=CONNECT_TIMEOUT_S, close_timeout=5, ping_interval=None,
            additional_headers=WS_HEADERS,
        ) as ws:
            stats.connected       = True
            stats.connect_time_ms = (time.monotonic() - t0) * 1000

            # Consume history frame
            try:
                await asyncio.wait_for(ws.recv(), timeout=MESSAGE_TIMEOUT_S)
                stats.messages_received += 1
            except asyncio.TimeoutError:
                pass

            while not stop.is_set():
                try:
                    send_t = time.monotonic()
                    await ws.send(json.dumps({"type": "typing", "is_typing": True}))
                    stats.messages_sent += 1
                    await asyncio.sleep(1.5)

                    await ws.send(json.dumps({"type": "typing", "is_typing": False}))
                    stats.messages_sent += 1
                    stats.latencies_ms.append((time.monotonic() - send_t) * 1000)

                    await asyncio.sleep(1.5)
                except websockets.exceptions.ConnectionClosed as e:
                    stats.disconnected = True
                    stats.errors.append(f"closed: {e.code}")
                    break

    except Exception as exc:
        stats.connected = False
        stats.errors.append(f"connect error: {exc}")


async def notification_worker(
    token:  str,
    stats:  WorkerStats,
    stop:   asyncio.Event,
):
    """Connects to ws/notifications/ and stays as a passive listener."""
    if not token:
        stats.errors.append("login failed")
        return

    uri = f"{WS_BASE}/ws/notifications/?token={token}"
    t0  = time.monotonic()
    try:
        async with ws_connect(
            uri, open_timeout=CONNECT_TIMEOUT_S, close_timeout=5, ping_interval=None,
            additional_headers=WS_HEADERS,
        ) as ws:
            stats.connected       = True
            stats.connect_time_ms = (time.monotonic() - t0) * 1000

            # Consume initial unread_count frame
            try:
                await asyncio.wait_for(ws.recv(), timeout=MESSAGE_TIMEOUT_S)
                stats.messages_received += 1
            except asyncio.TimeoutError:
                pass

            while not stop.is_set():
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10)
                    stats.messages_received += 1
                except asyncio.TimeoutError:
                    pass   # No push — normal; just keep the connection alive
                except websockets.exceptions.ConnectionClosed as e:
                    stats.disconnected = True
                    stats.errors.append(f"closed: {e.code}")
                    break

    except Exception as exc:
        stats.connected = False
        stats.errors.append(f"connect error: {exc}")


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run(duration: int) -> AggregateStats:
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"test_users.json not found at {DATA_FILE}.\n"
            "Run: cd backend && python manage.py seed_load_test_data"
        )

    with open(DATA_FILE) as f:
        data = json.load(f)

    users        = data["users"][:]
    conv_ids     = data.get("conversation_ids", [])
    chat_workers = data.get("chat_workers", [])
    random.shuffle(users)

    if not conv_ids:
        print("WARNING: No conversation_ids in test_users.json. Chat workers skipped.")

    agg   = AggregateStats()
    stop  = asyncio.Event()
    tasks = []

    # Pool allocation: 40 activity, 30 chat (from pre-paired chat_workers), 30 notifications
    activity_pool      = users[:40]
    chat_pool          = chat_workers[:30] if chat_workers else []
    notification_pool  = users[70:100]

    connector = aiohttp.TCPConnector(limit=200)
    async with aiohttp.ClientSession(connector=connector) as session:

        # Pre-authenticate all users (bounded concurrency = 10) to avoid
        # hammering the auth endpoint with 100 simultaneous bcrypt operations.
        print("\nPre-authenticating all users (10 concurrent)...")
        all_users_unique = (
            list(activity_pool)
            + [{"email": cw["email"], "password": cw["password"]} for cw in chat_pool]
            + list(notification_pool)
        )
        token_map = await _pre_authenticate(session, all_users_unique, concurrency=10)

        all_stats: list[WorkerStats] = []

        for u in activity_pool:
            s = WorkerStats(ws_type="activity", user_email=u["email"])
            all_stats.append(s)
            agg.total_attempted += 1
            tasks.append(asyncio.create_task(
                activity_worker(token_map.get(u["email"]), s, stop)
            ))
            await asyncio.sleep(0.1)

        for cw in chat_pool:
            s = WorkerStats(ws_type="chat", user_email=cw["email"])
            all_stats.append(s)
            agg.total_attempted += 1
            tasks.append(asyncio.create_task(
                chat_worker(token_map.get(cw["email"]), cw["conv_id"], s, stop)
            ))
            await asyncio.sleep(0.1)

        for u in notification_pool:
            s = WorkerStats(ws_type="notifications", user_email=u["email"])
            all_stats.append(s)
            agg.total_attempted += 1
            tasks.append(asyncio.create_task(
                notification_worker(token_map.get(u["email"]), s, stop)
            ))
            await asyncio.sleep(0.1)

        print(f"\nLaunched {len(tasks)} WebSocket workers:")
        print(f"  Activity:      {len(activity_pool)}")
        print(f"  Chat:          {len(chat_pool)}")
        print(f"  Notifications: {len(notification_pool)}")
        print(f"\nWaiting 20s for connections to stabilise...")
        await asyncio.sleep(20)

        ok = sum(1 for s in all_stats if s.connected)
        print(f"  Connected: {ok}/{agg.total_attempted}  |  Running for {duration}s...")

        # Progress updates every 15s
        elapsed = 20
        interval = 15
        while elapsed < duration:
            wait = min(interval, duration - elapsed)
            await asyncio.sleep(wait)
            elapsed += wait
            ok_now = sum(1 for s in all_stats if s.connected and not s.disconnected)
            msgs = sum(s.messages_sent for s in all_stats)
            print(f"  t={elapsed:3d}s  alive={ok_now}  msgs_sent={msgs}")

        stop.set()
        await asyncio.gather(*tasks, return_exceptions=True)
        agg.workers = all_stats

    # Aggregate
    for s in all_stats:
        if s.connected:
            agg.total_connected += 1
        else:
            agg.total_failed += 1
        if s.disconnected:
            agg.total_disconnected += 1
        agg.all_latencies_ms.extend(s.latencies_ms)

    return agg


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _pct(sorted_lat: list, p: float) -> float:
    if not sorted_lat:
        return 0.0
    idx = max(0, int(p / 100 * len(sorted_lat)) - 1)
    return round(sorted_lat[idx], 2)


def _print_results(agg: AggregateStats):
    lat = sorted(agg.all_latencies_ms)
    avg = round(statistics.mean(lat), 2) if lat else 0.0

    print("\n" + "=" * 64)
    print("WebSocket Load Test — Results")
    print("=" * 64)
    print(f"  Attempted:    {agg.total_attempted}")
    print(f"  Connected:    {agg.total_connected}  "
          f"({agg.total_connected/max(agg.total_attempted,1)*100:.1f}%)")
    print(f"  Failed:       {agg.total_failed}")
    print(f"  Disconnected: {agg.total_disconnected}")

    for wt in ("activity", "chat", "notifications"):
        pool = [s for s in agg.workers if s.ws_type == wt]
        ok   = sum(1 for s in pool if s.connected)
        sent = sum(s.messages_sent for s in pool)
        recv = sum(s.messages_received for s in pool)
        disc = sum(1 for s in pool if s.disconnected)
        print(f"\n  [{wt}]")
        print(f"    Connected:   {ok}/{len(pool)}")
        print(f"    Msgs sent:   {sent}")
        print(f"    Msgs recv:   {recv}")
        print(f"    Disconnects: {disc}")

    print(f"\n  Message Latency ({len(lat)} samples):")
    print(f"    avg  = {avg} ms")
    print(f"    p50  = {_pct(lat, 50)} ms")
    print(f"    p95  = {_pct(lat, 95)} ms")
    print(f"    p99  = {_pct(lat, 99)} ms")
    print("=" * 64)


def _save_results(agg: AggregateStats):
    lat = sorted(agg.all_latencies_ms)
    avg = round(statistics.mean(lat), 2) if lat else 0.0

    out = {
        "total_attempted":    agg.total_attempted,
        "total_connected":    agg.total_connected,
        "total_failed":       agg.total_failed,
        "total_disconnected": agg.total_disconnected,
        "connection_rate_pct": round(
            agg.total_connected / max(agg.total_attempted, 1) * 100, 1
        ),
        "latency": {
            "samples": len(lat),
            "avg_ms":  avg,
            "p50_ms":  _pct(lat, 50),
            "p95_ms":  _pct(lat, 95),
            "p99_ms":  _pct(lat, 99),
        },
        "by_type": {
            wt: {
                "attempted":      sum(1 for s in agg.workers if s.ws_type == wt),
                "connected":      sum(1 for s in agg.workers if s.ws_type == wt and s.connected),
                "disconnected":   sum(1 for s in agg.workers if s.ws_type == wt and s.disconnected),
                "messages_sent":  sum(s.messages_sent for s in agg.workers if s.ws_type == wt),
                "messages_recv":  sum(s.messages_received for s in agg.workers if s.ws_type == wt),
            }
            for wt in ("activity", "chat", "notifications")
        },
    }
    with open(OUTPUT_FILE, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\n  Results saved -> {OUTPUT_FILE}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="CRM WebSocket load test")
    ap.add_argument("--duration", type=int, default=60,  help="Test duration in seconds")
    ap.add_argument("--host",     type=str, default="ws://localhost:8000")
    args = ap.parse_args()

    WS_BASE   = args.host
    HTTP_BASE = args.host.replace("ws://", "http://").replace("wss://", "https://")
    WS_HEADERS["Origin"] = HTTP_BASE

    print(f"CRM WebSocket Load Test")
    print(f"  Host:     {WS_BASE}")
    print(f"  Duration: {args.duration}s")
    print(f"  Targets:  40 activity  +  30 chat  +  30 notifications  = 100 connections")

    t0  = time.time()
    agg = asyncio.run(run(duration=args.duration))
    _print_results(agg)
    _save_results(agg)
    print(f"\n  Elapsed: {time.time()-t0:.1f}s")
