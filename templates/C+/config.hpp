#ifndef METAFIDE_CONFIG_HPP
#define METAFIDE_CONFIG_HPP

/*
===============================================================================
METAFIDE SPOT ON GAME BOT — config.hpp
===============================================================================

This file is the central configuration for the Metafide Spot On Game Bot.
The bot uses these settings to authenticate with the Metafide API and
automatically place positions in the Spot On prediction game.

BEFORE YOU START:
  1. Fill in METAFIDE_API_KEY with your key from the Metafide dashboard
  2. Fill in METAFIDE_USER_ADDRESS with your wallet address
  3. Choose your NETWORK, INTERVAL, CURRENCY, and ASSET
  4. Run on "testnet" first to verify everything works before going live

DASHBOARD: https://beta.surge.metafide.io/wallet
===============================================================================
*/

#include <map>
#include <string>
#include <vector>

// -----------------------------------------------------------------------------
// Shared types
// -----------------------------------------------------------------------------

struct PriceRange {
    int min;
    int max;
};

// -----------------------------------------------------------------------------
// API CONNECTION SETTINGS
// -----------------------------------------------------------------------------

inline const std::string METAFIDE_API_URL =
    "https://staging-rest-service-714806972467.us-east1.run.app";

inline const std::string METAFIDE_API_VERSION = "v1";
inline const std::string METAFIDE_BASE_PATH = "surge/games/";
inline const std::string METAFIDE_ENDPOINT =
    METAFIDE_API_URL + "/" + METAFIDE_API_VERSION + "/" + METAFIDE_BASE_PATH;

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

inline const std::string METAFIDE_API_KEY = "";

// -----------------------------------------------------------------------------
// NETWORK
// -----------------------------------------------------------------------------

inline const std::string NETWORK = "testnet";

// -----------------------------------------------------------------------------
// GAME SETTINGS
// -----------------------------------------------------------------------------

inline const std::string METAFIDE_USER_ADDRESS = "";
inline const int INTERVAL = 60;
inline const std::string CURRENCY = "USDC";
inline const std::string ASSET = "BTC_USDT";

// -----------------------------------------------------------------------------
// PRICE RANGE SETTINGS
// -----------------------------------------------------------------------------

inline const std::map<int, PriceRange> PRICE_RANGES = {
    {60, { -10, 10 }},
    {3600, { -40, 50 }},
    {23400, { -40, 50 }},
    {86400, { -40, 50 }}
};

// -----------------------------------------------------------------------------
// POSITION SETTINGS
// -----------------------------------------------------------------------------

inline const int MAX_ALLOWED_POSITIONS = 10;
inline const bool ENABLE_EARLY_PRECISION = false;

inline const std::map<int, std::vector<double>> POSITIONS_RANGE = {
    {60, {0.2, 0.3, 0.4, 0.5}},
    {3600, {1, 2, 3, 4}},
    {23400, {5, 6, 7, 8}},
    {86400, {5, 6, 7, 8}}
};

#endif