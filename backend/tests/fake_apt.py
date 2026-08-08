"""
Stand-in for apt-get, used by the run_apt_command integration tests.

Reads the status descriptor out of its own argv the way apt does, so a test
only sees status output when the descriptor named by APT::Status-Fd is the
descriptor the pipe actually landed on.
"""

import argparse
import json
import os
import sys

_STATUS_FD_OPTION = "APT::Status-Fd="


def status_fd_from_argv(argv: list[str]) -> int | None:
    """Return the descriptor named by APT::Status-Fd, or None if unset."""
    for arg in argv:
        if arg.startswith(_STATUS_FD_OPTION):
            return int(arg[len(_STATUS_FD_OPTION) :])
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", action="append", default=[])
    parser.add_argument("--stdout-bytes", type=int, default=0)
    parser.add_argument("--stderr-bytes", type=int, default=0)
    parser.add_argument("--stderr", default="")
    parser.add_argument("--exit-code", type=int, default=0)
    parser.add_argument("--argv-out", default="")
    args, _ = parser.parse_known_args()

    if args.argv_out:
        with open(args.argv_out, "w") as handle:
            json.dump(sys.argv[1:], handle)

    if args.stdout_bytes:
        sys.stdout.write("o" * args.stdout_bytes)
        sys.stdout.flush()

    if args.stderr_bytes:
        sys.stderr.write("e" * args.stderr_bytes)
        sys.stderr.flush()

    fd = status_fd_from_argv(sys.argv[1:])
    if fd is not None and args.status:
        payload = "".join(f"{line}\n" for line in args.status).encode()
        os.write(fd, payload)

    if args.stderr:
        sys.stderr.write(args.stderr)
        sys.stderr.flush()

    return args.exit_code


if __name__ == "__main__":
    sys.exit(main())
