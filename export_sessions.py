#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent
SEPARATOR = "-" * 80


def parse_ts(ts_str: Optional[str]) -> float:
    if not ts_str:
        return 0.0
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def ts_display(ts: float) -> str:
    if ts <= 0:
        return "N/A"
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone().isoformat()
    except Exception:
        return "N/A"


def session_matches(session_cwd: str) -> bool:
    if not session_cwd:
        return False
    try:
        cwd_path = Path(session_cwd).expanduser().resolve()
        return PROJECT_ROOT == cwd_path or PROJECT_ROOT in cwd_path.parents
    except Exception:
        return str(PROJECT_ROOT) in session_cwd or PROJECT_ROOT.name in session_cwd


def gather_sessions() -> Dict[str, dict]:
    sessions_dir = Path.home() / ".codex" / "sessions"
    sessions: Dict[str, dict] = {}
    for path in sessions_dir.rglob("*.jsonl"):
        current_sid: Optional[str] = None
        try:
            with path.open(encoding="utf-8") as f:
                for raw in f:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        obj = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    payload = obj.get("payload") or {}
                    if obj.get("type") == "session_meta":
                        sid = payload.get("id")
                        if not sid:
                            current_sid = None
                            continue
                        meta_ts = parse_ts(payload.get("timestamp") or obj.get("timestamp"))
                        cwd = payload.get("cwd", "")
                        sess = sessions.setdefault(
                            sid,
                            {"meta_ts": meta_ts, "cwd": cwd, "events": [], "relevant": False},
                        )
                        if meta_ts and (sess.get("meta_ts") or 0) == 0:
                            sess["meta_ts"] = meta_ts
                        elif meta_ts and meta_ts < (sess.get("meta_ts") or meta_ts):
                            sess["meta_ts"] = meta_ts
                        sess["cwd"] = sess.get("cwd") or cwd
                        sess["relevant"] = sess["relevant"] or session_matches(cwd)
                        current_sid = sid
                        continue
                    if obj.get("type") != "response_item" or not current_sid:
                        continue
                    if not sessions.get(current_sid, {}).get("relevant"):
                        continue
                    if payload.get("type") != "message":
                        continue
                    role = payload.get("role")
                    if role not in ("user", "assistant"):
                        continue
                    text_parts = []
                    for c in payload.get("content", []):
                        if isinstance(c, dict) and isinstance(c.get("text"), str):
                            text_parts.append(c["text"])
                    text = "\n".join(text_parts).strip()
                    if not text:
                        continue
                    sessions[current_sid]["events"].append(
                        {
                            "ts": parse_ts(obj.get("timestamp")),
                            "role": role,
                            "text": text,
                            "sid": current_sid,
                        }
                    )
        except Exception:
            continue
    return {sid: data for sid, data in sessions.items() if data.get("relevant") and data.get("events")}


def build_prompts(events: List[dict]) -> List[dict]:
    prompts: List[dict] = []
    for event in sorted(events, key=lambda e: e.get("ts") or 0.0):
        role = event.get("role")
        text = event.get("text", "")
        ts = event.get("ts") or 0.0
        sid = event.get("sid", "")
        if role == "user":
            prompts.append({"ts": ts, "prompt": text, "responses": [], "sid": sid})
        elif role == "assistant" and prompts and prompts[-1].get("sid") == sid:
            prompts[-1]["responses"].append(text)
    return prompts


def write_history(prompts: List[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        f.write(f"{SEPARATOR}\n\n")
        for idx, prompt in enumerate(prompts, start=1):
            f.write(f"Prompt #{idx}:\n")
            f.write(f"Id: {prompt.get('sid', '')}\n")
            f.write(f"Timestamp: {ts_display(prompt.get('ts') or 0.0)}\n")
            f.write("Prompt:\n")
            f.write(f"{prompt.get('prompt', '')}\n")
            f.write("Response:\n")
            response_text = "\n\n".join(prompt.get("responses") or [])
            f.write(f"{response_text}\n\n")
            f.write(f"{SEPARATOR}\n\n")


def main() -> None:
    sessions = gather_sessions()
    if not sessions:
        print("No relevant sessions found.")
        return
    all_events: List[dict] = []
    ordered = sorted(sessions.items(), key=lambda item: item[1].get("meta_ts") or 0.0)
    for _sid, data in ordered:
        all_events.extend(data.get("events") or [])
    prompts = build_prompts(all_events)
    if not prompts:
        print("No prompts found in matching sessions.")
        return
    write_history(prompts, PROJECT_ROOT / "history.md")
    print(f"Wrote {len(prompts)} prompts to history.md")


if __name__ == "__main__":
    main()
