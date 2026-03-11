require_relative "./config"
require_relative "./request"

# =============================================================================
# METAFIDE BOT CORE LOOP — spot.rb
# =============================================================================
#
# This file contains the main bot behavior.
#
# Responsibilities:
#   1. Poll the Metafide API continuously
#   2. Check the current live game state
#   3. Determine whether positions can be placed
#   4. Generate randomized positions
#   5. Submit those positions
#   6. Retry failed submissions
#
# Runtime model:
#   - initialize() starts an infinite loop
#   - each cycle waits for the previous one to finish
#   - then sleeps for 5 seconds before running again
#
# This prevents overlapping execution.
# =============================================================================

# Simple sleep helper.
#
# Used to pause:
#   - between bot cycles
#   - between retry attempts
def sleep_for(seconds)
  sleep(seconds)
end

# Entry point for the bot loop.
#
# Parameters:
#   message -> session ID used only for logging context
#
# Behavior:
#   - runs forever
#   - calls main_cycle() once per cycle
#   - catches unexpected errors so one cycle failure does not kill the bot
#   - sleeps 5 seconds before the next cycle
def initialize_bot(message)
  puts "Running bot session: #{message}"

  loop do
    begin
      main_cycle
    rescue StandardError => e
      puts "Error in main loop: #{e}"
    end

    sleep_for(5)
  end
end

# Runs one full bot cycle.
#
# High-level flow:
#
#   Step 1:
#     Fetch current status for the configured asset/interval
#
#   Step 2:
#     Check how many positions already exist in the live game
#
#   Step 3:
#     If max positions are already reached, stop this cycle early
#
#   Step 4:
#     Fetch balance, live game data, and price
#
#   Step 5:
#     Validate whether the game is currently accepting positions
#
#   Step 6:
#     Optionally enforce early precision mode
#
#   Step 7:
#     Generate only the remaining number of allowed positions
#
#   Step 8:
#     Submit those positions to the API
def main_cycle
  # ---------------------------------------------------------------------------
  # Step 1: Fetch current live status for this asset/interval/network
  # ---------------------------------------------------------------------------
  status = request(
    "GET",
    "status?asset=#{ASSET}&token=#{CURRENCY}&network=#{NETWORK}&interval=#{INTERVAL}"
  )

  # If no status is returned, skip this cycle safely.
  return if status.nil? || status.empty?

  # ---------------------------------------------------------------------------
  # Step 2: Inspect current positions already placed in the live game
  # ---------------------------------------------------------------------------
  existing_positions = status["positions"] || []
  current_position_count = existing_positions.length

  # If positions already exist, print a useful summary for monitoring.
  if current_position_count > 0
    log_position_summary(status)

    # -------------------------------------------------------------------------
    # Step 3: Enforce the configured maximum position count
    # -------------------------------------------------------------------------
    if current_position_count >= MAX_ALLOWED_POSITIONS
      puts "Max positions reached for the current live game. Skipping cycle."
      return
    end
  end

  # ---------------------------------------------------------------------------
  # Step 4: Fetch balance, game metadata, and live price
  # ---------------------------------------------------------------------------
  balance = request(
    "GET",
    "user-balance?currency=#{CURRENCY}&network=#{NETWORK}"
  )
  games = request("GET", "spot?asset=#{ASSET}&interval=#{INTERVAL}")
  price = request("GET", "live-price?asset=#{ASSET}")

  # If any key dependency is missing, skip this cycle.
  if balance.nil? || games.nil? || price.nil?
    puts "Incomplete data received. Skipping cycle."
    return
  end

  # ---------------------------------------------------------------------------
  # Step 5: Confirm that the game currently allows placing positions
  # ---------------------------------------------------------------------------
  unless games["can_place_position"]
    puts "Game is not accepting positions at this time. Skipping cycle."
    return
  end

  # ---------------------------------------------------------------------------
  # Step 6: Optional early precision restriction
  # If enabled, only place positions during the early precision window.
  # ---------------------------------------------------------------------------
  if ENABLE_EARLY_PRECISION && !games["early_precision_window"]
    puts "Early precision window is not open. Skipping cycle."
    return
  end

  # Current price is rounded to a whole number before randomization.
  current_price = price["value"].round

  # ---------------------------------------------------------------------------
  # Step 7: Only generate the remaining number of allowed positions
  #
  # Example:
  #   MAX_ALLOWED_POSITIONS = 10
  #   current_position_count = 6
  #   remaining_slots = 4
  #
  # This is safer than always attempting 10 positions every cycle.
  # ---------------------------------------------------------------------------
  remaining_slots = MAX_ALLOWED_POSITIONS - current_position_count

  if remaining_slots <= 0
    puts "No remaining slots available. Skipping cycle."
    return
  end

  positions = generate_positions(
    games.dig("liveGame", "gid"),
    current_price,
    remaining_slots
  )

  puts "Generated positions: #{positions.length}"

  # ---------------------------------------------------------------------------
  # Step 8: Submit generated positions
  # ---------------------------------------------------------------------------
  submit_positions(positions)
rescue StandardError => e
  puts "Error in main: #{e}"
end

# Builds an array of position objects for API submission.
#
# Parameters:
#   gid           -> current live game ID
#   current_price -> current rounded live price
#   count         -> number of positions to generate
#
# How generation works:
#   - choose a random amount from POSITIONS_RANGE[INTERVAL]
#   - choose a randomized strike price around current_price
#   - build the payload expected by the Metafide API
def generate_positions(gid, current_price, count)
  amount_options = POSITIONS_RANGE[INTERVAL]
  positions = []

  count.times do
    amount = amount_options.sample
    randomized_price = randomize_price(current_price)

    positions << {
      "gid" => gid,
      "c" => CURRENCY,
      "a" => ASSET,
      "sp" => randomized_price.round.to_s,
      "f" => amount.to_s,
      "pw" => METAFIDE_USER_ADDRESS,
      "n" => NETWORK,
      "it" => INTERVAL
    }
  end

  positions
end

# Applies a random offset to the current live price.
#
# The offset range depends on the configured INTERVAL.
#
# Example:
#   current_price = 65000
#   range = { min: -10, max: 10 }
#   result may be anywhere from 64990 to 65010
#
# Fallback:
#   If no range exists for the current interval, use { min: -40, max: 50 }.
def randomize_price(current_price)
  price_range = PRICE_RANGES[INTERVAL] || { min: -40, max: 50 }
  offset = rand_int(price_range[:min], price_range[:max])
  current_price + offset
end

# Returns a random integer between min and max, inclusive.
def rand_int(min_value, max_value)
  rand(min_value..max_value)
end

# Submits positions to the API.
#
# Behavior:
#   - submits all positions one by one
#   - successful submissions are logged
#   - failed submissions are collected
#   - failed positions are retried up to MAX_RETRIES
def submit_positions(positions, retries = 0)
  max_retries = 3
  failed = []

  positions.each_with_index do |position, index|
    begin
      result = request("POST", "spot", position)
      puts "Position #{index + 1} placed: #{result["txid"]}"
    rescue StandardError => e
      puts "Position #{index + 1} failed: #{e}"
      failed << position
    end
  end

  # Retry only failed positions, not successful ones.
  if failed.any? && retries < max_retries
    puts(
      "Retrying #{failed.length} failed position(s)... " \
      "(attempt #{retries + 1} of #{max_retries})"
    )
    sleep_for(1)
    submit_positions(failed, retries + 1)
  end

  # Final failure state after retries are exhausted.
  if failed.any? && retries >= max_retries
    puts "#{failed.length} position(s) failed after #{max_retries} retries. Skipping."
  end
end

# Prints a readable summary of current positions and streaks.
#
# This is useful for monitoring how the live game is progressing.
def log_position_summary(status)
  formatted_positions = (status["positions"] || []).map do |position|
    {
      amount: position["f"],
      win: position["w"],
      return: position["r"]
    }
  end

  formatted_streaks = (status["streaks"] || []).map do |streak|
    {
      positionId: streak["positionId"],
      streak: streak["streak"]
    }
  end

  puts "Current positions:"
  formatted_positions.each { |row| puts row }

  puts "Current streaks:"
  formatted_streaks.each { |row| puts row }
end