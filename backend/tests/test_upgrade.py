"""
Tests for upgrade command.

The command's own job is the apt-get invocation and the arguments it hands to
run_apt_command; the runner's plumbing (status descriptor, draining, error
classification) is covered against a real subprocess in test_apt_progress.py.
"""

from typing import Any
from unittest.mock import Mock, patch

import pytest

from cockpit_apt.commands.upgrade import execute
from cockpit_apt.utils.errors import APTBridgeError

_RUNNER = "cockpit_apt.commands.upgrade.run_apt_command"


def _call_of(mock_runner: Mock) -> tuple[list[str], dict[str, Any]]:
    mock_runner.assert_called_once()
    args, kwargs = mock_runner.call_args
    return args[0], kwargs


class TestExecute:
    """Test execute function."""

    @patch(_RUNNER, autospec=True)
    def test_upgrade_invokes_apt_get_upgrade(self, mock_runner: Mock):
        assert execute() is None

        cmd, _ = _call_of(mock_runner)
        assert cmd[:3] == ["apt-get", "upgrade", "-y"]

    @patch(_RUNNER, autospec=True)
    def test_upgrade_keeps_existing_config_files(self, mock_runner: Mock):
        """An unattended upgrade must not stop to ask about conffiles."""
        execute()

        cmd, _ = _call_of(mock_runner)
        assert "Dpkg::Options::=--force-confdef" in cmd
        assert "Dpkg::Options::=--force-confold" in cmd

    @patch(_RUNNER, autospec=True)
    def test_upgrade_does_not_name_a_status_descriptor(self, mock_runner: Mock):
        """The runner owns the descriptor number -- it knows which pipe it made."""
        execute()

        cmd, _ = _call_of(mock_runner)
        assert not [arg for arg in cmd if arg.startswith("APT::Status-Fd")]

    @patch(_RUNNER, autospec=True)
    def test_upgrade_error_code(self, mock_runner: Mock):
        execute()

        _, kwargs = _call_of(mock_runner)
        assert kwargs["error_code"] == "UPGRADE_FAILED"

    @patch(_RUNNER, autospec=True)
    def test_upgrade_success_result(self, mock_runner: Mock):
        execute()

        _, kwargs = _call_of(mock_runner)
        assert kwargs["success_result"] == {"success": True, "message": "Upgrade complete"}

    @patch(_RUNNER, autospec=True)
    def test_upgrade_failure_propagates(self, mock_runner: Mock):
        mock_runner.side_effect = APTBridgeError("Package manager is locked", code="LOCKED")

        with pytest.raises(APTBridgeError) as exc_info:
            execute()

        assert exc_info.value.code == "LOCKED"
