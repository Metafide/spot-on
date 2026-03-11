"""
===============================================================================
METAFIDE BOT CLI — index.py
===============================================================================

This file is the command-line entry point for the bot.

It provides a small process manager so the bot can be:
  - run in the foreground
  - started in the background
  - stopped later using a command
  - checked for status
  - inspected via log output

Supported commands:
  python index.py run
  python index.py start
  python index.py stop
  python index.py status
  python index.py logs
===============================================================================
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

# Base directory of the current file.
BASE_DIR = Path(__file__).resolve().parent

# Files used by the CLI process manager.
#
# PID_FILE:
#   Stores the process ID of the background bot process.
#
# LOG_FILE:
#   Stores the stdout/stderr output of the background bot.
PID_FILE = BASE_DIR / ".metafide-bot.pid"
LOG_FILE = BASE_DIR / "metafide-bot.log"
RUNNER_FILE = BASE_DIR / "runner.py"


def get_command() -> str:
    """
    Returns the CLI command passed by the user.

    Defaults to "run" if no command is given.
    """
    return sys.argv[1] if len(sys.argv) > 1 else "run"


def read_pid() -> int | None:
    """
    Reads the PID file and returns the stored process ID.

    Returns:
      - a valid integer PID if present
      - None if the file does not exist or is invalid
    """
    if not PID_FILE.exists():
        return None

    raw = PID_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return None

    try:
        return int(raw)
    except ValueError:
        return None


def is_process_running(pid: int | None) -> bool:
    """
    Checks whether a process is currently running for a given PID.
    """
    if not pid:
        return False

    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def remove_pid_file() -> None:
    """
    Deletes the PID file if it exists.
    """
    if PID_FILE.exists():
        PID_FILE.unlink()


def ensure_stale_pid_is_cleared() -> None:
    """
    Cleans up a stale PID file.
    """
    pid = read_pid()
    if pid and not is_process_running(pid):
        remove_pid_file()


def start_bot() -> None:
    """
    Starts the bot in background mode.

    Flow:
      1. Remove stale PID file if needed
      2. Refuse to start if bot is already running
      3. Open the log file in append mode
      4. Spawn a detached Python process running runner.py
      5. Save child PID to PID file
    """
    ensure_stale_pid_is_cleared()

    existing_pid = read_pid()
    if existing_pid and is_process_running(existing_pid):
        print(f"Bot is already running with PID {existing_pid}")
        return

    log_handle = open(LOG_FILE, "a", encoding="utf-8")

    if os.name == "nt":
        # Windows detached process flags
        creationflags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        process = subprocess.Popen(
            [sys.executable, str(RUNNER_FILE)],
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=log_handle,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    else:
        # Unix-style detached process
        process = subprocess.Popen(
            [sys.executable, str(RUNNER_FILE)],
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=log_handle,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )

    PID_FILE.write_text(str(process.pid), encoding="utf-8")

    print(f"Bot started in background. PID: {process.pid}")
    print(f"Logs: {LOG_FILE}")


def stop_bot() -> None:
    """
    Stops the background bot process using the PID file.
    """
    pid = read_pid()

    if not pid:
        print("Bot is not running.")
        return

    if not is_process_running(pid):
        print(f"Found stale PID file for PID {pid}. Cleaning up.")
        remove_pid_file()
        return

    try:
        if os.name == "nt":
            os.kill(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)

        remove_pid_file()
        print(f"Bot stopped. PID: {pid}")
    except OSError as error:
        print(f"Failed to stop bot with PID {pid}: {error}")


def show_status() -> None:
    """
    Displays whether the bot is currently running.
    """
    ensure_stale_pid_is_cleared()

    pid = read_pid()
    if not pid:
        print("Bot is not running.")
        return

    if is_process_running(pid):
        print(f"Bot is running. PID: {pid}")
    else:
        print(f"Bot is not running, stale PID file found for PID {pid}.")
        remove_pid_file()


def show_logs(lines: int = 50) -> None:
    """
    Prints the last N lines of the log file.
    """
    if not LOG_FILE.exists():
        print("No log file found yet.")
        return

    content = LOG_FILE.read_text(encoding="utf-8")
    all_lines = content.splitlines()
    tail = all_lines[-lines:]
    print("\n".join(tail))


def run_foreground() -> None:
    """
    Runs the bot in the current terminal session.

    This is foreground mode.
    """
    from runner import run_bot

    run_bot()


def main() -> None:
    """
    Main CLI dispatcher.
    """
    command = get_command()

    if command == "run":
        run_foreground()
    elif command == "start":
        start_bot()
    elif command == "stop":
        stop_bot()
    elif command == "status":
        show_status()
    elif command == "logs":
        show_logs()
    else:
        print(f"Unknown command: {command}")
        print("Usage: python index.py [run|start|stop|status|logs]")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"CLI error: {error}")
        sys.exit(1)