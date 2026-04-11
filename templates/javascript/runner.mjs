/**
 * =============================================================================
 * METAFIDE BOT RUNTIME — runner.mjs
 * =============================================================================
 *
 * This file is the actual runtime launcher for the bot.
 *
 * Responsibilities:
 *   1. Validate configuration before startup
 *   2. Register shutdown signal handlers
 *   3. Start the continuous bot loop from spot.mjs
 *
 * This file is used in two modes:
 *
 *   Foreground mode:
 *     node index.mjs run
 *
 *   Background mode:
 *     node index.mjs start
 *     -> index.mjs spawns this file as a detached process
 *
 * Why this file exists:
 *   It separates "CLI process management" from "bot runtime logic".
 *   That keeps index.mjs focused on commands, while this file focuses on
 *   actually starting and running the bot safely.
 * =============================================================================
 */

import {
    METAFIDE_API_KEY,
    METAFIDE_USER_ADDRESS,
    NETWORK,
    INTERVAL,
    CURRENCY,
    ASSET,
    MAX_ALLOWED_POSITIONS,
    ENABLE_EARLY_PRECISION,
    POSITIONS_RANGE,
    PRICE_RANGES,
  } from "./config.mjs";
  import { initialize } from "./spot.mjs";
  
  /**
   * Validates all config values before the bot starts.
   *
   * Why this matters:
   *   If config is invalid, we want to fail immediately with clear messages
   *   instead of letting the bot run in a broken or unsafe state.
   *
   * Checks include:
   *   - required API credentials
   *   - supported network
   *   - supported interval
   *   - asset/currency constraints
   *   - numeric limits for positions
   *   - structure of POSITIONS_RANGE and PRICE_RANGES
   */
  function validateConfig() {
    const errors = [];
  
    // ---------------------------------------------------------------------------
    // Required fields
    // ---------------------------------------------------------------------------
    if (!METAFIDE_API_KEY) errors.push("METAFIDE_API_KEY is not set");
    if (!METAFIDE_USER_ADDRESS) errors.push("METAFIDE_USER_ADDRESS is not set");
  
    // ---------------------------------------------------------------------------
    // NETWORK validation
    // ---------------------------------------------------------------------------
    const VALID_NETWORKS = ["mainnet", "testnet"];
    if (!VALID_NETWORKS.includes(NETWORK)) {
      errors.push(
        `NETWORK must be one of: ${VALID_NETWORKS.join(", ")} — got "${NETWORK}"`
      );
    }
  
    // ---------------------------------------------------------------------------
    // INTERVAL validation
    // ---------------------------------------------------------------------------
    const VALID_INTERVALS = [10, 60, 3600, 86400];
    if (!VALID_INTERVALS.includes(INTERVAL)) {
      errors.push(
        `INTERVAL must be one of: ${VALID_INTERVALS.join(", ")} — got "${INTERVAL}"`
      );
    }
  
    // ---------------------------------------------------------------------------
    // Currency and asset validation
    // ---------------------------------------------------------------------------
    if (CURRENCY !== "USDC") {
      errors.push(`CURRENCY must be "USDC" — got "${CURRENCY}"`);
    }
  
    if (ASSET !== "BTC_USDT") {
      errors.push(`ASSET must be "BTC_USDT" — got "${ASSET}"`);
    }
  
    // ---------------------------------------------------------------------------
    // Position and feature flag validation
    // ---------------------------------------------------------------------------
    if (
      typeof MAX_ALLOWED_POSITIONS !== "number" ||
      MAX_ALLOWED_POSITIONS < 1 ||
      MAX_ALLOWED_POSITIONS > 10
    ) {
      errors.push(
        `MAX_ALLOWED_POSITIONS must be a number between 1 and 10 — got "${MAX_ALLOWED_POSITIONS}"`
      );
    }
  
    if (typeof ENABLE_EARLY_PRECISION !== "boolean") {
      errors.push(
        `ENABLE_EARLY_PRECISION must be true or false — got "${ENABLE_EARLY_PRECISION}"`
      );
    }
  
    // ---------------------------------------------------------------------------
    // POSITIONS_RANGE validation
    // Each interval must have an allowed set of position sizes.
    // ---------------------------------------------------------------------------
    const POSITION_MINIMUMS = { 10: 0.01, 60: 0.01, 3600: 1, 86400: 5 };
  
    for (const interval of VALID_INTERVALS) {
      const range = POSITIONS_RANGE[interval];
  
      if (!Array.isArray(range) || range.length === 0) {
        errors.push(`POSITIONS_RANGE[${interval}] must be a non-empty array`);
      } else {
        const min = POSITION_MINIMUMS[interval];
        const invalid = range.filter((v) => typeof v !== "number" || v < min);
  
        if (invalid.length > 0) {
          errors.push(
            `POSITIONS_RANGE[${interval}] values must be numbers >= ${min} — invalid: [${invalid.join(", ")}]`
          );
        }
      }
    }
  
    const extraPositionKeys = Object.keys(POSITIONS_RANGE).filter(
      (k) => !VALID_INTERVALS.includes(Number(k))
    );
  
    if (extraPositionKeys.length > 0) {
      errors.push(
        `POSITIONS_RANGE has unexpected keys: [${extraPositionKeys.join(", ")}] — only ${VALID_INTERVALS.join(", ")} are allowed`
      );
    }
  
    // ---------------------------------------------------------------------------
    // PRICE_RANGES validation
    // Each interval must define a numeric min/max randomization range.
    // ---------------------------------------------------------------------------
    for (const interval of VALID_INTERVALS) {
      const range = PRICE_RANGES[interval];
  
      if (!range || typeof range !== "object" || Array.isArray(range)) {
        errors.push(`PRICE_RANGES[${interval}] must be an object with { min, max }`);
      } else {
        if (typeof range.min !== "number") {
          errors.push(`PRICE_RANGES[${interval}].min must be a number`);
        }
  
        if (typeof range.max !== "number") {
          errors.push(`PRICE_RANGES[${interval}].max must be a number`);
        }
  
        if (
          typeof range.min === "number" &&
          typeof range.max === "number" &&
          range.min >= range.max
        ) {
          errors.push(`PRICE_RANGES[${interval}].min must be less than .max`);
        }
      }
    }
  
    const extraPriceKeys = Object.keys(PRICE_RANGES).filter(
      (k) => !VALID_INTERVALS.includes(Number(k))
    );
  
    if (extraPriceKeys.length > 0) {
      errors.push(
        `PRICE_RANGES has unexpected keys: [${extraPriceKeys.join(", ")}] — only ${VALID_INTERVALS.join(", ")} are allowed`
      );
    }
  
    // ---------------------------------------------------------------------------
    // Final result
    // ---------------------------------------------------------------------------
    if (errors.length > 0) {
      console.error("Bot startup failed — invalid config:");
      errors.forEach((err) => console.error(`  ✖ ${err}`));
      process.exit(1);
    }
  
    console.log("Config validated successfully. Starting bot...");
  }
  
  /**
   * Registers signal handlers for graceful shutdown.
   *
   * These signals are common ways to stop a process:
   *   - SIGTERM: usually sent by process managers or the stop command
   *   - SIGINT: usually sent by Ctrl+C in the terminal
   *
   * Current shutdown behavior:
   *   - log a message
   *   - exit process cleanly
   */
  function setupSignalHandlers() {
    const shutdown = (signal) => {
      console.log(`Received ${signal}. Shutting down bot...`);
      process.exit(0);
    };
  
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
  
  /**
   * Starts the bot runtime.
   *
   * Flow:
   *   1. Validate config
   *   2. Register signal handlers
   *   3. Create a session ID for easier log tracing
   *   4. Launch the infinite bot loop from spot.mjs
   *
   * Note:
   *   initialize() does not return under normal operation because it runs the
   *   continuous polling loop forever.
   */
  export async function runBot() {
    validateConfig();
    setupSignalHandlers();
  
    const sessionId = `bot-${Date.now()}`;
  
    console.log("*******************************************************");
    console.log("LAUNCHING JAVASCRIPT BOT");
    console.log("*******************************************************");
    console.log(`Session ID: ${sessionId}`);
  
    await initialize(sessionId);
  }
  
  /**
   * Allow this file to be run directly as a script.
   *
   * This matters because in background mode, index.mjs spawns runner.mjs directly.
   */
  if (import.meta.url === `file://${process.argv[1]}`) {
    runBot().catch((error) => {
      console.error("Runner error:", error);
      process.exit(1);
    });
  }