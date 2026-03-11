#include "runner.hpp"
#include "config.hpp"
#include "spot.hpp"

#include <chrono>
#include <csignal>
#include <ctime>
#include <iostream>
#include <string>
#include <vector>

/*
===============================================================================
METAFIDE BOT RUNTIME — runner.cpp
===============================================================================

This file is the actual runtime launcher for the bot.

Responsibilities:
  1. Validate configuration before startup
  2. Register shutdown signal handlers
  3. Start the continuous bot loop from spot.cpp

This file is used in two modes:

  Foreground mode:
    ./metafide-bot run

  Background mode:
    ./metafide-bot start
===============================================================================
*/

namespace {

void validate_config() {
    std::vector<std::string> errors;

    // -------------------------------------------------------------------------
    // Required fields
    // -------------------------------------------------------------------------
    if (METAFIDE_API_KEY.empty()) {
        errors.push_back("METAFIDE_API_KEY is not set");
    }

    if (METAFIDE_USER_ADDRESS.empty()) {
        errors.push_back("METAFIDE_USER_ADDRESS is not set");
    }

    // -------------------------------------------------------------------------
    // NETWORK validation
    // -------------------------------------------------------------------------
    if (NETWORK != "mainnet" && NETWORK != "testnet") {
        errors.push_back(
            "NETWORK must be one of: mainnet, testnet — got \"" + NETWORK + "\""
        );
    }

    // -------------------------------------------------------------------------
    // INTERVAL validation
    // -------------------------------------------------------------------------
    if (INTERVAL != 60 && INTERVAL != 3600 && INTERVAL != 23400 && INTERVAL != 86400) {
        errors.push_back(
            "INTERVAL must be one of: 60, 3600, 23400, 86400 — got \"" +
            std::to_string(INTERVAL) + "\""
        );
    }

    // -------------------------------------------------------------------------
    // Currency and asset validation
    // -------------------------------------------------------------------------
    if (CURRENCY != "USDC") {
        errors.push_back("CURRENCY must be \"USDC\" — got \"" + CURRENCY + "\"");
    }

    if (ASSET != "BTC_USDT") {
        errors.push_back("ASSET must be \"BTC_USDT\" — got \"" + ASSET + "\"");
    }

    // -------------------------------------------------------------------------
    // Position and feature flag validation
    // -------------------------------------------------------------------------
    if (MAX_ALLOWED_POSITIONS < 1 || MAX_ALLOWED_POSITIONS > 10) {
        errors.push_back(
            "MAX_ALLOWED_POSITIONS must be a number between 1 and 10 — got \"" +
            std::to_string(MAX_ALLOWED_POSITIONS) + "\""
        );
    }

    // -------------------------------------------------------------------------
    // POSITIONS_RANGE validation
    // -------------------------------------------------------------------------
    const std::vector<int> valid_intervals = {60, 3600, 23400, 86400};
    const std::map<int, double> position_minimums = {
        {60, 0.1},
        {3600, 1},
        {23400, 5},
        {86400, 5}
    };

    for (int interval : valid_intervals) {
        const auto it = POSITIONS_RANGE.find(interval);
        if (it == POSITIONS_RANGE.end() || it->second.empty()) {
            errors.push_back(
                "POSITIONS_RANGE[" + std::to_string(interval) + "] must be a non-empty array"
            );
            continue;
        }

        const double minimum = position_minimums.at(interval);
        std::vector<std::string> invalid;

        for (double value : it->second) {
            if (value < minimum) {
                invalid.push_back(std::to_string(value));
            }
        }

        if (!invalid.empty()) {
            std::string joined;
            for (std::size_t i = 0; i < invalid.size(); ++i) {
                if (i > 0) joined += ", ";
                joined += invalid[i];
            }

            errors.push_back(
                "POSITIONS_RANGE[" + std::to_string(interval) +
                "] values must be numbers >= " + std::to_string(minimum) +
                " — invalid: [" + joined + "]"
            );
        }
    }

    for (const auto& [key, _] : POSITIONS_RANGE) {
        if (key != 60 && key != 3600 && key != 23400 && key != 86400) {
            errors.push_back(
                "POSITIONS_RANGE has unexpected key: [" + std::to_string(key) +
                "] — only 60, 3600, 23400, 86400 are allowed"
            );
        }
    }

    // -------------------------------------------------------------------------
    // PRICE_RANGES validation
    // -------------------------------------------------------------------------
    for (int interval : valid_intervals) {
        const auto it = PRICE_RANGES.find(interval);
        if (it == PRICE_RANGES.end()) {
            errors.push_back(
                "PRICE_RANGES[" + std::to_string(interval) +
                "] must be an object with { min, max }"
            );
            continue;
        }

        if (it->second.min >= it->second.max) {
            errors.push_back(
                "PRICE_RANGES[" + std::to_string(interval) + "].min must be less than .max"
            );
        }
    }

    for (const auto& [key, _] : PRICE_RANGES) {
        if (key != 60 && key != 3600 && key != 23400 && key != 86400) {
            errors.push_back(
                "PRICE_RANGES has unexpected key: [" + std::to_string(key) +
                "] — only 60, 3600, 23400, 86400 are allowed"
            );
        }
    }

    // -------------------------------------------------------------------------
    // Final result
    // -------------------------------------------------------------------------
    if (!errors.empty()) {
        std::cout << "Bot startup failed — invalid config:\n";
        for (const auto& error : errors) {
            std::cout << "  ✖ " << error << "\n";
        }
        std::exit(1);
    }

    std::cout << "Config validated successfully. Starting bot...\n";
}

void signal_handler(int signal_number) {
    const std::string signal_name =
        (signal_number == SIGTERM) ? "SIGTERM" :
        (signal_number == SIGINT) ? "SIGINT" :
        ("signal " + std::to_string(signal_number));

    std::cout << "Received " << signal_name << ". Shutting down bot...\n";
    std::exit(0);
}

void setup_signal_handlers() {
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);
}

} // namespace

void run_bot() {
    validate_config();
    setup_signal_handlers();

    const auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    const std::string session_id = "bot-" + std::to_string(now);

    std::cout << "*******************************************************\n";
    std::cout << "LAUNCHING C++ BOT\n";
    std::cout << "*******************************************************\n";
    std::cout << "Session ID: " << session_id << "\n";

    initialize(session_id);
}