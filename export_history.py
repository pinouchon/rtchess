#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


def run(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main():
    # No args: enumerate sessions via find_sessions.py and export each
    dev_dir = Path(__file__).resolve().parent / "dev_history"
    # get session list
    result = subprocess.run(
        ["python3", "find_sessions.py"],
        cwd=dev_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(result.returncode)
    session_tags = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not session_tags:
        print("No sessions found.")
        sys.exit(0)
    for tag in session_tags:
        run(["python3", "export_codex_session.py", tag], cwd=dev_dir)
        run(["python3", "export_development_history.py", tag], cwd=dev_dir)


if __name__ == "__main__":
    main()
