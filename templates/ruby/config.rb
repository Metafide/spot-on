# =============================================================================
# METAFIDE SPOT ON GAME BOT — config.rb
# =============================================================================
#
# This file is the central configuration for the Metafide Spot On Game Bot.
# The bot uses these settings to authenticate with the Metafide API and
# automatically place positions in the Spot On prediction game.
#
# BEFORE YOU START:
#   1. Fill in METAFIDE_API_KEY with your key from the Metafide dashboard
#   2. Fill in METAFIDE_USER_ADDRESS with your wallet address
#   3. Choose your NETWORK, INTERVAL, CURRENCY, and ASSET
#   4. Run on "testnet" first to verify everything works before going live
#
# DASHBOARD: https://beta.surge.metafide.io/wallet
# =============================================================================

# -----------------------------------------------------------------------------
# API CONNECTION SETTINGS
# These constants define where the bot sends its requests.
# You generally do not need to change these unless Metafide updates its API.
# -----------------------------------------------------------------------------

# The base URL of the Metafide REST API.
METAFIDE_API_URL = "https://staging-rest-service-714806972467.us-east1.run.app"

# The API version to use. Included in every request URL.
METAFIDE_API_VERSION = "v1"

# The base path for all game-related API endpoints.
METAFIDE_BASE_PATH = "surge/games/"

# The fully constructed API endpoint used by the bot.
METAFIDE_ENDPOINT = "#{METAFIDE_API_URL}/#{METAFIDE_API_VERSION}/#{METAFIDE_BASE_PATH}"

# -----------------------------------------------------------------------------
# AUTHENTICATION
# -----------------------------------------------------------------------------

# Your personal Metafide API key.
# Keep this value private and never commit it publicly.
METAFIDE_API_KEY = ""

# -----------------------------------------------------------------------------
# NETWORK
# -----------------------------------------------------------------------------

# The blockchain network the bot will operate on.
#
# Options:
#   "testnet" — safe for testing
#   "mainnet" — real funds / live environment
NETWORK = "testnet"

# -----------------------------------------------------------------------------
# GAME SETTINGS
# -----------------------------------------------------------------------------

# Your personal Metafide wallet address.
# This is attached to every position the bot places.
METAFIDE_USER_ADDRESS = ""

# The duration of each game round in seconds.
INTERVAL = 60

# The currency used to fund positions.
CURRENCY = "USDC"

# The asset the bot will place predictions on.
ASSET = "BTC_USDT"

# -----------------------------------------------------------------------------
# PRICE RANGE SETTINGS
# Defines how much the bot offsets the strike price from the current live price
# when generating positions.
# -----------------------------------------------------------------------------

# Randomization band for strike prices by interval.
PRICE_RANGES = {
  60 => { min: -10, max: 10 },
  3600 => { min: -40, max: 50 },
  23400 => { min: -40, max: 50 },
  86400 => { min: -40, max: 50 }
}.freeze

# -----------------------------------------------------------------------------
# POSITION SETTINGS
# These constants control how the bot manages and places positions.
# -----------------------------------------------------------------------------

# The maximum number of positions the bot may place per live game round.
MAX_ALLOWED_POSITIONS = 10

# If true, the bot places positions only during the early precision window.
ENABLE_EARLY_PRECISION = false

# Allowed position sizes per interval.
POSITIONS_RANGE = {
  60 => [0.2, 0.3, 0.4, 0.5],
  3600 => [1, 2, 3, 4],
  23400 => [5, 6, 7, 8],
  86400 => [5, 6, 7, 8]
}.freeze