"""
JSON formatting utilities for cockpit-apt-bridge.

Handles serialization of Python objects to JSON for output to stdout.
"""

import json
from typing import Any


def to_json(data: Any) -> str:
    """
    Convert data to JSON string with consistent formatting.

    Args:
        data: Data to serialize (dict, list, or JSON-serializable type)

    Returns:
        JSON string representation

    Raises:
        TypeError: If data is not JSON-serializable
    """
    return json.dumps(data, indent=2, ensure_ascii=False, sort_keys=False)


def format_package(pkg: Any) -> dict[str, Any]:
    """
    Format an apt.Package object as a dictionary for list views.

    Args:
        pkg: python-apt Package object

    Returns:
        Dictionary with basic package information
    """
    # Get candidate version (available for install)
    candidate = pkg.candidate
    if candidate:
        version = candidate.version
        section = candidate.section or "unknown"
    else:
        version = "unknown"
        section = "unknown"

    return {
        "name": pkg.name,
        "summary": candidate.summary if candidate else "",
        "version": version,
        "installed": pkg.is_installed,
        "section": section,
    }


def format_package_details(pkg: Any) -> dict[str, Any]:
    """
    Format an apt.Package object as a detailed dictionary.

    Includes all fields needed for the details view: description, dependencies,
    homepage, maintainer, sizes, etc.

    Args:
        pkg: python-apt Package object

    Returns:
        Dictionary with comprehensive package information
    """
    candidate = pkg.candidate
    installed_version = pkg.installed

    # Basic information
    result: dict[str, Any] = {
        "name": pkg.name,
        "summary": candidate.summary if candidate else "",
        "description": candidate.description if candidate else "",
        "section": candidate.section if candidate else "unknown",
        "installed": pkg.is_installed,
        "installedVersion": installed_version.version if installed_version else None,
        "candidateVersion": candidate.version if candidate else None,
    }

    # Optional fields from candidate version
    if candidate:
        result["priority"] = candidate.priority if hasattr(candidate, "priority") else "optional"
        result["homepage"] = candidate.homepage if candidate.homepage else ""
        result["maintainer"] = candidate.record.get("Maintainer", "") if hasattr(candidate, "record") else ""
        result["size"] = candidate.size if hasattr(candidate, "size") else 0
        result["installedSize"] = candidate.installed_size if hasattr(candidate, "installed_size") else 0
    else:
        result["priority"] = "optional"
        result["homepage"] = ""
        result["maintainer"] = ""
        result["size"] = 0
        result["installedSize"] = 0

    # Dependencies (will be populated by command handler)
    result["dependencies"] = []
    result["reverseDependencies"] = []

    return result


def format_dependency(dep_or: Any) -> list[dict[str, Any]]:
    """
    Format an apt dependency OR-group as a list of dependency objects.

    Dependencies in APT can have OR relationships (e.g., "vim | emacs").
    This function formats one OR-group.

    Args:
        dep_or: python-apt dependency OR-group object

    Returns:
        List of dependency dictionaries, one per option in the OR-group
    """
    dependencies = []

    for dep in dep_or:
        dep_dict = {
            "name": dep.name,
            "relation": dep.relation or "",
            "version": dep.version or "",
        }
        dependencies.append(dep_dict)

    return dependencies
