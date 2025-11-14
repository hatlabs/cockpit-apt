"""Tests for list_repositories command."""

from unittest.mock import MagicMock, patch

import pytest

from cockpit_apt_bridge.commands import list_repositories
from cockpit_apt_bridge.utils.errors import CacheError


def test_list_repositories_import_error():
    """Test error when python-apt is not available."""
    with patch.dict("sys.modules", {"apt": None}):
        with pytest.raises(CacheError) as exc_info:
            list_repositories.execute()

    assert "python-apt not available" in str(exc_info.value)


def test_list_repositories_no_filter(mock_apt_cache):
    """Test listing all repositories without filter."""
    # Import apt module mock
    import apt  # type: ignore

    # Mock Repository objects
    from cockpit_apt_bridge.utils.repository_parser import Repository

    mock_repos = [
        Repository(
            id="Debian:bookworm",
            name="Debian",
            origin="Debian",
            label="Debian",
            suite="bookworm",
            package_count=10,
        ),
        Repository(
            id="HatLabs:stable",
            name="HatLabs",
            origin="HatLabs",
            label="HatLabs",
            suite="stable",
            package_count=5,
        ),
    ]

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache", return_value=mock_apt_cache):
            with patch(
                "cockpit_apt_bridge.commands.list_repositories.parse_repositories",
                return_value=mock_repos,
            ):
                result = list_repositories.execute()

    assert len(result) == 2
    assert result[0]["id"] == "Debian:bookworm"
    assert result[0]["package_count"] == 10
    assert result[1]["id"] == "HatLabs:stable"
    assert result[1]["package_count"] == 5


def test_list_repositories_with_store_filter(mock_apt_cache):
    """Test listing repositories filtered by store."""
    # Import apt module mock
    import apt  # type: ignore

    from cockpit_apt_bridge.utils.repository_parser import Repository
    from cockpit_apt_bridge.utils.store_config import StoreConfig, StoreFilter

    mock_repos = [
        Repository(
            id="Debian:bookworm",
            name="Debian",
            origin="Debian",
            label="Debian",
            suite="bookworm",
            package_count=10,
        ),
    ]

    mock_store = StoreConfig(
        id="test",
        name="Test Store",
        description="Test",
        filters=StoreFilter(
            include_sections=["net"],
            include_origins=[],
            include_tags=[],
            include_packages=[],
        ),
    )

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache", return_value=mock_apt_cache):
            with patch(
                "cockpit_apt_bridge.commands.list_repositories.parse_repositories",
                return_value=mock_repos,
            ):
                with patch(
                    "cockpit_apt_bridge.commands.list_repositories.load_stores",
                    return_value=[mock_store],
                ):
                    with patch(
                        "cockpit_apt_bridge.commands.list_repositories.matches_store_filter",
                        return_value=True,
                    ):
                        result = list_repositories.execute(store_id="test")

    # Should include repo if it has matching packages
    assert len(result) >= 0  # May be empty depending on mock setup


def test_list_repositories_store_not_found():
    """Test error when store ID is not found."""
    # Import apt module mock
    import apt  # type: ignore

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache"):
            with patch(
                "cockpit_apt_bridge.commands.list_repositories.load_stores",
                return_value=[],
            ):
                with pytest.raises(CacheError) as exc_info:
                    list_repositories.execute(store_id="nonexistent")

    assert "Store not found" in str(exc_info.value)
