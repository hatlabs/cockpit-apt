"""Tests for filter_packages command."""

from unittest.mock import MagicMock, patch

import pytest

from cockpit_apt_bridge.commands import filter_packages
from cockpit_apt_bridge.utils.errors import CacheError


def test_filter_packages_import_error():
    """Test error when python-apt is not available."""
    with patch.dict("sys.modules", {"apt": None}):
        with pytest.raises(CacheError) as exc_info:
            filter_packages.execute()

    assert "python-apt not available" in str(exc_info.value)


def test_filter_packages_no_filters(mock_apt_cache):
    """Test filtering without any filters."""
    # Import apt module mock
    import apt  # type: ignore

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache", return_value=mock_apt_cache):
            with patch(
                "cockpit_apt_bridge.commands.filter_packages.format_package",
                return_value={"name": "test", "version": "1.0"},
            ):
                result = filter_packages.execute()

    assert "packages" in result
    assert "total_count" in result
    assert "applied_filters" in result
    assert "limit" in result
    assert isinstance(result["packages"], list)
    assert result["limit"] == 1000


def test_filter_packages_with_store(mock_apt_cache):
    """Test filtering by store."""
    # Import apt module mock
    import apt  # type: ignore

    from cockpit_apt_bridge.utils.store_config import StoreConfig, StoreFilter

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
                "cockpit_apt_bridge.commands.filter_packages.load_stores",
                return_value=[mock_store],
            ):
                with patch(
                    "cockpit_apt_bridge.commands.filter_packages.matches_store_filter",
                    return_value=True,
                ):
                    with patch(
                        "cockpit_apt_bridge.commands.filter_packages.format_package",
                        return_value={"name": "test", "version": "1.0"},
                    ):
                        result = filter_packages.execute(store_id="test")

    assert "store=test" in result["applied_filters"]


def test_filter_packages_invalid_tab():
    """Test error with invalid tab filter."""
    # Import apt module mock
    import apt  # type: ignore

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache"):
            with pytest.raises(CacheError) as exc_info:
                filter_packages.execute(tab="invalid")

    assert "Invalid tab filter" in str(exc_info.value)


def test_filter_packages_store_not_found():
    """Test error when store ID is not found."""
    # Import apt module mock
    import apt  # type: ignore

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache"):
            with patch(
                "cockpit_apt_bridge.commands.filter_packages.load_stores",
                return_value=[],
            ):
                with pytest.raises(CacheError) as exc_info:
                    filter_packages.execute(store_id="nonexistent")

    assert "Store not found" in str(exc_info.value)


def test_filter_packages_with_limit(mock_apt_cache):
    """Test result limiting."""
    # Import apt module mock
    import apt  # type: ignore

    with patch.dict("sys.modules", {"apt": apt}):
        with patch("apt.Cache", return_value=mock_apt_cache):
            with patch(
                "cockpit_apt_bridge.commands.filter_packages.format_package",
                return_value={"name": "test", "version": "1.0"},
            ):
                result = filter_packages.execute(limit=10)

    assert result["limit"] == 10
