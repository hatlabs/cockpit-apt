"""
Details command implementation.

Gets comprehensive information about a single package including dependencies,
descriptions, maintainer, sizes, etc.
"""

from typing import Any

from cockpit_apt_bridge.utils.errors import APTBridgeError, CacheError, PackageNotFoundError
from cockpit_apt_bridge.utils.formatters import format_package_details, format_dependency
from cockpit_apt_bridge.utils.validators import validate_package_name


def execute(package_name: str) -> dict[str, Any]:
    """
    Get detailed information about a package.

    Args:
        package_name: Name of the package to query

    Returns:
        Dictionary with comprehensive package information

    Raises:
        APTBridgeError: If package name is invalid
        PackageNotFoundError: If package is not found
        CacheError: If APT cache operations fail
    """
    # Validate package name
    validate_package_name(package_name)

    try:
        # Import apt here to allow testing without python-apt installed
        import apt  # type: ignore
    except ImportError:
        raise CacheError(
            "python-apt not available - must run on Debian/Ubuntu system",
            details="ImportError: No module named 'apt'"
        )

    try:
        # Open APT cache
        cache = apt.Cache()
    except Exception as e:
        raise CacheError(
            "Failed to open APT cache",
            details=str(e)
        )

    try:
        # Look up package
        if package_name not in cache:
            raise PackageNotFoundError(package_name)

        pkg = cache[package_name]

        # Format basic package details
        result = format_package_details(pkg)

        # Extract dependencies if package has a candidate version
        if pkg.candidate and hasattr(pkg.candidate, "dependencies"):
            dependencies = []
            for dep_or in pkg.candidate.dependencies:
                # Each dep_or is a list of alternative dependencies (OR relationship)
                dep_list = format_dependency(dep_or)
                dependencies.extend(dep_list)
            result["dependencies"] = dependencies

        # Extract reverse dependencies (limit to 50 for performance)
        reverse_deps = []
        count = 0
        for other_pkg in cache:
            if count >= 50:
                break

            # Check if other_pkg depends on our package
            if other_pkg.candidate and hasattr(other_pkg.candidate, "dependencies"):
                for dep_or in other_pkg.candidate.dependencies:
                    for dep in dep_or:
                        if dep.name == package_name:
                            reverse_deps.append(other_pkg.name)
                            count += 1
                            break
                    if count >= 50:
                        break

        result["reverseDependencies"] = sorted(reverse_deps)

        return result

    except PackageNotFoundError:
        raise
    except Exception as e:
        raise CacheError(
            f"Error getting package details for '{package_name}'",
            details=str(e)
        )
