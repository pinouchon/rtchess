#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def parse_ts(ts_str: Optional[str]) -> float:
    if not ts_str:
        return 0.0
    try:
        from datetime import datetime
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
    except Exception:
        try:
            return float(ts_str)
        except Exception:
            return 0.0


def get_session_ids_from_cli() -> List[str]:
    try:
        result = subprocess.run(
            ["codex", "session", "list", "--format", "json"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return []
        data = json.loads(result.stdout)
        if isinstance(data, list):
            return [d.get("id") for d in data if isinstance(d, dict) and d.get("id")]
    except Exception:
        return []
    return []


def get_session_ids_from_history(history_path: Path) -> List[str]:
    ids: List[str] = []
    if not history_path.exists():
        return ids
    seen = set()
    with history_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            sid = obj.get("session_id")
            if sid and sid not in seen:
                seen.add(sid)
                ids.append(sid)
    return ids


def parse_export_file(path: Path) -> Optional[Tuple[str, str, float]]:
    if not path.exists():
        return None
    sid = None
    cwd_val = None
    ts_val = 0.0
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get("type") != "session_meta":
                    continue
                payload = obj.get("payload") or {}
                sid = payload.get("id")
                cwd_val = payload.get("cwd")
                ts_val = parse_ts(obj.get("timestamp") or payload.get("timestamp"))
                break
    except Exception:
        return None
    if sid and cwd_val:
        return sid, cwd_val, ts_val
    return None


def cwd_for_session(session_id: str) -> Optional[Tuple[str, float]]:
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            ["codex", "session", "export", "--session-id", session_id, "--output", str(tmp_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if not tmp_path.exists():
            return None
        cwd_value = None
        ts_value = 0.0
        with tmp_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("type") != "session_meta":
                    continue
                payload = obj.get("payload") or {}
                cwd_value = payload.get("cwd")
                ts_value = parse_ts(obj.get("timestamp") or payload.get("timestamp"))
                break
        if cwd_value:
            return cwd_value, ts_value
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass
    return None


def main() -> None:
    project = Path(__file__).resolve().parent.parent.name
    history_path = Path.home() / ".codex" / "history.jsonl"

    # Try direct exports from files
    matches: List[Tuple[str, float, str]] = []
    for candidate in [
        Path(__file__).resolve().parent.parent / "exported-session.jsonl",
        Path(__file__).resolve().parent / "exported-session.jsonl",
    ]:
        parsed = parse_export_file(candidate)
        if parsed:
            sid, cwd_value, ts = parsed
            if Path(cwd_value).name == project or project in Path(cwd_value).parts:
                matches.append((sid, ts, cwd_value))

    if not matches:
        ids = get_session_ids_from_cli()
        if not ids:
            ids = get_session_ids_from_history(history_path)
        for sid in ids:
            meta = cwd_for_session(sid)
            if not meta:
                continue
            cwd_value, ts = meta
            if Path(cwd_value).name == project or project in Path(cwd_value).parts:
                matches.append((sid, ts, cwd_value))

    if not matches:
        print(f"No sessions found for project {project}")
        return

    matches.sort(key=lambda x: x[1])
    seen = set()
    idx = 0
    for sid, _ts, _cwd in matches:
        if sid in seen:
            continue
        seen.add(sid)
        idx += 1
        print(f"{sid}_{project}_{idx}")


if __name__ == "__main__":
    main()
