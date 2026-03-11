require_relative "./config"
require_relative "./spot"

# =============================================================================
# METAFIDE BOT RUNTIME — runner.rb
# =============================================================================
#
# This file is the actual runtime launcher for the bot.
#
# Responsibilities:
#   1. Validate configuration before startup
#   2. Register shutdown signal handlers
#   3. Start the continuous bot loop from spot.rb
#
# This file is used in two modes:
#
#   Foreground mode:
#     ruby index.rb run
#
#   Background mode:
#     ruby index.rb start
#
# Why this file exists:
#   It separates "CLI process management" from "bot runtime logic".
#   That keeps index.rb focused on commands, while this file focuses on
#   actually starting and running the bot safely.
# =============================================================================

# Validates all config values before the bot starts.
#
# Why this matters:
#   If config is invalid, we want to fail immediately with clear messages
#   instead of letting the bot run in a broken or unsafe state.
def validate_config
  errors = []

  # ---------------------------------------------------------------------------
  # Required fields
  # ---------------------------------------------------------------------------
  errors << "METAFIDE_API_KEY is not set" if METAFIDE_API_KEY.to_s.strip.empty?
  errors << "METAFIDE_USER_ADDRESS is not set" if METAFIDE_USER_ADDRESS.to_s.strip.empty?

  # ---------------------------------------------------------------------------
  # NETWORK validation
  # ---------------------------------------------------------------------------
  valid_networks = %w[mainnet testnet]
  unless valid_networks.include?(NETWORK)
    errors << %(NETWORK must be one of: #{valid_networks.join(", ")} — got "#{NETWORK}")
  end

  # ---------------------------------------------------------------------------
  # INTERVAL validation
  # ---------------------------------------------------------------------------
  valid_intervals = [60, 3600, 23400, 86400]
  unless valid_intervals.include?(INTERVAL)
    errors << %(INTERVAL must be one of: #{valid_intervals.join(", ")} — got "#{INTERVAL}")
  end

  # ---------------------------------------------------------------------------
  # Currency and asset validation
  # ---------------------------------------------------------------------------
  errors << %(CURRENCY must be "USDC" — got "#{CURRENCY}") unless CURRENCY == "USDC"
  errors << %(ASSET must be "BTC_USDT" — got "#{ASSET}") unless ASSET == "BTC_USDT"

  # ---------------------------------------------------------------------------
  # Position and feature flag validation
  # ---------------------------------------------------------------------------
  unless MAX_ALLOWED_POSITIONS.is_a?(Numeric) &&
         MAX_ALLOWED_POSITIONS >= 1 &&
         MAX_ALLOWED_POSITIONS <= 10
    errors << %(MAX_ALLOWED_POSITIONS must be a number between 1 and 10 — got "#{MAX_ALLOWED_POSITIONS}")
  end

  unless ENABLE_EARLY_PRECISION == true || ENABLE_EARLY_PRECISION == false
    errors << %(ENABLE_EARLY_PRECISION must be true or false — got "#{ENABLE_EARLY_PRECISION}")
  end

  # ---------------------------------------------------------------------------
  # POSITIONS_RANGE validation
  # Each interval must have an allowed set of position sizes.
  # ---------------------------------------------------------------------------
  position_minimums = {
    60 => 0.1,
    3600 => 1,
    23400 => 5,
    86400 => 5
  }

  valid_intervals.each do |interval|
    range_values = POSITIONS_RANGE[interval]

    if !range_values.is_a?(Array) || range_values.empty?
      errors << "POSITIONS_RANGE[#{interval}] must be a non-empty array"
    else
      minimum = position_minimums[interval]
      invalid = range_values.select { |value| !value.is_a?(Numeric) || value < minimum }

      if invalid.any?
        errors << "POSITIONS_RANGE[#{interval}] values must be numbers >= #{minimum} — invalid: [#{invalid.join(", ")}]"
      end
    end
  end

  extra_position_keys = POSITIONS_RANGE.keys - valid_intervals
  if extra_position_keys.any?
    errors << "POSITIONS_RANGE has unexpected keys: [#{extra_position_keys.join(", ")}] — only #{valid_intervals.join(", ")} are allowed"
  end

  # ---------------------------------------------------------------------------
  # PRICE_RANGES validation
  # Each interval must define a numeric min/max randomization range.
  # ---------------------------------------------------------------------------
  valid_intervals.each do |interval|
    price_range = PRICE_RANGES[interval]

    if !price_range.is_a?(Hash)
      errors << "PRICE_RANGES[#{interval}] must be an object with { min, max }"
    else
      errors << "PRICE_RANGES[#{interval}].min must be a number" unless price_range[:min].is_a?(Numeric)
      errors << "PRICE_RANGES[#{interval}].max must be a number" unless price_range[:max].is_a?(Numeric)

      if price_range[:min].is_a?(Numeric) &&
         price_range[:max].is_a?(Numeric) &&
         price_range[:min] >= price_range[:max]
        errors << "PRICE_RANGES[#{interval}].min must be less than .max"
      end
    end
  end

  extra_price_keys = PRICE_RANGES.keys - valid_intervals
  if extra_price_keys.any?
    errors << "PRICE_RANGES has unexpected keys: [#{extra_price_keys.join(", ")}] — only #{valid_intervals.join(", ")} are allowed"
  end

  # ---------------------------------------------------------------------------
  # Final result
  # ---------------------------------------------------------------------------
  if errors.any?
    puts "Bot startup failed — invalid config:"
    errors.each { |error| puts "  ✖ #{error}" }
    exit(1)
  end

  puts "Config validated successfully. Starting bot..."
end

# Registers signal handlers for graceful shutdown.
#
# These signals are common ways to stop a process:
#   - SIGTERM: usually sent by process managers or the stop command
#   - SIGINT: usually sent by Ctrl+C in the terminal
def setup_signal_handlers
  shutdown = proc do |signal_name|
    puts "Received #{signal_name}. Shutting down bot..."
    exit(0)
  end

  Signal.trap("TERM") { shutdown.call("SIGTERM") }
  Signal.trap("INT")  { shutdown.call("SIGINT") }
end

# Starts the bot runtime.
#
# Flow:
#   1. Validate config
#   2. Register signal handlers
#   3. Create a session ID for easier log tracing
#   4. Launch the infinite bot loop from spot.rb
def run_bot
  validate_config
  setup_signal_handlers

  session_id = "bot-#{(Time.now.to_f * 1000).to_i}"

  puts "*******************************************************"
  puts "LAUNCHING RUBY BOT"
  puts "*******************************************************"
  puts "Session ID: #{session_id}"

  initialize_bot(session_id)
end

run_bot if $PROGRAM_NAME == __FILE__