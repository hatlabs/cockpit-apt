"""
Shared apt-get subprocess progress utilities.

Provides parse_status_line() and run_apt_command() for running apt-get commands
with Status-Fd progress reporting. Used by install, upgrade, and remove commands.
"""

import codecs
import json
import os
import select
import subprocess
from collections.abc import Callable
from typing import Any

from cockpit_apt.utils.errors import APTBridgeError

READ_SIZE = 65536

# apt reports the download and the dpkg run as two independent 0-100 scales.
# This is how much of the reported bar the download occupies when there is one,
# so a run produces one rising sequence instead of filling the bar twice.
DOWNLOAD_SHARE = 50

# How long select() waits before re-checking whether the child is still alive.
_POLL_INTERVAL_SECONDS = 0.1

_DOWNLOAD_PHASE = "dlstatus"
_DPKG_PHASE = "pmstatus"


def parse_status_line(line: str) -> dict[str, Any] | None:
    """
    Parse apt-get Status-Fd output line.

    Status-Fd formats:
    - pmstatus:package:percentage:message
    - dlstatus:package:percentage:message

    Returns:
        dict with phase, percentage and message, or None if not a status line
    """
    if not line:
        return None

    parts = line.split(":", 3)
    if len(parts) < 4:
        return None

    status_type, package, percent_str, message = parts

    if status_type not in (_DPKG_PHASE, _DOWNLOAD_PHASE):
        return None

    try:
        percentage = int(float(percent_str))
    except (ValueError, OverflowError):
        return None

    return {
        "phase": status_type,
        "percentage": percentage,
        "message": message.strip() or f"Processing {package}...",
    }


def _emit(payload: dict[str, Any]) -> bool:
    """
    Write one JSON line to stdout, reporting whether the consumer is still there.

    Losing the reporting channel must not abort the operation: stdout is the
    cockpit.spawn channel, which goes away when the browser does, while the apt
    transaction it describes runs as root and still has to finish.
    """
    try:
        print(json.dumps(payload), flush=True)
        return True
    except (BrokenPipeError, OSError):
        return False


def _report_percentage(phase: str, percentage: int, saw_download: bool) -> int:
    """Map a phase-local percentage onto the single scale the consumer sees."""
    if phase == _DOWNLOAD_PHASE:
        return percentage * DOWNLOAD_SHARE // 100
    if saw_download:
        return DOWNLOAD_SHARE + percentage * (100 - DOWNLOAD_SHARE) // 100
    return percentage


def _pump_output(process: "subprocess.Popen[bytes]", status_read: int) -> str:
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
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    status_buffer = ""
    last_percentage = 0
    saw_download = False
    reporting = True

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
            chunk = os.read(fd, READ_SIZE)

            if not chunk:
                open_fds.remove(fd)
                continue

            if fd == stderr_fd:
                stderr_chunks.append(chunk)
                continue

            # Incremental, so a character straddling a read boundary is held
            # until the rest of its bytes arrive.
            status_buffer += decoder.decode(chunk)

            while "\n" in status_buffer:
                line, status_buffer = status_buffer.split("\n", 1)
                progress_info = parse_status_line(line.strip())

                if not progress_info:
                    continue

                saw_download = saw_download or progress_info["phase"] == _DOWNLOAD_PHASE
                percentage = _report_percentage(
                    progress_info["phase"], progress_info["percentage"], saw_download
                )

                if percentage <= last_percentage:
                    continue

                last_percentage = percentage

                if reporting:
                    reporting = _emit({
                        "type": "progress",
                        "percentage": percentage,
                        "message": progress_info["message"],
                    })

    return b"".join(stderr_chunks).decode("utf-8", errors="replace")


def run_apt_command(
    cmd: list[str],
    *,
    success_message: str,
    success_result: dict[str, Any],
    error_code: str,
    error_message: str,
    internal_error_message: str,
    classify_error: Callable[[str], APTBridgeError | None] | None = None,
) -> None:
    """
    Run an apt-get command with Status-Fd progress reporting.

    Sets up a pipe for apt-get's Status-Fd, reads progress updates via select(),
    and outputs JSON progress lines to stdout.

    Args:
        cmd: The apt-get command to run, without the Status-Fd option. The option
            is appended last, so a caller must not terminate cmd with `--`.
        success_message: Message for the final 100% progress line.
        success_result: Dict to print as the final JSON result on success.
        error_code: Error code for generic (unclassified) failures.
        error_message: Error message for generic failures.
        internal_error_message: Message for wrapping unexpected exceptions.
        classify_error: Optional callback for command-specific error classification.
            Receives stderr string, returns APTBridgeError or None to fall through.
    """
    if any("APT::Status-Fd" in arg or arg == "--" for arg in cmd):
        raise APTBridgeError(
            internal_error_message,
            code="INTERNAL_ERROR",
            details="cmd must not set APT::Status-Fd or end option parsing with --",
        )

    try:
        status_read, status_write = os.pipe()

        try:
            # apt writes progress to the descriptor number it is given, and
            # pass_fds keeps the pipe at whatever number os.pipe() handed out --
            # it preserves a descriptor rather than renumbering it.
            process = subprocess.Popen(
                [*cmd, "-o", f"APT::Status-Fd={status_write}"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                pass_fds=(status_write,),
                env={**os.environ, "DEBIAN_FRONTEND": "noninteractive", "LC_ALL": "C"},
            )
        except Exception:
            os.close(status_read)
            os.close(status_write)
            raise

        os.close(status_write)

        try:
            stderr = _pump_output(process, status_read)
        finally:
            # Reap even if the pump raised: abandoning a running dpkg leaves the
            # package half-configured and the lock held.
            os.close(status_read)
            if process.stderr is not None:
                process.stderr.close()
            process.wait()

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

        _emit({"type": "progress", "percentage": 100, "message": success_message})
        _emit(success_result)

    except APTBridgeError:
        raise
    except Exception as e:
        raise APTBridgeError(
            internal_error_message, code="INTERNAL_ERROR", details=str(e)
        ) from e
