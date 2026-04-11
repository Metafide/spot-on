/**
 * =============================================================================
 * METAFIDE BOT CORE LOOP — spot.mjs
 * =============================================================================
 *
 * This file contains the main bot behavior.
 *
 * Responsibilities:
 *   1. Poll the Metafide API continuously
 *   2. Check the current live game state
 *   3. Determine whether positions can be placed
 *   4. Generate randomized positions
 *   5. Submit those positions
 *   6. Retry failed submissions
 *
 * Runtime model:
 *   - initialize() starts an infinite loop
 *   - each cycle waits for the previous one to finish
 *   - then sleeps for 5 seconds before running again
 *
 * This prevents overlapping execution.
 * =============================================================================
 */

import {
  CURRENCY,
  NETWORK,
  ASSET,
  INTERVAL,
  METAFIDE_USER_ADDRESS,
  MAX_ALLOWED_POSITIONS,
  ENABLE_EARLY_PRECISION,
  POSITIONS_RANGE,
  PRICE_RANGES,
  SLEEP_TIMER,
} from "./config.mjs";
import { request } from "./request.mjs";

/**
 * Simple async sleep helper.
 *
 * Used to pause:
 *   - between bot cycles
 *   - between retry attempts
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Entry point for the bot loop.
 *
 * Parameters:
 *   message -> session ID or worker ID, used only for logging context
 *
 * Behavior:
 *   - runs forever
 *   - calls main() once per cycle
 *   - catches unexpected errors so one cycle failure does not kill the bot
 *   - sleeps 5 seconds before the next cycle
 */
export async function initialize(message) {
  console.log(`Running bot session: ${message}`);

  while (true) {
    try {
      await main();
    } catch (error) {
      console.error("Error in main loop:", error);
    }

    await sleep(SLEEP_TIMER);
  }
}

/**
 * Runs one full bot cycle.
 *
 * High-level flow:
 *
 *   Step 1:
 *     Fetch current status for the configured asset/interval
 *
 *   Step 2:
 *     Check how many positions already exist in the live game
 *
 *   Step 3:
 *     If max positions are already reached, stop this cycle early
 *
 *   Step 4:
 *     Fetch balance, live game data, and price concurrently
 *
 *   Step 5:
 *     Validate whether the game is currently accepting positions
 *
 *   Step 6:
 *     Optionally enforce early precision mode
 *
 *   Step 7:
 *     Generate only the remaining number of allowed positions
 *
 *   Step 8:
 *     Submit those positions to the API
 */
async function main() {
  try {
    // -------------------------------------------------------------------------
    // Step 1: Fetch current live status for this asset/interval/network
    // -------------------------------------------------------------------------
    const status = await request(
      "GET",
      `status?asset=${ASSET}&token=${CURRENCY}&network=${NETWORK}&interval=${INTERVAL}`
    );

    // If no status is returned, skip this cycle safely.
    if (!status) return;

    // -------------------------------------------------------------------------
    // Step 2: Inspect current positions already placed in the live game
    // -------------------------------------------------------------------------
    const existingPositions = status.positions || [];
    const currentPositionCount = existingPositions.length;

    // If positions already exist, print a useful summary for monitoring.
    if (currentPositionCount > 0) {
      logPositionSummary(status);

      // -----------------------------------------------------------------------
      // Step 3: Enforce the configured maximum position count
      // -----------------------------------------------------------------------
      if (currentPositionCount >= MAX_ALLOWED_POSITIONS) {
        console.log(
          "Max positions reached for the current live game. Skipping cycle."
        );
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Step 4: Fetch balance, game metadata, and live price in parallel
    // This is faster than fetching them one after another.
    // -------------------------------------------------------------------------
    const [balance, games, price] = await Promise.all([
      request("GET", `user-balance?currency=${CURRENCY}&network=${NETWORK}`),
      request("GET", `spot?asset=${ASSET}&interval=${INTERVAL}`),
      request("GET", `live-price?asset=${ASSET}`),
    ]);

    // If any key dependency is missing, skip this cycle.
    if (!balance || !games || !price) {
      console.log("Incomplete data received. Skipping cycle.");
      return;
    }

    // -------------------------------------------------------------------------
    // Step 5: Confirm that the game currently allows placing positions
    // -------------------------------------------------------------------------
    if (!games.can_place_position) {
      console.log(
        "Game is not accepting positions at this time. Skipping cycle."
      );
      return;
    }

    // -------------------------------------------------------------------------
    // Step 6: Optional early precision restriction
    // If enabled, only place positions during the early precision window.
    // Skip this restriction for interval 10.
    // -------------------------------------------------------------------------
    if (
      ENABLE_EARLY_PRECISION &&
      INTERVAL !== 10 &&
      !games.early_precision_window
    ) {
      console.log("Early precision window is not open. Skipping cycle.");
      return;
    }
    // Current price is rounded to a whole number before randomization.
    const currentPrice = Number(price.value.toFixed(0));

    // -------------------------------------------------------------------------
    // Step 7: Only generate the remaining number of allowed positions
    //
    // Example:
    //   MAX_ALLOWED_POSITIONS = 10
    //   currentPositionCount  = 6
    //   remainingSlots        = 4
    //
    // This is safer than always attempting 10 positions every cycle.
    // -------------------------------------------------------------------------
    const remainingSlots = MAX_ALLOWED_POSITIONS - currentPositionCount;

    if (remainingSlots <= 0) {
      console.log("No remaining slots available. Skipping cycle.");
      return;
    }

    const positions = generatePositions(
      games.liveGame.gid,
      currentPrice,
      remainingSlots
    );

    console.log("Generated positions:", positions.length);

    // -------------------------------------------------------------------------
    // Step 8: Submit generated positions
    // -------------------------------------------------------------------------
    await submitPositions(positions);
  } catch (error) {
    console.error("Error in main:", error);
  }
}

/**
 * Builds an array of position objects for API submission.
 *
 * Parameters:
 *   gid          -> current live game ID
 *   currentPrice -> current rounded live price
 *   count        -> number of positions to generate
 *
 * How generation works:
 *   - choose a random amount from POSITIONS_RANGE[INTERVAL]
 *   - choose a randomized strike price around currentPrice
 *   - build the payload expected by the Metafide API
 */
function generatePositions(gid, currentPrice, count) {
  const amountOptions = POSITIONS_RANGE[INTERVAL];
  const positions = [];

  for (let i = 0; i < count; i++) {
    const amount =
      amountOptions[Math.floor(Math.random() * amountOptions.length)];
    const randomizedPrice = randomizePrice(currentPrice);

    positions.push({
      gid,
      c: CURRENCY,
      a: ASSET,
      sp: randomizedPrice.toFixed(0),
      f: String(amount),
      pw: METAFIDE_USER_ADDRESS,
      n: NETWORK,
      it: INTERVAL,
    });
  }

  return positions;
}

/**
 * Applies a random offset to the current live price.
 *
 * The offset range depends on the configured INTERVAL.
 *
 * Example:
 *   currentPrice = 65000
 *   range = { min: -10, max: 10 }
 *   result may be anywhere from 64990 to 65010
 *
 * Fallback:
 *   If no range exists for the current interval, use { min: -40, max: 50 }.
 */
function randomizePrice(currentPrice) {
  const range = PRICE_RANGES[INTERVAL] || { min: -40, max: 50 };
  const offset = randInt(range.min, range.max);
  return currentPrice + offset;
}

/**
 * Returns a random integer between min and max, inclusive.
 *
 * Example:
 *   randInt(-10, 10)
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Submits positions to the API.
 *
 * Behavior:
 *   - submits all positions concurrently using Promise.allSettled()
 *   - successful submissions are logged
 *   - failed submissions are collected
 *   - failed positions are retried up to MAX_RETRIES
 *
 * Why Promise.allSettled():
 *   We want one failed position to NOT cancel the rest.
 */
async function submitPositions(positions, retries = 0) {
  const MAX_RETRIES = 3;

  const results = await Promise.allSettled(
    positions.map((position) => request("POST", "spot", position))
  );

  const failed = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      console.log(`Position ${i + 1} placed:`, result.value.txid);
    } else {
      console.error(
        `Position ${i + 1} failed:`,
        result.reason?.message || result.reason
      );
      failed.push(positions[i]);
    }
  });

  // Retry only failed positions, not successful ones.
  if (failed.length > 0 && retries < MAX_RETRIES) {
    console.log(
      `Retrying ${failed.length} failed position(s)... (attempt ${
        retries + 1
      } of ${MAX_RETRIES})`
    );
    await sleep(1000);
    await submitPositions(failed, retries + 1);
  }

  // Final failure state after retries are exhausted.
  if (failed.length > 0 && retries >= MAX_RETRIES) {
    console.error(
      `${failed.length} position(s) failed after ${MAX_RETRIES} retries. Skipping.`
    );
  }
}

/**
 * Prints a readable summary of current positions and streaks.
 *
 * This is useful for monitoring how the live game is progressing.
 *
 * Positions table fields:
 *   - amount
 *   - win
 *   - return
 *
 * Streaks table fields:
 *   - positionId
 *   - streak
 */
function logPositionSummary(status) {
  const formattedPositions = (status.positions || []).map((p) => ({
    amount: p.f,
    win: p.w,
    return: p.r,
  }));

  const formattedStreaks = (status.streaks || []).map((s) => ({
    positionId: s.positionId,
    streak: s.streak,
  }));

  console.table(formattedPositions);
  console.table(formattedStreaks);
}
