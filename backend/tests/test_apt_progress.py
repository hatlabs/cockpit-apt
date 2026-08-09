"""
Tests for shared apt progress utilities.

Tests parse_status_line() and run_apt_command() which are shared across
install, upgrade, and remove commands.

run_apt_command is exercised against a real subprocess and a real pipe
(tests/fake_apt.py). Mocking os.pipe and Popen hides the two things that
actually decide whether progress works: which descriptor the child receives,
and whether its output is drained while it runs. Every subprocess test runs
under a deadline, because the failure mode of this code is a hang and the CI
wrapper has no timeout of its own.

Assertions read capfd, not capsys: the child's stdout is a separate file
descriptor, and capsys cannot see it.
"""

import json
import sys
import threading
import time
from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch

import pytest

from cockpit_apt.utils.apt_progress import (
    DOWNLOAD_SHARE,
    READ_SIZE,
    parse_status_line,
    run_apt_command,
)
from cockpit_apt.utils.errors import APTBridgeError

# Comfortably past the 64 KiB pipe buffer a blocked writer would fill.
FLOOD_BYTES = 512 * 1024

# The suite runs in under a second; anything near this is a wedge, not slowness.
DEADLINE_SECONDS = 15

_MOD = "cockpit_apt.utils.apt_progress"
_FAKE_APT = Path(__file__).parent / "fake_apt.py"


class TestParseStatusLine:
    """Test parse_status_line helper function."""

    def test_parse_pmstatus_line(self):
        result = parse_status_line("pmstatus:nginx:25.5:Installing nginx")

        assert result is not None
        assert result["percentage"] == 25
        assert result["phase"] == "pmstatus"
        assert "nginx" in result["message"]

    def test_parse_dlstatus_line(self):
        result = parse_status_line("dlstatus:curl:50.0:Downloading curl")

        assert result is not None
        assert result["percentage"] == 50
        assert result["phase"] == "dlstatus"
        assert "curl" in result["message"]

    def test_parse_line_with_colon_in_message(self):
        result = parse_status_line("pmstatus:vim:75.0:Setting up: vim")

        assert result is not None
        assert result["percentage"] == 75
        assert ":" in result["message"]

    def test_parse_empty_message(self):
        result = parse_status_line("pmstatus:git:100.0:")

        assert result is not None
        assert result["percentage"] == 100
        assert "git" in result["message"].lower()

    def test_parse_invalid_line(self):
        assert parse_status_line("") is None
        assert parse_status_line("invalid") is None
        assert parse_status_line("pmstatus:only:two") is None
        assert parse_status_line("unknown:pkg:50:msg") is None

    def test_parse_invalid_percentage(self):
        assert parse_status_line("pmstatus:pkg:invalid:message") is None

    def test_parse_non_finite_percentage(self):
        """float() accepts inf and nan; int() then raises OverflowError/ValueError."""
        assert parse_status_line("dlstatus:pkg:inf:message") is None
        assert parse_status_line("dlstatus:pkg:nan:message") is None


def _fake_apt_cmd(*args: str) -> list[str]:
    """Build a command that runs the fake apt-get stand-in."""
    return [sys.executable, str(_FAKE_APT), *args]


def _invoke(cmd: list[str], **kwargs: Any) -> None:
    """Call run_apt_command with sensible defaults, overridden by kwargs."""
    defaults: dict[str, Any] = {
        "cmd": cmd,
        "success_message": "Test complete",
        "success_result": {"success": True, "message": "Test complete"},
        "error_code": "TEST_FAILED",
        "error_message": "Test operation failed",
        "internal_error_message": "Error during test",
    }
    defaults.update(kwargs)
    run_apt_command(**defaults)


def _run(cmd: list[str], **kwargs: Any) -> float:
    """
    Run the command on a worker thread, failing the test if it never returns.

    Returns how long it took, so a test can assert the run ended when apt did
    rather than whenever its descriptors happened to close.
    """
    error: list[BaseException] = []

    def target() -> None:
        try:
            _invoke(cmd, **kwargs)
        except BaseException as exc:
            error.append(exc)

    worker = threading.Thread(target=target, daemon=True)
    started = time.monotonic()
    worker.start()
    worker.join(DEADLINE_SECONDS)
    elapsed = time.monotonic() - started

    if worker.is_alive():
        pytest.fail(
            f"run_apt_command did not return within {DEADLINE_SECONDS}s -- "
            "the child is blocked writing to a pipe nobody is reading, or the "
            "drain loop is not terminating"
        )
    if error:
        raise error[0]

    return elapsed


def _emitted(capfd: pytest.CaptureFixture[str]) -> list[dict[str, Any]]:
    """Parse the JSON lines run_apt_command wrote to stdout."""
    captured = capfd.readouterr().out
    return [json.loads(line) for line in captured.splitlines() if line.strip()]


def _percentages(emitted: list[dict[str, Any]]) -> list[int]:
    return [item["percentage"] for item in emitted if item.get("type") == "progress"]


class TestRunAptCommandStatusFd:
    """The status descriptor the child is told about must be the pipe it can write to."""

    def test_progress_reaches_stdout(self, capfd: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:25.0:Downloading",
                "--status", "pmstatus:pkg:50.0:Unpacking",
                "--status", "pmstatus:pkg:75.0:Setting up",
            )
        )

        emitted = _emitted(capfd)
        assert _percentages(emitted) == [25, 50, 75, 100]
        assert emitted[-1] == {"success": True, "message": "Test complete"}

    def test_status_option_is_passed_the_way_apt_reads_it(
        self, capfd: pytest.CaptureFixture[str], tmp_path: Path
    ):
        """The stand-in only honours `-o APT::Status-Fd=N`, as apt does."""
        argv_out = tmp_path / "argv.json"

        _run(
            _fake_apt_cmd(
                "--argv-out", str(argv_out),
                "--status", "pmstatus:pkg:40.0:Unpacking",
            )
        )

        argv = json.loads(argv_out.read_text())
        assert argv[-2] == "-o"
        assert argv[-1].startswith("APT::Status-Fd=")

        # The child wrote to whatever descriptor it was handed; the progress line
        # only arrives here if that descriptor really was our pipe.
        assert _percentages(_emitted(capfd)) == [40, 100]

    def test_caller_command_is_preserved(
        self, capfd: pytest.CaptureFixture[str], tmp_path: Path
    ):
        argv_out = tmp_path / "argv.json"
        cmd = _fake_apt_cmd("--argv-out", str(argv_out), "--exit-code", "0")

        _run(cmd)
        capfd.readouterr()

        # cmd[:2] is the interpreter and script; the rest must arrive untouched,
        # with the status option appended after it.
        argv = json.loads(argv_out.read_text())
        assert argv[: len(cmd) - 2] == cmd[2:]

    def test_status_written_just_before_exit_is_not_dropped(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """The child writes and exits immediately; the tail must still be read."""
        _run(_fake_apt_cmd("--status", "pmstatus:pkg:90.0:Installed pkg"))

        assert _percentages(_emitted(capfd)) == [90, 100]

    def test_success_result_printed(self, capfd: pytest.CaptureFixture[str]):
        result = {"success": True, "message": "Installed foo", "package_name": "foo"}

        _run(_fake_apt_cmd(), success_result=result)

        assert _emitted(capfd)[-1] == result


class TestRunAptCommandPhases:
    """apt reports two independent 0-100 scales: the download, then the dpkg run."""

    def test_dpkg_phase_is_reported_after_the_download_completes(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """The unpack/configure phase is the slow one -- it must not be filtered out."""
        _run(
            _fake_apt_cmd(
                "--status", "dlstatus:1:50.0:Retrieving file 1 of 2",
                "--status", "dlstatus:2:100.0:Retrieving file 2 of 2",
                "--status", "pmstatus:dpkg-exec:0.0:Running dpkg",
                "--status", "pmstatus:pkg:50.0:Unpacking pkg",
                "--status", "pmstatus:pkg:100.0:Installed pkg",
            )
        )

        emitted = _emitted(capfd)
        reported = _percentages(emitted)
        messages = [item["message"] for item in emitted if item.get("type") == "progress"]

        assert reported == sorted(reported), f"progress went backwards: {reported}"
        assert reported[-1] == 100
        # Treating both scales as one sequence filters every dpkg line, because
        # the download already pushed the running maximum to 100.
        assert "Unpacking pkg" in messages
        assert "Installed pkg" in messages

    def test_dpkg_only_run_uses_the_whole_scale(self, capfd: pytest.CaptureFixture[str]):
        """A cached .deb produces no dlstatus, so the bar must not start half full."""
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:20.0:Unpacking pkg",
                "--status", "pmstatus:pkg:60.0:Configuring pkg",
            )
        )

        assert _percentages(_emitted(capfd)) == [20, 60, 100]

    def test_download_phase_is_compressed_into_its_share(
        self, capfd: pytest.CaptureFixture[str]
    ):
        _run(
            _fake_apt_cmd(
                "--status", "dlstatus:1:100.0:Retrieving file 1 of 1",
                "--status", "pmstatus:pkg:0.0:Running dpkg",
            )
        )

        reported = _percentages(_emitted(capfd))
        assert reported[0] == DOWNLOAD_SHARE

    def test_non_increasing_values_within_a_phase_are_filtered(
        self, capfd: pytest.CaptureFixture[str]
    ):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:50.0:Step 1",
                "--status", "pmstatus:pkg:25.0:Step 2 (reset)",
                "--status", "pmstatus:pkg:75.0:Step 3",
            )
        )

        assert _percentages(_emitted(capfd)) == [50, 75, 100]

    def test_unparseable_lines_between_progress_are_skipped(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """apt interleaves pmconffile and blank lines with the status stream."""
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:20.0:Unpacking pkg",
                "--status", "pmconffile:pkg:/etc/pkg.conf:'/etc/pkg.conf'",
                "--status", "",
                "--status", "pmstatus:pkg:60.0:Configuring pkg",
            )
        )

        assert _percentages(_emitted(capfd)) == [20, 60, 100]


class TestRunAptCommandDraining:
    """A chatty child must not be able to block on a pipe nobody is reading."""

    def test_large_stdout_does_not_deadlock(self, capfd: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--stdout-bytes", str(FLOOD_BYTES),
                "--status", "pmstatus:pkg:60.0:Setting up pkg",
            )
        )

        emitted = _emitted(capfd)
        assert _percentages(emitted) == [60, 100]
        # The child's stdout must not reach our own -- it shares the JSON-lines
        # channel the frontend parses.
        assert all(item.get("type") == "progress" or "success" in item for item in emitted)

    def test_large_stderr_does_not_deadlock(self, capfd: pytest.CaptureFixture[str]):
        _run(
            _fake_apt_cmd(
                "--stderr-bytes", str(FLOOD_BYTES),
                "--status", "pmstatus:pkg:60.0:Setting up pkg",
            )
        )

        assert _percentages(_emitted(capfd)) == [60, 100]

    def test_stderr_is_retained_across_a_flood(self, capfd: pytest.CaptureFixture[str]):
        """Draining stderr must accumulate it, not discard it -- errors read from it."""
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd(
                    "--stderr-bytes", str(FLOOD_BYTES),
                    "--stderr", "You don't have enough free space",
                    "--exit-code", "100",
                )
            )

        assert exc_info.value.code == "DISK_FULL"
        assert len(exc_info.value.details or "") > FLOOD_BYTES

    def test_status_line_spanning_several_reads_is_reassembled(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """A single status line longer than one read must not be split into garbage."""
        pad = READ_SIZE * 2

        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:45.0:Unpacking ",
                "--status-pad", str(pad),
            )
        )

        emitted = _emitted(capfd)
        assert _percentages(emitted) == [45, 100]
        assert len(emitted[0]["message"]) >= pad

    def test_status_line_split_across_writes_is_reassembled(
        self, capfd: pytest.CaptureFixture[str]
    ):
        _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:35.0:Unpacking pkg",
                "--status-split",
            )
        )

        emitted = _emitted(capfd)
        assert _percentages(emitted) == [35, 100]
        assert emitted[0]["message"] == "Unpacking pkg"

    def test_multibyte_character_on_a_read_boundary_survives(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """Decoding each chunk separately would split the character into two U+FFFD."""
        prefix = "pmstatus:pkg:55.0:Unpacking "
        pad = READ_SIZE - len(prefix) - 1

        _run(
            _fake_apt_cmd(
                "--status", prefix,
                "--status-pad", str(pad),
                "--status-tail", "é",
            )
        )

        emitted = _emitted(capfd)
        assert _percentages(emitted) == [55, 100]
        assert emitted[0]["message"].endswith("é")
        assert "�" not in emitted[0]["message"]


class TestRunAptCommandTermination:
    """The drain loop must end when apt does, not when its descriptors do."""

    def test_grandchild_holding_the_descriptors_does_not_stall_the_run(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """A daemon left by a maintainer script inherits the pipe and outlives apt."""
        hold = 6.0

        elapsed = _run(
            _fake_apt_cmd(
                "--status", "pmstatus:pkg:70.0:Installed pkg",
                "--grandchild-hold", str(hold),
            )
        )

        assert _percentages(_emitted(capfd)) == [70, 100]
        # Waiting for both descriptors to hit EOF would tie the run to the
        # grandchild's lifetime instead of apt's.
        assert elapsed < hold / 2, f"run tracked the grandchild, not apt ({elapsed:.1f}s)"

    def test_broken_stdout_does_not_abandon_the_child(
        self, capfd: pytest.CaptureFixture[str]
    ):
        """Losing the UI must not abort a dpkg transaction that is already running."""
        emitted: list[str] = []

        def explode(*_args: Any, **_kwargs: Any) -> None:
            emitted.append("called")
            raise BrokenPipeError(32, "Broken pipe")

        with patch("builtins.print", side_effect=explode):
            _run(
                _fake_apt_cmd(
                    "--status", "pmstatus:pkg:40.0:Unpacking pkg",
                    "--status", "pmstatus:pkg:80.0:Installed pkg",
                )
            )

        capfd.readouterr()
        assert emitted, "the progress print was never reached"


class TestRunAptCommandErrors:
    """Error classification reads the child's stderr."""

    def test_locked_error(self):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(_fake_apt_cmd("--stderr", "dpkg was interrupted", "--exit-code", "100"))

        assert exc_info.value.code == "LOCKED"

    def test_disk_full_error(self):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd(
                    "--stderr", "You don't have enough free space",
                    "--exit-code", "100",
                )
            )

        assert exc_info.value.code == "DISK_FULL"

    def test_generic_failure(self):
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd("--stderr", "Some error", "--exit-code", "1"),
                error_code="INSTALL_FAILED",
                error_message="Failed to install",
            )

        assert exc_info.value.code == "INSTALL_FAILED"
        assert "Failed to install" in str(exc_info.value)

    def test_classify_error_callback(self):
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

        assert exc_info.value.code == "PACKAGE_NOT_FOUND"

    def test_classify_error_falls_through_to_common(self):
        def classify(stderr: str) -> APTBridgeError | None:
            return None

        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd("--stderr", "dpkg was interrupted", "--exit-code", "100"),
                classify_error=classify,
            )

        assert exc_info.value.code == "LOCKED"

    def test_progress_then_failure(self, capfd: pytest.CaptureFixture[str]):
        """The frontend sees progress lines and then an error -- both must survive."""
        with pytest.raises(APTBridgeError) as exc_info:
            _run(
                _fake_apt_cmd(
                    "--status", "pmstatus:pkg:30.0:Unpacking pkg",
                    "--stderr", "Some error",
                    "--exit-code", "1",
                )
            )

        assert _percentages(_emitted(capfd)) == [30]
        assert exc_info.value.code == "TEST_FAILED"


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
            _invoke(["apt-get", "test"])

        mock_close.assert_any_call(3)
        mock_close.assert_any_call(4)

    @patch(f"{_MOD}.os.pipe")
    def test_internal_error_wrapping(self, mock_pipe: Mock):
        mock_pipe.side_effect = Exception("Pipe creation failed")

        with pytest.raises(APTBridgeError) as exc_info:
            _invoke(["apt-get", "test"], internal_error_message="Error during install")

        assert exc_info.value.code == "INTERNAL_ERROR"
        assert "Error during install" in str(exc_info.value)
