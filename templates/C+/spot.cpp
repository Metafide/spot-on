#include "spot.hpp"
#include "config.hpp"
#include "request.hpp"

#include <nlohmann/json.hpp>

#include <chrono>
#include <cmath>
#include <future>
#include <iomanip>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

/*
===============================================================================
METAFIDE BOT CORE LOOP — spot.cpp
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
*/

namespace {

using json = nlohmann::json;

void sleep_for_seconds(int seconds) {
    std::this_thread::sleep_for(std::chrono::seconds(seconds));
}

int rand_int(int min_value, int max_value) {
    static thread_local std::mt19937 generator(std::random_device{}());
    std::uniform_int_distribution<int> distribution(min_value, max_value);
    return distribution(generator);
}

double random_choice(const std::vector<double>& values) {
    static thread_local std::mt19937 generator(std::random_device{}());
    std::uniform_int_distribution<std::size_t> distribution(0, values.size() - 1);
    return values[distribution(generator)];
}

std::string number_to_string(double value) {
    std::ostringstream stream;
    stream << std::fixed << std::setprecision((value == std::floor(value)) ? 0 : 1) << value;
    return stream.str();
}

int randomize_price(int current_price) {
    auto iterator = PRICE_RANGES.find(INTERVAL);
    const PriceRange range = (iterator != PRICE_RANGES.end())
        ? iterator->second
        : PriceRange{-40, 50};

    const int offset = rand_int(range.min, range.max);
    return current_price + offset;
}

std::vector<json> generate_positions(
    const std::string& gid,
    int current_price,
    int count
) {
    const auto amount_options = POSITIONS_RANGE.at(INTERVAL);
    std::vector<json> positions;
    positions.reserve(count);

    for (int i = 0; i < count; ++i) {
        const double amount = random_choice(amount_options);
        const int randomized_price = randomize_price(current_price);

        positions.push_back({
            {"gid", gid},
            {"c", CURRENCY},
            {"a", ASSET},
            {"sp", std::to_string(randomized_price)},
            {"f", number_to_string(amount)},
            {"pw", METAFIDE_USER_ADDRESS},
            {"n", NETWORK},
            {"it", INTERVAL}
        });
    }

    return positions;
}

void log_position_summary(const json& status) {
    std::cout << "Current positions:\n";
    if (status.contains("positions") && status["positions"].is_array()) {
        for (const auto& position : status["positions"]) {
            std::cout
                << "  amount=" << position.value("f", "")
                << " win=" << position.value("w", false)
                << " return=" << position.value("r", "")
                << "\n";
        }
    }

    std::cout << "Current streaks:\n";
    if (status.contains("streaks") && status["streaks"].is_array()) {
        for (const auto& streak : status["streaks"]) {
            std::cout
                << "  positionId=" << streak.value("positionId", "")
                << " streak=" << streak.value("streak", 0)
                << "\n";
        }
    }
}

void submit_positions(const std::vector<json>& positions, int retries = 0) {
    const int max_retries = 3;
    std::vector<json> failed;

    std::vector<std::future<std::pair<bool, std::string>>> futures;
    futures.reserve(positions.size());

    for (const auto& position : positions) {
        futures.push_back(std::async(std::launch::async, [position]() {
            try {
                const json result = request("POST", "spot", &position);
                return std::make_pair(true, result.value("txid", ""));
            } catch (const std::exception& error) {
                return std::make_pair(false, std::string(error.what()));
            }
        }));
    }

    for (std::size_t i = 0; i < futures.size(); ++i) {
        const auto result = futures[i].get();

        if (result.first) {
            std::cout << "Position " << (i + 1) << " placed: " << result.second << "\n";
        } else {
            std::cout << "Position " << (i + 1) << " failed: " << result.second << "\n";
            failed.push_back(positions[i]);
        }
    }

    if (!failed.empty() && retries < max_retries) {
        std::cout
            << "Retrying " << failed.size()
            << " failed position(s)... (attempt "
            << (retries + 1) << " of " << max_retries << ")\n";
        sleep_for_seconds(1);
        submit_positions(failed, retries + 1);
    }

    if (!failed.empty() && retries >= max_retries) {
        std::cout
            << failed.size()
            << " position(s) failed after "
            << max_retries
            << " retries. Skipping.\n";
    }
}

void main_cycle() {
    try {
        // ---------------------------------------------------------------------
        // Step 1: Fetch current live status for this asset/interval/network
        // ---------------------------------------------------------------------
        const json status = request(
            "GET",
            "status?asset=" + ASSET +
            "&token=" + CURRENCY +
            "&network=" + NETWORK +
            "&interval=" + std::to_string(INTERVAL)
        );

        if (status.is_null() || status.empty()) {
            return;
        }

        // ---------------------------------------------------------------------
        // Step 2: Inspect current positions already placed in the live game
        // ---------------------------------------------------------------------
        const auto existing_positions =
            status.contains("positions") && status["positions"].is_array()
                ? status["positions"].size()
                : 0;

        const int current_position_count = static_cast<int>(existing_positions);

        if (current_position_count > 0) {
            log_position_summary(status);

            // -----------------------------------------------------------------
            // Step 3: Enforce the configured maximum position count
            // -----------------------------------------------------------------
            if (current_position_count >= MAX_ALLOWED_POSITIONS) {
                std::cout << "Max positions reached for the current live game. Skipping cycle.\n";
                return;
            }
        }

        // ---------------------------------------------------------------------
        // Step 4: Fetch balance, game metadata, and live price in parallel
        // ---------------------------------------------------------------------
        auto balance_future = std::async(std::launch::async, []() {
            return request(
                "GET",
                "user-balance?currency=" + CURRENCY + "&network=" + NETWORK
            );
        });

        auto games_future = std::async(std::launch::async, []() {
            return request(
                "GET",
                "spot?asset=" + ASSET + "&interval=" + std::to_string(INTERVAL)
            );
        });

        auto price_future = std::async(std::launch::async, []() {
            return request(
                "GET",
                "live-price?asset=" + ASSET
            );
        });

        const json balance = balance_future.get();
        const json games = games_future.get();
        const json price = price_future.get();

        if (balance.is_null() || games.is_null() || price.is_null()) {
            std::cout << "Incomplete data received. Skipping cycle.\n";
            return;
        }

        // ---------------------------------------------------------------------
        // Step 5: Confirm that the game currently allows placing positions
        // ---------------------------------------------------------------------
        if (!games.value("can_place_position", false)) {
            std::cout << "Game is not accepting positions at this time. Skipping cycle.\n";
            return;
        }

        // ---------------------------------------------------------------------
        // Step 6: Optional early precision restriction
        // ---------------------------------------------------------------------
        if (ENABLE_EARLY_PRECISION && !games.value("early_precision_window", false)) {
            std::cout << "Early precision window is not open. Skipping cycle.\n";
            return;
        }

        const int current_price =
            static_cast<int>(std::round(price.value("value", 0.0)));

        // ---------------------------------------------------------------------
        // Step 7: Only generate the remaining number of allowed positions
        // ---------------------------------------------------------------------
        const int remaining_slots = MAX_ALLOWED_POSITIONS - current_position_count;

        if (remaining_slots <= 0) {
            std::cout << "No remaining slots available. Skipping cycle.\n";
            return;
        }

        const std::string gid = games["liveGame"].value("gid", "");
        const auto positions = generate_positions(gid, current_price, remaining_slots);

        std::cout << "Generated positions: " << positions.size() << "\n";

        // ---------------------------------------------------------------------
        // Step 8: Submit generated positions
        // ---------------------------------------------------------------------
        submit_positions(positions);

    } catch (const std::exception& error) {
        std::cout << "Error in main: " << error.what() << "\n";
    }
}

} // namespace

void initialize(const std::string& message) {
    std::cout << "Running bot session: " << message << "\n";

    while (true) {
        try {
            main_cycle();
        } catch (const std::exception& error) {
            std::cout << "Error in main loop: " << error.what() << "\n";
        }

        sleep_for_seconds(5);
    }
}