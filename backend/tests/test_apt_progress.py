"""
Tests for shared apt progress utilities.

Tests parse_status_line() and run_apt_command() which are shared across
install, upgrade, and remove commands.

run_apt_command is exercised against a real subprocess and a real pipe
(tests/fake_apt.py). Mocking os.pipe and Popen hides the two things that
actually decide whether progress works: which descriptor the child receives,
and whether its output is drained while it runs.
"""

import json
import sys
import threading
from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch

import pytest

from cockpit_apt.utils.apt_progress import parse_status_line, run_apt_command
from cockpit_apt.utils.errors import APTBridgeError

# Comfortably past the 64 KiB pipe buffer a blocked writer would fill.
FLOOD_BYTES = 512 * 1024

# A deadlocked run never returns; the tests need a deadline rather than a hang.
DEADLINE_SECONDS = 30

_MOD = "cockpit_apt.utils.apt_progress"
_FAKE_APT = Path(__file__).parent / "fake_apt.py"


class TestParseStatusLine:
    """Test parse_status_line helper function."""

    def test_parse_pmstatus_line(self):
        line = "pmstatus:nginx:25.5:Installing nginx"
        result = parse_status_line(line)

        assert result is not None
        assert result["percentage"] == 25
        assert "nginx" in result["message"]

    def test_parse_dlstatus_line(self):
        line = "dlstatus:curl:50.0:Downloading curl"
        result = parse_status_line(line)

        assert result is not None
        assert result["percentage"] == 50
        assert "curl" in result["message"]

    def test_parse_line_with_colon_in_message(self):
        line = "pmstatus:vim:75.0:Setting up: vim"
        result = parse_status_line(line)

        assert result is not None
        assert result["percentage"] == 75
        assert ":" in result["message"]

    def test_parse_empty_message(self):
        line = "pmstatus:git:100.0:"
        result = parse_status_line(line)

        assert result is not None
        assert result["percentage"] == 100
        assert "git" in result["message"].lower()

    def test_parse_invalid_line(self):
        assert parse_status_line("") is None
        assert parse_status_line("invalid") is None
        assert parse_status_line("pmstatus:only:two") is None
        assert parse_status_line("unknown:pkg:50:msg") is None

    def test_parse_invalid_percentage(self):
        line = "pmstatus:pkg:invalid:message"
        result = parse_status_line(line)

        assert result is None


def _fake_apt_cmd(*args: str) -> list[str]:
    """Build a command that runs the fake apt-get stand-in."""
    return [sys.executable, str(_FAKE_APT), *args]


def _run(cmd: list[str], **kwargs: Any) -> None:
    """Call run_apt_command with sensible defaults, overridden by kwargs."""
    defaults: dict[str, Any] = {
        "cmd": cmd,
        "monotonic_progress": True,
        "success_message": "Test complete",
        "success_result": {"success": True, "message": "Test complete"},
        "error_code": "TEST_FAILED",
        "error_message": "Test operation failed",
        "internal_error_message": "Error during test",
    }
    defaults.update(kwargs)
    run_apt_command(**defaults)


def _run_before_deadline(cmd: list[str], **kwargs: Any) -> None:
    """Run the command on a worker thread, failing the test if it never returns."""
    error: list[BaseException] = []

    def target() -> None:
        try:
            _run(cmd, **kwargs)
        except BaseException as exc:  # noqa: BLE001 - re-raised on the calling thread
            error.append(exc)

    worker = threading.Thread(target=target, daemon=True)
    worker.start()
    worker.join(DEADLINE_SECONDS)

    if worker.is_alive():
        pytest.fail(
            f"run_apt_command did not return within {DEADLINE_SECONDS}s -- "
            "the child is blocked writing to a pipe nobody is reading"
        )
    if error:
        raise error[0]


def _emitted(capsys: pytest.CaptureFixture[str]) -> list[dict[str, Any]]:
    """Parse the JSON lines run_apt_command wrote to stdout."""
    captured = capsys.readouterr().out
    return [json.loads(line) for line in captured.splitlines() if line.strip()]


def _percentages(emitted: list[dict[str, Any]]) -> list[int]:
    return [item["percentage"] for item in emitted if item.get("type") == "progress"]


class TestRunAptCommandStatusFd:
    """The status descriptor the child is told about must be the pipe it can write to."""

    def test_progress_reaches_stdout(self, capsys: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:25.0:Downloading",
                "--status", "pmstatus:pkg:50.0:Unpacking",
                "--status", "pmstatus:pkg:75.0:Setting up",
            )
        )

        emitted = _emitted(capsys)
        assert _percentages(emitted) == [25, 50, 75, 100]
        assert emitted[-1] == {"success": True, "message": "Test complete"}

    def test_status_fd_option_names_the_pipe(
        self, capsys: pytest.CaptureFixture[str], tmp_path: Path
    ):
        """The injected descriptor number must be the write end of our own pipe."""
        argv_out = tmp_path / "argv.json"

        _run(
            _fake_apt_cmd(
                "--argv-out", str(argv_out),
                "--status", "pmstatus:pkg:40.0:Unpacking",
            )
        )

        argv = json.loads(argv_out.read_text())
        status_options = [arg for arg in argv if arg.startswith("APT::Status-Fd=")]
        assert len(status_options) == 1, f"expected exactly one status option, got {argv}"

        # The child wrote to whatever descriptor it was handed; the progress line
        # only arrives here if that descriptor really was our pipe.
        assert _percentages(_emitted(capsys)) == [40, 100]

    def test_caller_command_is_preserved(
        self, capsys: pytest.CaptureFixture[str], tmp_path: Path
    ):
        argv_out = tmp_path / "argv.json"
        cmd = _fake_apt_cmd("--argv-out", str(argv_out), "--exit-code", "0")

        _run(cmd)
        capsys.readouterr()

        # cmd[:2] is the interpreter and script; the rest must arrive untouched,
        # with the status option appended after it.
        argv = json.loads(argv_out.read_text())
        assert argv[: len(cmd) - 2] == cmd[2:]

    def test_status_written_just_before_exit_is_not_dropped(
        self, capsys: pytest.CaptureFixture[str]
    ):
        """The child writes and exits immediately; the tail must still be read."""
        _run(_fake_apt_cmd("--status", "pmstatus:pkg:90.0:Installed pkg"))

        assert _percentages(_emitted(capsys)) == [90, 100]

    def test_monotonic_progress_filtering(self, capsys: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:50.0:Step 1",
                "--status", "pmstatus:pkg:25.0:Step 2 (reset)",
                "--status", "pmstatus:pkg:75.0:Step 3",
            ),
            monotonic_progress=True,
        )

        assert _percentages(_emitted(capsys)) == [50, 75, 100]

    def test_non_monotonic_progress(self, capsys: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg-a:50.0:Setting up pkg-a",
                "--status", "pmstatus:pkg-a:100.0:Installed pkg-a",
                "--status", "pmstatus:pkg-b:25.0:Unpacking pkg-b",
            ),
            monotonic_progress=False,
        )

        assert _percentages(_emitted(capsys)) == [50, 100, 25, 100]

    def test_success_result_printed(self, capsys: pytest.CaptureFixture[str]):
        result = {"success": True, "message": "Installed foo", "package_name": "foo"}

        _run(_fake_apt_cmd(), success_result=result)

        assert _emitted(capsys)[-1] == result


class TestRunAptCommandDraining:
    """A chatty child must not be able to block on a pipe nobody is reading."""

    def test_large_stdout_does_not_deadlock(self, capsys: pytest.CaptureFixture[str]):
        _run_before_deadline(
            _fake_apt_cmd(
                "--stdout-bytes", str(FLOOD_BYTES),
                "--status", "pmstatus:pkg:60.0:Setting up pkg",
            )
        )

        assert _percentages(_emitted(capsys)) == [60, 100]

    def test_large_stderr_does_not_deadlock(self, capsys: pytest.CaptureFixture[str]):
        _run_before_deadline(
            _fake_apt_cmd(
                "--stderr-bytes", str(FLOOD_BYTES),
                "--status", "pmstatus:pkg:60.0:Setting up pkg",
            )
        )

        assert _percentages(_emitted(capsys)) == [60, 100]

    def test_stderr_is_retained_across_a_flood(self, capsys: pytest.CaptureFixture[str]):
        """Draining stderr must accumulate it, not discard it -- errors read from it."""
        with pytest.raises(APTBridgeError) as exc_info:
            _run_before_deadline(
                _fake_apt_cmd(
                    "--stderr-bytes", str(FLOOD_BYTES),
                    "--stderr", "You don't have enough free space",
                    "--exit-code", "100",
                )
            )
        capsys.readouterr()

        assert exc_info.value.code == "DISK_FULL"


class TestRunAptCommandErrors:
    """Error classification reads the child's stderr."""

    def test_locked_error(self, capsys: pytest.CaptureFixture[str]):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(_fake_apt_cmd("--stderr", "dpkg was interrupted", "--exit-code", "100"))
        capsys.readouterr()

        assert exc_info.value.code == "LOCKED"

    def test_disk_full_error(self, capsys: pytest.CaptureFixture[str]):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd(
                    "--stderr", "You don't have enough free space",
                    "--exit-code", "100",
                )
            )
        capsys.readouterr()

        assert exc_info.value.code == "DISK_FULL"

    def test_generic_failure(self, capsys: pytest.CaptureFixture[str]):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd("--stderr", "Some error", "--exit-code", "1"),
                error_code="INSTALL_FAILED",
                error_message="Failed to install",
            )
        capsys.readouterr()

        assert exc_info.value.code == "INSTALL_FAILED"
        assert "Failed to install" in str(exc_info.value)

    def test_classify_error_callback(self, capsys: pytest.CaptureFixture[str]):
        def classify(stderr: str) -> APTBridgeError | None:
            if "Unable to locate package" in stderr:
                return APTBridgeError("Package not found", code="PACKAGE_NOT_FOUND")
            return None

        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd(
                    "--stderr", "Unable to locate package foo",
                    "--exit-code", "100",
                ),
                classify_error=classify,
            )
        capsys.readouterr()

        assert exc_info.value.code == "PACKAGE_NOT_FOUND"

    def test_classify_error_falls_through_to_common(
        self, capsys: pytest.CaptureFixture[str]
    ):
        def classify(stderr: str) -> APTBridgeError | None:
            return None

        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd("--stderr", "dpkg was interrupted", "--exit-code", "100"),
                classify_error=classify,
            )
        capsys.readouterr()

        assert exc_info.value.code == "LOCKED"


class TestRunAptCommandFdHygiene:
    """Failure paths must not leak the pipe."""

    @patch(f"{_MOD}.os.close")
    @patch(f"{_MOD}.os.pipe")
    @patch(f"{_MOD}.subprocess.Popen")
    def test_popen_failure_closes_both_fds(
        self, mock_popen: Mock, mock_pipe: Mock, mock_close: Mock
    ):
        mock_pipe.return_value = (3, 4)
        mock_popen.side_effect = OSError("Failed to exec")

        with pytest.raises(APTBridgeError):
            _run(["apt-get", "test"])

        mock_close.assert_any_call(3)
        mock_close.assert_any_call(4)

    @patch(f"{_MOD}.os.pipe")
    def test_internal_error_wrapping(self, mock_pipe: Mock):
        mock_pipe.side_effect = Exception("Pipe creation failed")

        with pytest.raises(APTBridgeError) as exc_info:
            _run(["apt-get", "test"], internal_error_message="Error during install")

        assert exc_info.value.code == "INTERNAL_ERROR"
        assert "Error during install" in str(exc_info.value)
