/**
 * =============================================================================
 * METAFIDE SPOT ON GAME BOT — config.js
 * =============================================================================
 *
 * This file is the central configuration for the Metafide Spot On Game Bot.
 * The bot uses these settings to authenticate with the Metafide API and
 * automatically place positions in the Spot On prediction game.
 *
 * BEFORE YOU START:
 *   1. Fill in METAFIDE_API_KEY with your key from the Metafide dashboard
 *   2. Fill in METAFIDE_GAME_ADDRESS with your game contract address
 *   3. Choose your NETWORK, INTERVAL, CURRENCY, and ASSET
 *   4. Run on "testnet" first to verify everything works before going live
 *
 * DASHBOARD: https://beta.surge.metafide.io/wallet
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// API CONNECTION SETTINGS
// These constants define where the bot sends its requests.
// You generally do not need to change these unless Metafide updates its API.
// -----------------------------------------------------------------------------

/**
 * The base URL of the Metafide REST API.
 * All HTTP requests made by the bot are sent to this server.
 */
const METAFIDE_API_URL =
  "https://staging-rest-service-714806972467.us-east1.run.app";

/**
 * The API version to use. Included in every request URL.
 * Update this if Metafide releases a newer API version (e.g. "v2").
 */
const METAFIDE_API_VERSION = "v1";

/**
 * The base path for all game-related API endpoints.
 * Combined with the URL and version to build the full endpoint.
 */
const METAFIDE_BASE_PATH = "surge/games/";

/**
 * The fully constructed API endpoint, built from the three constants above.
 * Format: {API_URL}/{API_VERSION}/{BASE_PATH}
 * This is what the bot uses directly when making API calls.
 *
 * Example result: https://staging-rest-service-.../v1/surge/games/
 */
const METAFIDE_ENDPOINT = `${METAFIDE_API_URL}/${METAFIDE_API_VERSION}/${METAFIDE_BASE_PATH}`;

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

/**
 * Your personal Metafide API key.
 * This authenticates your requests — keep this value private and never
 * commit it to a public repository.
 *
 * How to get it: Log in at https://beta.surge.metafide.io/wallet
 *                and navigate to the Wallet section.
 *
 * @example METAFIDE_API_KEY = "metafide_0cdba......."
 */
const METAFIDE_API_KEY = "metafide_b2c77a342851a04978e4459ea014fcbe";

// -----------------------------------------------------------------------------
// NETWORK
// -----------------------------------------------------------------------------

/**
 * The blockchain network the bot will operate on.
 *
 * Options:
 *   "testnet" — Sandbox environment. Safe for testing, no real funds involved.
 *   "mainnet" — Live network. Uses real funds. Switch only when fully tested.
 *
 * @default "testnet"
 */
const NETWORK = "testnet";

// -----------------------------------------------------------------------------
// GAME SETTINGS
// -----------------------------------------------------------------------------

/**
 * Your personal on-chain wallet address on the Metafide platform.
 * This is attached to every position the bot places to identify you as the player.
 *
 * How to get it: Log in at https://beta.surge.metafide.io/wallet
 *                and find your address in the Wallet section.
 *
 * @example METAFIDE_USER_ADDRESS = "0xAbC123..."
 */
const METAFIDE_USER_ADDRESS = "0x50294f689a5C9b8466222448453dD0BDA934d7dA";

/**
 * The duration of each game round the bot participates in, in seconds.
 *
 * Supported values per asset:
 *   BTC_USDT : 60 (1 minute) | 3600 (1 hour) | 86400 (1 day)
 *   NVIDIA   : 60 (1 minute) | 3600 (1 hour) | 86400 (1 day)
 *
 * @default 60
 */
const INTERVAL = 60;

/**
 * The currency used to fund your positions in the game.
 * USDC is the standard stablecoin accepted on the Metafide platform.
 *
 * Note: Amount values must be whole numbers (no decimals).
 *
 * @default "USDC"
 */
const CURRENCY = "USDC";

/**
 * The asset (trading pair) the bot will place predictions on.
 *
 * Supported assets:
 *   "BTC_USDT" — Bitcoin price denominated in USDT
 *   "NVIDIA"   — NVIDIA stock price feed
 *
 * Note: Price values must be whole numbers (no decimals).
 *
 * @default "BTC_USDT"
 */
const ASSET = "BTC_USDT";

// -----------------------------------------------------------------------------
// PRICE RANGE SETTINGS
// Defines how much the bot offsets the strike price from the current live price
// when generating positions. Each interval maps to a min/max offset range (in USD).
// A wider range spreads positions further from the live price.
// The default range { min: -40, max: 50 } is used for any unrecognised interval.
// -----------------------------------------------------------------------------

/**
 * The price offset ranges per game interval (in seconds).
 * Used by randomizePrice() in spot.mjs to slightly vary each position's
 * strike price around the current live asset price.
 *
 * @property {number} min - Maximum negative offset from live price
 * @property {number} max - Maximum positive offset from live price
 */
const PRICE_RANGES = {
  60: { min: -10, max: 10 },
  3600: { min: -40, max: 50 },
  86400: { min: -40, max: 50 },
};

// -----------------------------------------------------------------------------
// POSITION SETTINGS
// These constants control how the bot manages and places positions in the game.
// -----------------------------------------------------------------------------

/**
 * The maximum number of positions the bot is allowed to place per game round.
 * Acts as a safety cap to prevent over-exposure in a single round.
 *
 * @default 10
 */
const MAX_ALLOWED_POSITIONS = 10;

/**
 * When set to true, the bot will only place positions during the early
 * precision window of a game round — the period at the start of a round
 * where predictions may carry higher accuracy or reward potential.
 *
 * Set to false to allow the bot to place positions at any time during the round.
 *
 * @default false
 */
const ENABLE_EARLY_PRECISION = false;

/**
 * Defines the spread of position sizes the bot can choose from,
 * mapped to each supported game interval (in seconds).
 *
 * Each array represents the possible position amounts (in USDC) for that interval.
 * The bot will pick from these values when deciding how much to place per position.
 *
 * Note: All values must be whole numbers as required by the Metafide API.
 *
 * Intervals:
 *   60    →  1-minute rounds  — smaller positions (0.2 – 0.5 USDC)
 *   3600  →  1-hour rounds    — medium positions  (1 – 4 USDC)
 *   86400 →  1-day rounds     — larger positions  (5 – 8 USDC)
 */
const POSITIONS_RANGE = {
  60: [0.01, 0.02, 0.03, 0.04],
  3600: [1, 2, 3, 4],
  86400: [5, 6, 7, 8],
};

// -----------------------------------------------------------------------------
// EXPORTS
// Note: This is an ES module (config.mjs) so we use `export` syntax.
// -----------------------------------------------------------------------------
export {
  METAFIDE_API_KEY,
  NETWORK,
  METAFIDE_USER_ADDRESS,
  INTERVAL,
  CURRENCY,
  ASSET,
  METAFIDE_ENDPOINT,
  MAX_ALLOWED_POSITIONS,
  ENABLE_EARLY_PRECISION,
  POSITIONS_RANGE,
  PRICE_RANGES,
};
