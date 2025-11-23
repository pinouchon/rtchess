#!/usr/bin/env python3
import json
import subprocess
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


def collect_session_events() -> Dict[str, dict]:
    sessions_dir = Path.home() / ".codex" / "sessions"
    if not sessions_dir.exists():
        return {}
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


def collect_commits() -> List[dict]:
    cmd = [
        "git",
        "-C",
        str(PROJECT_ROOT),
        "log",
        "--pretty=format:%H%x1f%ct%x1f%B%x1e",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return []
    if result.returncode != 0 or not result.stdout:
        return []
    commits: List[dict] = []
    for record in result.stdout.split("\x1e"):
        if not record.strip():
            continue
        parts = record.split("\x1f")
        if len(parts) < 3:
            continue
        hash_str = parts[0].strip()
        ts_raw = parts[1].strip()
        message = "\x1f".join(parts[2:]).strip()
        try:
            ts_val = float(ts_raw)
        except Exception:
            ts_val = 0.0
        commits.append({"ts": ts_val, "hash": hash_str, "message": message})
    return commits


def build_prompt_entries(events: List[dict]) -> List[dict]:
    prompts: List[dict] = []
    last_prompt_by_sid: Dict[str, dict] = {}
    for event in sorted(events, key=lambda e: e.get("ts") or 0.0):
        role = event.get("role")
        text = event.get("text", "")
        ts = event.get("ts") or 0.0
        sid = event.get("sid", "")
        if role == "user":
            prompt_entry = {"ts": ts, "prompt": text, "responses": [], "sid": sid}
            prompts.append(prompt_entry)
            if sid:
                last_prompt_by_sid[sid] = prompt_entry
        elif role == "assistant" and sid and sid in last_prompt_by_sid:
            last_prompt_by_sid[sid]["responses"].append(text)
    return prompts


def build_timeline_entries(prompts: List[dict], commits: List[dict]) -> List[dict]:
    entries: List[dict] = []
    for p in prompts:
        entries.append({"type": "prompt", **p})
    for c in commits:
        entries.append({"type": "commit", **c})
    return sorted(entries, key=lambda e: e.get("ts") or 0.0)


def write_dev_history(entries: List[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        f.write(f"{SEPARATOR}\n\n")
        prompt_counter = 0
        commit_counter = 0
        for entry in entries:
            if entry.get("type") == "prompt":
                prompt_counter += 1
                f.write(f"Prompt #{prompt_counter}:\n")
                f.write(f"Id: {entry.get('sid', '')}\n")
                f.write(f"Timestamp: {ts_display(entry.get('ts') or 0.0)}\n")
                f.write("Prompt:\n")
                f.write(f"{entry.get('prompt', '')}\n")
                f.write("Response:\n")
                response_text = "\n\n".join(entry.get("responses") or [])
                f.write(f"{response_text}\n\n")
            else:
                commit_counter += 1
                f.write(f"Commit #{commit_counter}:\n")
                f.write(f"Hash: {entry.get('hash', '')}\n")
                f.write(f"Timestamp: {ts_display(entry.get('ts') or 0.0)}\n")
                f.write("Message:\n")
                f.write(f"{entry.get('message', '')}\n\n")
            f.write(f"{SEPARATOR}\n\n")


def main() -> None:
    sessions = collect_session_events()
    all_events: List[dict] = []
    if sessions:
        ordered = sorted(sessions.items(), key=lambda item: item[1].get("meta_ts") or 0.0)
        for _sid, data in ordered:
            all_events.extend(data.get("events") or [])
    prompts = build_prompt_entries(all_events)
    commits = collect_commits()
    if not prompts and not commits:
        print("No prompts or commits found.")
        return
    entries = build_timeline_entries(prompts, commits)
    output_path = PROJECT_ROOT / "dev_history.md"
    write_dev_history(entries, output_path)
    print(
        f"Wrote {len(entries)} entries (prompts: {len(prompts)}, commits: {len(commits)}) to {output_path.name}"
    )


if __name__ == "__main__":
    main()
