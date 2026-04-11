"""
===============================================================================
METAFIDE BOT CORE LOOP — spot.py
===============================================================================

This file contains the main bot behavior.

Responsibilities:
  1. Poll the Metafide API continuously
  2. Check the current live game state
  3. Determine whether positions can be placed
  4. Generate randomized positions
  5. Submit those positions
  6. Retry failed submissions

Runtime model:
  - initialize() starts an infinite loop
  - each cycle waits for the previous one to finish
  - then sleeps for 5 seconds before running again

This prevents overlapping execution.
===============================================================================
"""

from __future__ import annotations

import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from config import (
    ASSET,
    CURRENCY,
    ENABLE_EARLY_PRECISION,
    INTERVAL,
    MAX_ALLOWED_POSITIONS,
    METAFIDE_USER_ADDRESS,
    NETWORK,
    POSITIONS_RANGE,
    PRICE_RANGES,
)
from request import request


def sleep(ms: int) -> None:
    """
    Simple sleep helper.

    Used to pause:
      - between bot cycles
      - between retry attempts
    """
    time.sleep(ms / 1000)


def initialize(message: str) -> None:
    """
    Entry point for the bot loop.

    Parameters:
      message -> session ID or worker ID, used only for logging context

    Behavior:
      - runs forever
      - calls main() once per cycle
      - catches unexpected errors so one cycle failure does not kill the bot
      - sleeps 5 seconds before the next cycle
    """
    print(f"Running bot session: {message}")

    while True:
        try:
            main()
        except Exception as error:
            print(f"Error in main loop: {error}")

        sleep(5000)


def main() -> None:
    """
    Runs one full bot cycle.

    High-level flow:

      Step 1:
        Fetch current status for the configured asset/interval

      Step 2:
        Check how many positions already exist in the live game

      Step 3:
        If max positions are already reached, stop this cycle early

      Step 4:
        Fetch balance, live game data, and price concurrently

      Step 5:
        Validate whether the game is currently accepting positions

      Step 6:
        Optionally enforce early precision mode

      Step 7:
        Generate only the remaining number of allowed positions

      Step 8:
        Submit those positions to the API
    """
    try:
        # ---------------------------------------------------------------------
        # Step 1: Fetch current live status for this asset/interval/network
        # ---------------------------------------------------------------------
        status = request(
            "GET",
            f"status?asset={ASSET}&token={CURRENCY}&network={NETWORK}&interval={INTERVAL}",
        )

        # If no status is returned, skip this cycle safely.
        if not status:
            return

        # ---------------------------------------------------------------------
        # Step 2: Inspect current positions already placed in the live game
        # ---------------------------------------------------------------------
        existing_positions = status.get("positions", [])
        current_position_count = len(existing_positions)

        # If positions already exist, print a useful summary for monitoring.
        if current_position_count > 0:
            log_position_summary(status)

            # -----------------------------------------------------------------
            # Step 3: Enforce the configured maximum position count
            # -----------------------------------------------------------------
            if current_position_count >= MAX_ALLOWED_POSITIONS:
                print("Max positions reached for the current live game. Skipping cycle.")
                return

        # ---------------------------------------------------------------------
        # Step 4: Fetch balance, game metadata, and live price in parallel
        # This is faster than fetching them one after another.
        # ---------------------------------------------------------------------
        with ThreadPoolExecutor(max_workers=3) as executor:
            balance_future = executor.submit(
                request, "GET", f"user-balance?currency={CURRENCY}&network={NETWORK}"
            )
            games_future = executor.submit(
                request, "GET", f"spot?asset={ASSET}&interval={INTERVAL}"
            )
            price_future = executor.submit(
                request, "GET", f"live-price?asset={ASSET}"
            )

            balance = balance_future.result()
            games = games_future.result()
            price = price_future.result()

        # If any key dependency is missing, skip this cycle.
        if not balance or not games or not price:
            print("Incomplete data received. Skipping cycle.")
            return

        # ---------------------------------------------------------------------
        # Step 5: Confirm that the game currently allows placing positions
        # ---------------------------------------------------------------------
        if not games.get("can_place_position"):
            print("Game is not accepting positions at this time. Skipping cycle.")
            return

        # ---------------------------------------------------------------------
        # Step 6: Optional early precision restriction
        # If enabled, only place positions during the early precision window.
        # Skip this restriction for interval 10.
        # ---------------------------------------------------------------------
        if ENABLE_EARLY_PRECISION and INTERVAL != 10 and not games.get("early_precision_window"):
            print("Early precision window is not open. Skipping cycle.")
            return

        # Current price is rounded to a whole number before randomization.
        current_price = round(price["value"])

        # ---------------------------------------------------------------------
        # Step 7: Only generate the remaining number of allowed positions
        #
        # Example:
        #   MAX_ALLOWED_POSITIONS = 10
        #   current_position_count  = 6
        #   remaining_slots        = 4
        #
        # This is safer than always attempting 10 positions every cycle.
        # ---------------------------------------------------------------------
        remaining_slots = MAX_ALLOWED_POSITIONS - current_position_count

        if remaining_slots <= 0:
            print("No remaining slots available. Skipping cycle.")
            return

        positions = generate_positions(
            games["liveGame"]["gid"],
            current_price,
            remaining_slots,
        )

        print(f"Generated positions: {len(positions)}")

        # ---------------------------------------------------------------------
        # Step 8: Submit generated positions
        # ---------------------------------------------------------------------
        submit_positions(positions)

    except Exception as error:
        print(f"Error in main: {error}")


def generate_positions(gid: str, current_price: int, count: int) -> list[dict[str, Any]]:
    """
    Builds a list of position objects for API submission.

    Parameters:
      gid          -> current live game ID
      current_price -> current rounded live price
      count        -> number of positions to generate

    How generation works:
      - choose a random amount from POSITIONS_RANGE[INTERVAL]
      - choose a randomized strike price around current_price
      - build the payload expected by the Metafide API
    """
    amount_options = POSITIONS_RANGE[INTERVAL]
    positions = []

    for _ in range(count):
        amount = random.choice(amount_options)
        randomized_price = randomize_price(current_price)

        positions.append({
            "gid": gid,
            "c": CURRENCY,
            "a": ASSET,
            "sp": str(round(randomized_price)),
            "f": str(amount),
            "pw": METAFIDE_USER_ADDRESS,
            "n": NETWORK,
            "it": INTERVAL,
        })

    return positions


def randomize_price(current_price: int) -> int:
    """
    Applies a random offset to the current live price.

    The offset range depends on the configured INTERVAL.

    Example:
      current_price = 65000
      range = { min: -10, max: 10 }
      result may be anywhere from 64990 to 65010

    Fallback:
      If no range exists for the current interval, use { min: -40, max: 50 }.
    """
    price_range = PRICE_RANGES.get(INTERVAL, {"min": -40, "max": 50})
    offset = rand_int(price_range["min"], price_range["max"])
    return current_price + offset


def rand_int(min_val: int, max_val: int) -> int:
    """
    Returns a random integer between min and max, inclusive.

    Example:
      rand_int(-10, 10)
    """
    return random.randint(min_val, max_val)


def submit_positions(positions: list[dict[str, Any]], retries: int = 0) -> None:
    """
    Submits positions to the API.

    Behavior:
      - submits all positions concurrently using ThreadPoolExecutor
      - successful submissions are logged
      - failed submissions are collected
      - failed positions are retried up to MAX_RETRIES

    Why concurrent submission:
      We want one failed position to NOT cancel the rest.
    """
    MAX_RETRIES = 3
    failed: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=len(positions)) as executor:
        future_to_position = {
            executor.submit(request, "POST", "spot", position): (i, position)
            for i, position in enumerate(positions)
        }

        for future in as_completed(future_to_position):
            i, position = future_to_position[future]
            try:
                result = future.result()
                print(f"Position {i + 1} placed: {result.get('txid')}")
            except Exception as error:
                print(f"Position {i + 1} failed: {error}")
                failed.append(position)

    # Retry only failed positions, not successful ones.
    if failed and retries < MAX_RETRIES:
        print(
            f"Retrying {len(failed)} failed position(s)... "
            f"(attempt {retries + 1} of {MAX_RETRIES})"
        )
        sleep(1000)
        submit_positions(failed, retries + 1)

    # Final failure state after retries are exhausted.
    if failed and retries >= MAX_RETRIES:
        print(
            f"{len(failed)} position(s) failed after {MAX_RETRIES} retries. Skipping."
        )


def log_position_summary(status: dict[str, Any]) -> None:
    """
    Prints a readable summary of current positions and streaks.

    This is useful for monitoring how the live game is progressing.

    Positions table fields:
      - amount
      - win
      - return

    Streaks table fields:
      - positionId
      - streak
    """
    positions = status.get("positions", [])
    streaks = status.get("streaks", [])

    if positions:
        print("\nPositions:")
        print(f"{'Amount':<12} {'Win':<12} {'Return':<12}")
        print("-" * 36)
        for p in positions:
            print(f"{p.get('f', 'N/A'):<12} {p.get('w', 'N/A'):<12} {p.get('r', 'N/A'):<12}")

    if streaks:
        print("\nStreaks:")
        print(f"{'Position ID':<20} {'Streak':<12}")
        print("-" * 32)
        for s in streaks:
            print(f"{s.get('positionId', 'N/A'):<20} {s.get('streak', 'N/A'):<12}")

    print()
