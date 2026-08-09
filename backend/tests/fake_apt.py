"""
Stand-in for apt-get, used by the run_apt_command integration tests.

Reads the status descriptor the way apt does -- only from the value of an `-o`
option -- so a test only sees status output when the runner passes the option in
a form real apt would honour, naming a descriptor the pipe actually landed on.
"""

import argparse
import json
import os
import sys
import time

_STATUS_FD_OPTION = "APT::Status-Fd="


def status_fd_from_argv(argv: list[str]) -> int | None:
    """Return the descriptor named by `-o APT::Status-Fd=N`, or None if unset."""
    for flag, value in zip(argv, argv[1:], strict=False):
        if flag == "-o" and value.startswith(_STATUS_FD_OPTION):
            return int(value[len(_STATUS_FD_OPTION) :])
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", action="append", default=[])
    parser.add_argument("--status-pad", type=int, default=0)
    parser.add_argument("--status-tail", default="")
    parser.add_argument("--status-split", action="store_true")
    parser.add_argument("--stdout-bytes", type=int, default=0)
    parser.add_argument("--stderr-bytes", type=int, default=0)
    parser.add_argument("--stderr", default="")
    parser.add_argument("--exit-code", type=int, default=0)
    parser.add_argument("--argv-out", default="")
    parser.add_argument("--grandchild-hold", type=float, default=0.0)
    parser.add_argument("--grandchild-chatter", action="store_true")
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
        for line in args.status:
            payload = f"{line}{'x' * args.status_pad}{args.status_tail}\n".encode()
            if args.status_split:
                # Land a read boundary inside the line so the reader has to
                # carry the fragment across iterations.
                split = len(payload) // 2
                os.write(fd, payload[:split])
                time.sleep(0.05)
                os.write(fd, payload[split:])
            else:
                os.write(fd, payload)

    if args.grandchild_hold:
        _spawn_grandchild(fd, args.grandchild_hold, args.grandchild_chatter)

    if args.stderr:
        sys.stderr.write(args.stderr)
        sys.stderr.flush()

    return args.exit_code


def _spawn_grandchild(status_fd: int | None, hold: float, chatter: bool) -> None:
    """Leave a process holding the inherited descriptors after this one exits."""
    if os.fork() != 0:
        return

    deadline = time.monotonic() + hold
    while time.monotonic() < deadline:
        if chatter:
            os.write(2, b"grandchild still here\n")
        time.sleep(0.02)
    os._exit(0)


if __name__ == "__main__":
    sys.exit(main())
