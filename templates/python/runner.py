"""
===============================================================================
METAFIDE BOT RUNTIME — runner.py
===============================================================================

This file is the actual runtime launcher for the bot.

Responsibilities:
  1. Validate configuration before startup
  2. Register shutdown signal handlers
  3. Start the continuous bot loop from spot.py

This file is used in two modes:

  Foreground mode:
    python index.py run

  Background mode:
    python index.py start

Why this file exists:
  It separates "CLI process management" from "bot runtime logic".
  That keeps index.py focused on commands, while this file focuses on
  actually starting and running the bot safely.
===============================================================================
"""

from __future__ import annotations

import signal
import sys

from config import (
    ASSET,
    CURRENCY,
    ENABLE_EARLY_PRECISION,
    INTERVAL,
    MAX_ALLOWED_POSITIONS,
    METAFIDE_API_KEY,
    METAFIDE_USER_ADDRESS,
    NETWORK,
    POSITIONS_RANGE,
    PRICE_RANGES,
)
from spot import initialize


def validate_config() -> None:
    """
    Validates all config values before the bot starts.

    Why this matters:
      If config is invalid, we want to fail immediately with clear messages
      instead of letting the bot run in a broken or unsafe state.
    """
    errors: list[str] = []

    # -------------------------------------------------------------------------
    # Required fields
    # -------------------------------------------------------------------------
    if not METAFIDE_API_KEY:
        errors.append("METAFIDE_API_KEY is not set")

    if not METAFIDE_USER_ADDRESS:
        errors.append("METAFIDE_USER_ADDRESS is not set")

    # -------------------------------------------------------------------------
    # NETWORK validation
    # -------------------------------------------------------------------------
    valid_networks = ["mainnet", "testnet"]
    if NETWORK not in valid_networks:
        errors.append(
            f'NETWORK must be one of: {", ".join(valid_networks)} — got "{NETWORK}"'
        )

    # -------------------------------------------------------------------------
    # INTERVAL validation
    # -------------------------------------------------------------------------
    valid_intervals = [60, 3600, 23400, 86400]
    if INTERVAL not in valid_intervals:
        errors.append(
            f'INTERVAL must be one of: {", ".join(map(str, valid_intervals))} — got "{INTERVAL}"'
        )

    # -------------------------------------------------------------------------
    # Currency and asset validation
    # -------------------------------------------------------------------------
    if CURRENCY != "USDC":
        errors.append(f'CURRENCY must be "USDC" — got "{CURRENCY}"')

    if ASSET != "BTC_USDT":
        errors.append(f'ASSET must be "BTC_USDT" — got "{ASSET}"')

    # -------------------------------------------------------------------------
    # Position and feature flag validation
    # -------------------------------------------------------------------------
    if (
        not isinstance(MAX_ALLOWED_POSITIONS, int)
        or MAX_ALLOWED_POSITIONS < 1
        or MAX_ALLOWED_POSITIONS > 10
    ):
        errors.append(
            "MAX_ALLOWED_POSITIONS must be a number between 1 and 10 — "
            f'got "{MAX_ALLOWED_POSITIONS}"'
        )

    if not isinstance(ENABLE_EARLY_PRECISION, bool):
        errors.append(
            "ENABLE_EARLY_PRECISION must be true or false — "
            f'got "{ENABLE_EARLY_PRECISION}"'
        )

    # -------------------------------------------------------------------------
    # POSITIONS_RANGE validation
    # Each interval must have an allowed set of position sizes.
    # -------------------------------------------------------------------------
    position_minimums = {
        60: 0.1,
        3600: 1,
        23400: 5,
        86400: 5,
    }

    for interval in valid_intervals:
        range_values = POSITIONS_RANGE.get(interval)

        if not isinstance(range_values, list) or len(range_values) == 0:
            errors.append(f"POSITIONS_RANGE[{interval}] must be a non-empty array")
        else:
            minimum = position_minimums[interval]
            invalid = [
                value
                for value in range_values
                if not isinstance(value, (int, float)) or value < minimum
            ]

            if invalid:
                errors.append(
                    f"POSITIONS_RANGE[{interval}] values must be numbers >= "
                    f"{minimum} — invalid: [{', '.join(map(str, invalid))}]"
                )

    extra_position_keys = [
        key for key in POSITIONS_RANGE.keys() if key not in valid_intervals
    ]
    if extra_position_keys:
        errors.append(
            "POSITIONS_RANGE has unexpected keys: "
            f"[{', '.join(map(str, extra_position_keys))}] — only "
            f"{', '.join(map(str, valid_intervals))} are allowed"
        )

    # -------------------------------------------------------------------------
    # PRICE_RANGES validation
    # Each interval must define a numeric min/max randomization range.
    # -------------------------------------------------------------------------
    for interval in valid_intervals:
        price_range = PRICE_RANGES.get(interval)

        if not isinstance(price_range, dict):
            errors.append(f"PRICE_RANGES[{interval}] must be an object with min/max")
        else:
            if not isinstance(price_range.get("min"), (int, float)):
                errors.append(f"PRICE_RANGES[{interval}].min must be a number")

            if not isinstance(price_range.get("max"), (int, float)):
                errors.append(f"PRICE_RANGES[{interval}].max must be a number")

            if (
                isinstance(price_range.get("min"), (int, float))
                and isinstance(price_range.get("max"), (int, float))
                and price_range["min"] >= price_range["max"]
            ):
                errors.append(f"PRICE_RANGES[{interval}].min must be less than .max")

    extra_price_keys = [
        key for key in PRICE_RANGES.keys() if key not in valid_intervals
    ]
    if extra_price_keys:
        errors.append(
            "PRICE_RANGES has unexpected keys: "
            f"[{', '.join(map(str, extra_price_keys))}] — only "
            f"{', '.join(map(str, valid_intervals))} are allowed"
        )

    # -------------------------------------------------------------------------
    # Final result
    # -------------------------------------------------------------------------
    if errors:
        print("Bot startup failed — invalid config:")
        for error in errors:
            print(f"  ✖ {error}")
        sys.exit(1)

    print("Config validated successfully. Starting bot...")


def setup_signal_handlers() -> None:
    """
    Registers signal handlers for graceful shutdown.

    These signals are common ways to stop a process:
      - SIGTERM: usually sent by process managers or the stop command
      - SIGINT: usually sent by Ctrl+C in the terminal
    """

    def shutdown_handler(signum: int, _frame: object) -> None:
        signal_name = (
            "SIGTERM" if signum == signal.SIGTERM else
            "SIGINT" if signum == signal.SIGINT else
            f"signal {signum}"
        )
        print(f"Received {signal_name}. Shutting down bot...")
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)


def run_bot() -> None:
    """
    Starts the bot runtime.

    Flow:
      1. Validate config
      2. Register signal handlers
      3. Create a session ID for easier log tracing
      4. Launch the infinite bot loop from spot.py
    """
    import time

    validate_config()
    setup_signal_handlers()

    session_id = f"bot-{int(time.time() * 1000)}"

    print("*******************************************************")
    print("LAUNCHING PYTHON BOT")
    print("*******************************************************")
    print(f"Session ID: {session_id}")

    initialize(session_id)


if __name__ == "__main__":
    run_bot()