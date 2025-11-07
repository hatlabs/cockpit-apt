"""
Command implementations for cockpit-apt-bridge.

Each command module implements an execute() function that performs the
command logic and returns the result.
"""

# Import all command modules for easy access
from cockpit_apt_bridge.commands import (
    search,
    details,
    sections,
    list_section,
    list_installed,
    list_upgradable,
    dependencies,
    reverse_dependencies,
    files,
)

__all__ = [
    "search",
    "details",
    "sections",
    "list_section",
    "list_installed",
    "list_upgradable",
    "dependencies",
    "reverse_dependencies",
    "files",
]
