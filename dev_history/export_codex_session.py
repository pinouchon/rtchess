#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 export_codex_session.py <session_tag>")
        sys.exit(1)
    session_tag = sys.argv[1]
    session_id = session_tag.split("_")[0]
    out_path = Path(f"{session_tag}.jsonl")

    dev_export = Path(__file__).resolve().parent / "exported-session.jsonl"
    root_export = Path(__file__).resolve().parent.parent / "exported-session.jsonl"
    source = dev_export if dev_export.exists() else root_export

    if source.exists():
        out_path.write_bytes(source.read_bytes())
    else:
        result = subprocess.run(
            ["codex", "session", "export", "--session-id", session_id, "--output", str(out_path)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not out_path.exists() or out_path.stat().st_size == 0:
            print(f"Failed to export session {session_id} to {out_path}")
            sys.exit(1)

    print(f"Exported session {session_id} to {out_path}")


if __name__ == "__main__":
    main()
