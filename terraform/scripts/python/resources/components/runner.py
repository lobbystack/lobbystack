import os
import subprocess

from .ui import DIM, RESET


def run(cmd: list[str], cwd: str | None = None) -> int:
    """Run a command, print it, and return its exit code. Its output streams to the terminal as it happens."""

    def _rel(p: str) -> str:
        try:
            return os.path.relpath(p) if os.path.isabs(p) else p
        except ValueError:
            return p

    print(f"\n{DIM}  $ {' '.join(_rel(p) for p in cmd)}{RESET}\n")
    return subprocess.run(cmd, cwd=cwd, check=False).returncode


def run_capture(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    """Run a command silently and return (exit_code, stdout)."""
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    return result.returncode, result.stdout
