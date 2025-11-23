#!/usr/bin/env python3
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def parse_ts(ts_str: Optional[str]) -> float:
    if not ts_str:
        return 0.0
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def ts_fmt(ts: Optional[float]) -> str:
    if ts is None:
        return "N/A"
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone().isoformat()
    except Exception:
        return str(ts)


def load_exported(session_id: str, path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    events: List[Dict[str, Any]] = []
    seen_session = False
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            payload = obj.get("payload") or {}
            if obj.get("type") == "session_meta" and payload.get("id") == session_id:
                seen_session = True
                continue
            if not seen_session:
                continue
            if obj.get("type") != "response_item":
                continue
            if payload.get("type") != "message":
                continue
            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue
            parts = [
                c.get("text", "")
                for c in payload.get("content", [])
                if isinstance(c, dict) and c.get("text")
            ]
            events.append({
                "ts": parse_ts(obj.get("timestamp")),
                "role": role,
                "text": "\n".join(parts),
            })
    events.sort(key=lambda e: e.get("ts") or 0.0)
    return events


def build_prompts(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prompts: List[Dict[str, Any]] = []
    for e in events:
        role, text, ts = e.get("role"), e.get("text", ""), e.get("ts")
        if not text:
            continue
        if role == "user":
            prompts.append({"ts": ts, "prompt_text": text, "responses": []})
        elif role == "assistant" and prompts:
            prompts[-1]["responses"].append(text)
    return prompts


def write_md(prompts: List[Dict[str, Any]], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8") as f:
        counter = 0
        for p in prompts:
            counter += 1
            f.write(f"Prompt #{counter}:\n")
            f.write(f"Timestamp: {ts_fmt(p['ts'])}\n")
            f.write(f"Prompt: {p['prompt_text']}\n")
            f.write("Response:\n")
            resp = "\n".join(p.get("responses") or [])
            f.write(f"{resp if resp.strip() else '[no response captured]'}\n\n")
            f.write("-" * 80 + "\n\n")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 export_development_history.py <session_tag>")
        sys.exit(1)
    session_tag = sys.argv[1]
    session_id = session_tag.split("_")[0]
    base = Path(__file__).resolve().parent
    export_path = base / f"{session_tag}.jsonl"
    events = load_exported(session_id, export_path)
    if not events:
        print(f"No events found in {export_path}; run export_codex_session.py first.")
        sys.exit(0)
    prompts = build_prompts(events)
    out_path = base / f"{session_tag}_history.md"
    write_md(prompts, out_path)
    print(f"Wrote {len(prompts)} prompts to {out_path}")


if __name__ == "__main__":
    main()
