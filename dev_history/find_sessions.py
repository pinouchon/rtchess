#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def main() -> None:
    target = Path(__file__).resolve().parent.parent.name  # project folder name, e.g., rtchess
    history_path = Path.home() / ".codex" / "history.jsonl"

    # Collect unique session IDs from history
    session_ts: Dict[str, float] = {}
    if history_path.exists():
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
                ts = obj.get("ts")
                if sid is None:
                    continue
                if sid not in session_ts or (ts is not None and ts < session_ts[sid]):
                    session_ts[sid] = ts if ts is not None else 0.0

    if not session_ts:
        print(f"No sessions found for project {target}")
        return

    matched: List[Tuple[str, float]] = []
    for sid, ts in session_ts.items():
        # Export session meta to temp file and read cwd from session_meta
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            subprocess.run(
                ["codex", "session", "export", "--session-id", sid, "--output", str(tmp_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if not tmp_path.exists():
                continue
            cwd_name: Optional[str] = None
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
                    cwd = payload.get("cwd")
                    if cwd:
                        cwd_name = Path(cwd).name
                        break
            if cwd_name == target:
                matched.append((sid, ts))
        finally:
            try:
                tmp_path.unlink()
            except Exception:
                pass

    if not matched:
        print(f"No sessions found for project {target}")
        return

    matched.sort(key=lambda x: x[1])
    for idx, (sid, _ts) in enumerate(matched, start=1):
        print(f"{sid}_{target}_{idx}")


if __name__ == "__main__":
    main()
