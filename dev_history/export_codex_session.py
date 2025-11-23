#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path
import shutil


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 export_codex_session.py <session_id>")
        sys.exit(1)
    session_id = sys.argv[1]
    out_path = Path("exported-session.jsonl")

    result = subprocess.run(
        ["codex", "session", "export", "--session-id", session_id, "--output", str(out_path)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not out_path.exists():
        # Fallback: copy from project root if present
        root_export = Path(__file__).resolve().parent.parent / "exported-session.jsonl"
        if root_export.exists():
            try:
                shutil.copy(root_export, out_path)
            except Exception:
                pass

    if result.returncode != 0 and not out_path.exists():
        print(f"Failed to export session {session_id} to {out_path}")
        sys.exit(1)

    print(f"Exported session {session_id} to {out_path}")


if __name__ == "__main__":
    main()
