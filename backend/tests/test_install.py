"""
Tests for install command.

The command's own job is validation, the apt-get invocation, and the arguments
it hands to run_apt_command; the runner's plumbing (status descriptor, draining,
error classification) is covered against a real subprocess in test_apt_progress.py.
"""

from typing import Any
from unittest.mock import Mock, patch

import pytest

from cockpit_apt.commands.install import execute
from cockpit_apt.utils.errors import APTBridgeError, PackageNotFoundError

_RUNNER = "cockpit_apt.commands.install.run_apt_command"


def _call_of(mock_runner: Mock) -> tuple[list[str], dict[str, Any]]:
    mock_runner.assert_called_once()
    args, kwargs = mock_runner.call_args
    return args[0], kwargs


class TestExecute:
    """Test execute function."""

    @patch(_RUNNER, autospec=True)
    def test_install_invokes_apt_get_install(self, mock_runner: Mock):
        assert execute("nginx") is None

        cmd, _ = _call_of(mock_runner)
        assert cmd[:3] == ["apt-get", "install", "-y"]
        assert cmd[-1] == "nginx"

    @patch(_RUNNER, autospec=True)
    def test_install_keeps_existing_config_files(self, mock_runner: Mock):
        execute("nginx")

        cmd, _ = _call_of(mock_runner)
        assert "Dpkg::Options::=--force-confdef" in cmd
        assert "Dpkg::Options::=--force-confold" in cmd

    @patch(_RUNNER, autospec=True)
    def test_install_does_not_name_a_status_descriptor(self, mock_runner: Mock):
        """The runner owns the descriptor number -- it knows which pipe it made."""
        execute("nginx")

        cmd, _ = _call_of(mock_runner)
        assert not [arg for arg in cmd if arg.startswith("APT::Status-Fd")]

    @patch(_RUNNER, autospec=True)
    def test_install_error_code(self, mock_runner: Mock):
        execute("nginx")

        _, kwargs = _call_of(mock_runner)
        assert kwargs["error_code"] == "INSTALL_FAILED"

    @patch(_RUNNER, autospec=True)
    def test_install_names_the_package_in_the_result(self, mock_runner: Mock):
        execute("nginx")

        _, kwargs = _call_of(mock_runner)
        assert kwargs["success_result"]["package_name"] == "nginx"
        assert "nginx" in kwargs["success_result"]["message"]

    @patch(_RUNNER, autospec=True)
    def test_missing_package_is_classified(self, mock_runner: Mock):
        execute("nosuchpkg")

        _, kwargs = _call_of(mock_runner)
        error = kwargs["classify_error"]("E: Unable to locate package nosuchpkg")

        assert isinstance(error, PackageNotFoundError)

    @patch(_RUNNER, autospec=True)
    def test_other_stderr_falls_through_to_the_runner(self, mock_runner: Mock):
        execute("nginx")

        _, kwargs = _call_of(mock_runner)

        assert kwargs["classify_error"]("dpkg was interrupted") is None

    @patch(_RUNNER, autospec=True)
    def test_install_failure_propagates(self, mock_runner: Mock):
        mock_runner.side_effect = APTBridgeError("Insufficient disk space", code="DISK_FULL")

        with pytest.raises(APTBridgeError) as exc_info:
            execute("nginx")

        assert exc_info.value.code == "DISK_FULL"

    @patch(_RUNNER, autospec=True)
    def test_install_invalid_package_name(self, mock_runner: Mock):
        with pytest.raises(APTBridgeError):
            execute("invalid;name")

        mock_runner.assert_not_called()
