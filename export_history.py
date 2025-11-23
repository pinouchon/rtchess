#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


def run(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 export_history.py <session_id>")
        sys.exit(1)
    session_id = sys.argv[1]
    dev_dir = Path(__file__).resolve().parent / "dev_history"
    run(["python3", "export_codex_session.py", session_id], cwd=dev_dir)
    run(["python3", "export_development_history.py", session_id], cwd=dev_dir)


if __name__ == "__main__":
    main()
