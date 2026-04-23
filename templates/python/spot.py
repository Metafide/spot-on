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
import threading
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
    SLEEP_TIMER,
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
        sleep(SLEEP_TIMER)


def main() -> None:
    """
    Dispatches one bot cycle based on the configured INTERVAL.

    Behavior:
      - interval 10 -> place_on_next_game() (schedule for the upcoming round)
      - otherwise   -> place_on_live_game() (place on the active round)
    """
    if INTERVAL == 10:
        place_on_next_game()
    else:
        place_on_live_game()


def get_remaining_slots(is_live_game: bool) -> int:
    """
    Shared setup for both scheduling modes.

    Behavior:
      - fetch the current round status
      - log any positions already in flight
      - enforce the per-round MAX_ALLOWED_POSITIONS cap

    Parameters:
      is_live_game -> whether to include streaks in the summary log

    Returns:
      number of position slots still available this cycle, or 0 to skip
    """
    status = request(
        "GET",
        f"status?asset={ASSET}&token={CURRENCY}&network={NETWORK}&interval={INTERVAL}",
    )
    if not status:
        return 0

    current_position_count = len(status.get("positions", []))

    if current_position_count > 0:
        log_position_summary(status, is_live_game)

        if current_position_count >= MAX_ALLOWED_POSITIONS:
            print("Max positions reached for the current live game. Skipping cycle.")
            return 0

    if is_live_game:
        return MAX_ALLOWED_POSITIONS - current_position_count
    else:
        return MAX_ALLOWED_POSITIONS


def place_positions(
    game_id: str, price: dict[str, Any], remaining_slots: int
) -> None:
    """
    Generates and submits positions for a given game round.

    Parameters:
      game_id         -> target game ID (live or upcoming)
      price           -> live-price API response ({ "value": number })
      remaining_slots -> how many positions to generate this cycle
    """
    current_price = round(price["value"])
    positions = generate_positions(game_id, current_price, remaining_slots)

    print(f"Generated positions: {len(positions)}")
    submit_positions(positions)


def place_on_live_game() -> None:
    """
    Places positions on the currently live game round.

    Used for intervals 60, 3600, and 86400 where the round is long enough
    to safely submit while it is already in progress.

    Behavior:
      - check remaining slot capacity
      - fetch balance, game metadata, and live price in parallel
      - confirm the game is accepting positions
      - optionally enforce the early precision window (skipped for interval 10)
      - generate and submit positions against liveGame.gid
    """
    try:
        remaining_slots = get_remaining_slots(True)
        if remaining_slots <= 0:
            return

        # Fetch balance, game metadata, and live price in parallel.
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

        if not balance or not games or not price:
            print("Incomplete data received. Skipping cycle.")
            return

        if not games.get("can_place_position"):
            print("Game is not accepting positions at this time. Skipping cycle.")
            return

        # Optional early precision restriction. Skipped for interval 10.
        if (
            ENABLE_EARLY_PRECISION
            and INTERVAL != 10
            and not games.get("early_precision_window")
        ):
            print("Early precision window is not open. Skipping cycle.")
            return

        live_game_id = games["liveGame"]["gid"]
        place_positions(live_game_id, price, remaining_slots)
    except Exception as error:
        print(f"Error in place_on_live_game: {error}")


SCHEDULED_NEXT_GAMES: set[str] = set()
TIMERS: list[threading.Timer] = []


def place_on_next_game() -> None:
    """
    Schedules positions for the upcoming game round.

    Used for interval 10, where rounds are too short to reliably submit
    against the live game. Instead we pre-schedule submission against the
    next round and fire it the moment the current round ends.

    Behavior:
      - check remaining slot capacity
      - fetch game metadata
      - skip if this nextGame.gid has already been scheduled in a previous cycle
      - register a timer that, on liveGame.ends_at, fetches the live price
        and submits positions against nextGame.gid
    """
    try:
        remaining_slots = get_remaining_slots(False)
        if remaining_slots <= 0:
            return

        games = request("GET", f"spot?asset={ASSET}&interval={INTERVAL}")
        if not games or not games.get("nextGame"):
            print("Incomplete data received. Skipping cycle.")
            return

        next_game_id = games["nextGame"]["gid"]

        # Skip if this nextGame has already been scheduled in a previous cycle.
        if next_game_id in SCHEDULED_NEXT_GAMES:
            return
        SCHEDULED_NEXT_GAMES.add(next_game_id)

        remaining = games["liveGame"]["ends_at"] - int(time.time() * 1000)
        print(f"Scheduling next game: {next_game_id}, remaining time: {remaining}")

        def fire() -> None:
            price = request("GET", f"live-price?asset={ASSET}")
            if not price:
                return
            place_positions(next_game_id, price, remaining_slots)

        timer = threading.Timer(max(0, remaining) / 1000, fire)
        timer.daemon = True
        timer.start()
        TIMERS.append(timer)
    except Exception as error:
        print(f"Error in place_on_next_game: {error}")


def generate_positions(
    gid: str, current_price: int, count: int
) -> list[dict[str, Any]]:
    """
    Builds a list of position objects for API submission.

    Parameters:
      gid           -> current live game ID
      current_price -> current rounded live price
      count         -> number of positions to generate

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


def log_position_summary(status: dict[str, Any], show_streak: bool) -> None:
    """
    Prints a readable summary of current positions and streaks.

    This is useful for monitoring how the live game is progressing.

    Parameters:
      status      -> status API response
      show_streak -> when True, also prints the streak table

    Positions table fields:
      - amount
      - win
      - return

    Streaks table fields:
      - positionId
      - streak
    """
    positions = status.get("positions", [])

    if positions:
        print("\nPositions:")
        print(f"{'Amount':<12} {'Win':<12} {'Return':<12}")
        print("-" * 36)
        for p in positions:
            print(f"{p.get('f', 'N/A'):<12} {p.get('w', 'N/A'):<12} {p.get('r', 'N/A'):<12}")

    if show_streak:
        streaks = status.get("streaks", [])
        if streaks:
            print("\nStreaks:")
            print(f"{'Position ID':<20} {'Streak':<12}")
            print("-" * 32)
            for s in streaks:
                print(f"{s.get('positionId', 'N/A'):<20} {s.get('streak', 'N/A'):<12}")

    print()
