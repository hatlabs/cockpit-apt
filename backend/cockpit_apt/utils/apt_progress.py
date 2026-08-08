"""
Shared apt-get subprocess progress utilities.

Provides parse_status_line() and run_apt_command() for running apt-get commands
with Status-Fd progress reporting. Used by install, upgrade, and remove commands.
"""

import json
import os
import select
import subprocess
from collections.abc import Callable
from typing import Any

from cockpit_apt.utils.errors import APTBridgeError

_READ_SIZE = 65536

# How long select() waits before re-checking whether the child is still alive.
_POLL_INTERVAL_SECONDS = 0.1


def parse_status_line(line: str) -> dict[str, Any] | None:
    """
    Parse apt-get Status-Fd output line.

    Status-Fd formats:
    - pmstatus:package:percentage:message
    - dlstatus:package:percentage:message

    Returns:
        dict with percentage and message, or None if not a status line
    """
    if not line:
        return None

    parts = line.split(":", 3)
    if len(parts) < 4:
        return None

    status_type, package, percent_str, message = parts

    if status_type not in ("pmstatus", "dlstatus"):
        return None

    try:
        percentage = float(percent_str)
        return {
            "percentage": int(percentage),
            "message": message.strip() or f"Processing {package}...",
        }
    except ValueError:
        return None


def _pump_output(
    process: "subprocess.Popen[bytes]", status_read: int, monotonic_progress: bool
) -> str:
    """
    Drain the status pipe and stderr until the child is finished, printing progress.

    Both have to be read while apt runs, not after it exits: a pipe nobody reads
    fills at 64 KiB and blocks the writer, and apt easily writes more than that.

    Returns:
        The child's accumulated stderr.
    """
    assert process.stderr is not None
    stderr_fd = process.stderr.fileno()

    open_fds = [status_read, stderr_fd]
    stderr_chunks: list[bytes] = []
    status_buffer = ""
    last_percentage = 0

    while open_fds:
        ready, _, _ = select.select(open_fds, [], [], _POLL_INTERVAL_SECONDS)

        if not ready:
            # Nothing left to read and the child is gone. A descriptor inherited
            # by a lingering grandchild would otherwise keep this loop running
            # long after apt itself finished.
            if process.poll() is not None:
                break
            continue

        for fd in ready:
            chunk = os.read(fd, _READ_SIZE)

            if not chunk:
                open_fds.remove(fd)
                continue

            if fd == stderr_fd:
                stderr_chunks.append(chunk)
                continue

            status_buffer += chunk.decode("utf-8", errors="replace")

            while "\n" in status_buffer:
                line, status_buffer = status_buffer.split("\n", 1)
                progress_info = parse_status_line(line.strip())

                if not progress_info:
                    continue
                if monotonic_progress and progress_info["percentage"] <= last_percentage:
                    continue

                last_percentage = progress_info["percentage"]
                print(
                    json.dumps({
                        "type": "progress",
                        "percentage": progress_info["percentage"],
                        "message": progress_info["message"],
                    }),
                    flush=True,
                )

    process.stderr.close()
    process.wait()

    return b"".join(stderr_chunks).decode("utf-8", errors="replace")


def run_apt_command(
    cmd: list[str],
    *,
    monotonic_progress: bool = True,
    success_message: str,
    success_result: dict[str, Any],
    error_code: str,
    error_message: str,
    internal_error_message: str,
    classify_error: Callable[[str], APTBridgeError | None] | None = None,
) -> None:
    """
    Run an apt-get command with Status-Fd progress reporting.

    Sets up a pipe for apt-get's Status-Fd, appends the matching
    `-o APT::Status-Fd=<n>` to the command, reads progress updates via select(),
    and outputs JSON progress lines to stdout.

    Args:
        cmd: The apt-get command to run, without the Status-Fd option.
        monotonic_progress: If True, only report strictly increasing percentages.
            Use False for upgrade where progress resets per package.
        success_message: Message for the final 100% progress line.
        success_result: Dict to print as the final JSON result on success.
        error_code: Error code for generic (unclassified) failures.
        error_message: Error message for generic failures.
        internal_error_message: Message for wrapping unexpected exceptions.
        classify_error: Optional callback for command-specific error classification.
            Receives stderr string, returns APTBridgeError or None to fall through.
    """
    try:
        status_read, status_write = os.pipe()

        try:
            # apt writes progress to the descriptor number it is given, and
            # pass_fds keeps the pipe at whatever number os.pipe() handed out --
            # it does not renumber it. Naming a fixed number here would point apt
            # at a descriptor closed in the child, and every update would be lost.
            process = subprocess.Popen(
                [*cmd, "-o", f"APT::Status-Fd={status_write}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                pass_fds=(status_write,),
                env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"},
            )
        except Exception:
            os.close(status_read)
            os.close(status_write)
            raise

        os.close(status_write)

        try:
            stderr = _pump_output(process, status_read, monotonic_progress)
        finally:
            os.close(status_read)

        if process.returncode != 0:
            if classify_error:
                err = classify_error(stderr)
                if err:
                    raise err

            if "dpkg was interrupted" in stderr:
                raise APTBridgeError(
                    "Package manager is locked", code="LOCKED", details=stderr
                )
            elif "You don't have enough free space" in stderr:
                raise APTBridgeError(
                    "Insufficient disk space", code="DISK_FULL", details=stderr
                )
            else:
                raise APTBridgeError(error_message, code=error_code, details=stderr)

        print(
            json.dumps({"type": "progress", "percentage": 100, "message": success_message}),
            flush=True,
        )
        print(json.dumps(success_result), flush=True)

    except APTBridgeError:
        raise
    except Exception as e:
        raise APTBridgeError(
            internal_error_message, code="INTERNAL_ERROR", details=str(e)
        ) from e
