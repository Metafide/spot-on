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
 * Dispatches one bot cycle based on the configured INTERVAL.
 *
 * Behavior:
 *   - interval 10 -> placeOnNextGame() (schedule for the upcoming round)
 *   - otherwise   -> placeOnLiveGame() (place on the active round)
 */
async function main() {
  if (INTERVAL === 10) {
    placeOnNextGame();
  } else {
    placeOnLiveGame();
  }
}

/**
 * Shared setup for both scheduling modes.
 *
 * Behavior:
 *   - fetch the current round status
 *   - log any positions already in flight
 *   - enforce the per-round MAX_ALLOWED_POSITIONS cap
 *
 * Parameters:
 *   isLiveGame -> whether to include streaks in the summary log
 *
 * Returns:
 *   number of position slots still available this cycle, or 0 to skip
 */
async function getRemainingSlots(isLiveGame) {
  const status = await request(
    "GET",
    `status?asset=${ASSET}&token=${CURRENCY}&network=${NETWORK}&interval=${INTERVAL}`
  );
  if (!status) return 0;

  const currentPositionCount = (status.positions || []).length;

  if (currentPositionCount > 0) {
    logPositionSummary(status, isLiveGame);

    if (currentPositionCount >= MAX_ALLOWED_POSITIONS) {
      console.log(
        "Max positions reached for the current live game. Skipping cycle."
      );
      return 0;
    }
  }

  if (isLiveGame) {
    return MAX_ALLOWED_POSITIONS - currentPositionCount;
  } else {
    return MAX_ALLOWED_POSITIONS;
  }
}

/**
 * Generates and submits positions for a given game round.
 *
 * Parameters:
 *   gameId         -> target game ID (live or upcoming)
 *   price          -> live-price API response ({ value: number })
 *   remainingSlots -> how many positions to generate this cycle
 */
async function placePositions(gameId, price, remainingSlots) {
  const currentPrice = Number(price.value.toFixed(0));
  const positions = generatePositions(gameId, currentPrice, remainingSlots);

  console.log("Generated positions:", positions.length);
  await submitPositions(positions);
}

/**
 * Places positions on the currently live game round.
 *
 * Used for intervals 60, 3600, and 86400 where the round is long enough
 * to safely submit while it is already in progress.
 *
 * Behavior:
 *   - check remaining slot capacity
 *   - fetch balance, game metadata, and live price in parallel
 *   - confirm the game is accepting positions
 *   - optionally enforce the early precision window (skipped for interval 10)
 *   - generate and submit positions against liveGame.gid
 */
async function placeOnLiveGame() {
  try {
    const remainingSlots = await getRemainingSlots(true);
    if (remainingSlots <= 0) return;

    // Fetch balance, game metadata, and live price in parallel.
    const [balance, games, price] = await Promise.all([
      request("GET", `user-balance?currency=${CURRENCY}&network=${NETWORK}`),
      request("GET", `spot?asset=${ASSET}&interval=${INTERVAL}`),
      request("GET", `live-price?asset=${ASSET}`),
    ]);

    if (!balance || !games || !price) {
      console.log("Incomplete data received. Skipping cycle.");
      return;
    }

    if (!games.can_place_position) {
      console.log(
        "Game is not accepting positions at this time. Skipping cycle."
      );
      return;
    }

    // Optional early precision restriction. Skipped for interval 10.
    if (
      ENABLE_EARLY_PRECISION &&
      INTERVAL !== 10 &&
      !games.early_precision_window
    ) {
      console.log("Early precision window is not open. Skipping cycle.");
      return;
    }

    const liveGameId = games.liveGame.gid;
    await placePositions(liveGameId, price, remainingSlots);
  } catch (error) {
    console.error("Error in placeOnLiveGame:", error);
  }
}

const SCHEDULED_NEXT_GAMES = new Set();
const TIME_OUTS = [];

/**
 * Schedules positions for the upcoming game round.
 *
 * Used for interval 10, where rounds are too short to reliably submit
 * against the live game. Instead we pre-schedule submission against the
 * next round and fire it the moment the current round ends.
 *
 * Behavior:
 *   - check remaining slot capacity
 *   - fetch game metadata
 *   - skip if this nextGame.gid has already been scheduled in a previous cycle
 *   - register a timeout that, on liveGame.ends_at, fetches the live price
 *     and submits positions against nextGame.gid
 */
async function placeOnNextGame() {
  try {
    const remainingSlots = await getRemainingSlots(false);
    if (remainingSlots <= 0) return;

    const games = await request(
      "GET",
      `spot?asset=${ASSET}&interval=${INTERVAL}`
    );
    if (!games || !games.nextGame) {
      console.log("Incomplete data received. Skipping cycle.");
      return;
    }

    const nextGameId = games.nextGame.gid;

    // Skip if this nextGame has already been scheduled in a previous cycle.
    if (SCHEDULED_NEXT_GAMES.has(nextGameId)) return;
    SCHEDULED_NEXT_GAMES.add(nextGameId);

    const remaining = games.liveGame.ends_at - Date.now();
    console.log(
      `Scheduling next game: ${nextGameId}, remaining time: ${remaining}`
    );

    const newGameTimeout = setTimeout(async () => {
      const price = await request("GET", `live-price?asset=${ASSET}`);
      if (!price) return;
      await placePositions(nextGameId, price, remainingSlots);
    }, remaining);
    TIME_OUTS.push(newGameTimeout);
  } catch (error) {
    console.error("Error in placeOnNextGame:", error);
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
 * Parameters:
 *   status     -> status API response
 *   showStreak -> when true, also prints the streak table
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
function logPositionSummary(status, showStreak) {
  const formattedPositions = (status.positions || []).map((p) => ({
    amount: p.f,
    win: p.w,
    return: p.r,
  }));
  console.table(formattedPositions);

  if (showStreak) {
    const formattedStreaks = (status.streaks || []).map((s) => ({
      positionId: s.positionId,
      streak: s.streak,
    }));
    console.table(formattedStreaks);
  }
}
