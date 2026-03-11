require "pathname"
require_relative "./runner"

# =============================================================================
# METAFIDE BOT CLI — index.rb
# =============================================================================
#
# This file is the command-line entry point for the bot.
#
# It provides a small process manager so the bot can be:
#   - run in the foreground
#   - started in the background
#   - stopped later using a command
#   - checked for status
#   - inspected via log output
#
# Supported commands:
#   ruby index.rb run
#   ruby index.rb start
#   ruby index.rb stop
#   ruby index.rb status
#   ruby index.rb logs
# =============================================================================

# Base directory of the current file.
BASE_DIR = Pathname.new(__dir__).freeze

# Files used by the CLI process manager.
#
# PID_FILE:
#   Stores the process ID of the background bot process.
#
# LOG_FILE:
#   Stores the stdout/stderr output of the background bot.
PID_FILE = BASE_DIR.join(".metafide-bot.pid").freeze
LOG_FILE = BASE_DIR.join("metafide-bot.log").freeze
RUNNER_FILE = BASE_DIR.join("runner.rb").freeze

# Returns the CLI command passed by the user.
#
# Defaults to "run" if no command is given.
def get_command
  ARGV[0] || "run"
end

# Reads the PID file and returns the stored process ID.
#
# Returns:
#   - a valid integer PID if present
#   - nil if the file does not exist or is invalid
def read_pid
  return nil unless PID_FILE.exist?

  raw = PID_FILE.read.strip
  return nil if raw.empty?

  Integer(raw)
rescue ArgumentError
  nil
end

# Checks whether a process is currently running for a given PID.
def process_running?(pid)
  return false if pid.nil?

  Process.kill(0, pid)
  true
rescue Errno::ESRCH, RangeError
  false
rescue Errno::EPERM
  true
end

# Deletes the PID file if it exists.
def remove_pid_file
  PID_FILE.delete if PID_FILE.exist?
end

# Cleans up a stale PID file.
def ensure_stale_pid_is_cleared
  pid = read_pid
  remove_pid_file if pid && !process_running?(pid)
end

# Starts the bot in background mode.
#
# Flow:
#   1. Remove stale PID file if needed
#   2. Refuse to start if bot is already running
#   3. Open the log file in append mode
#   4. Spawn a detached Ruby process running runner.rb
#   5. Save child PID to PID file
def start_bot
  ensure_stale_pid_is_cleared

  existing_pid = read_pid
  if existing_pid && process_running?(existing_pid)
    puts "Bot is already running with PID #{existing_pid}"
    return
  end

  log_handle = File.open(LOG_FILE, "a")
  log_handle.sync = true

  pid = Process.spawn(
    RbConfig.ruby,
    RUNNER_FILE.to_s,
    chdir: BASE_DIR.to_s,
    out: log_handle,
    err: log_handle,
    in: File::NULL,
    pgroup: true
  )

  Process.detach(pid)
  PID_FILE.write(pid.to_s)

  puts "Bot started in background. PID: #{pid}"
  puts "Logs: #{LOG_FILE}"
ensure
  log_handle&.close
end

# Stops the background bot process using the PID file.
def stop_bot
  pid = read_pid

  if pid.nil?
    puts "Bot is not running."
    return
  end

  unless process_running?(pid)
    puts "Found stale PID file for PID #{pid}. Cleaning up."
    remove_pid_file
    return
  end

  Process.kill("TERM", pid)
  remove_pid_file
  puts "Bot stopped. PID: #{pid}"
rescue StandardError => e
  puts "Failed to stop bot with PID #{pid}: #{e}"
end

# Displays whether the bot is currently running.
def show_status
  ensure_stale_pid_is_cleared

  pid = read_pid
  if pid.nil?
    puts "Bot is not running."
    return
  end

  if process_running?(pid)
    puts "Bot is running. PID: #{pid}"
  else
    puts "Bot is not running, stale PID file found for PID #{pid}."
    remove_pid_file
  end
end

# Prints the last N lines of the log file.
def show_logs(lines = 50)
  unless LOG_FILE.exist?
    puts "No log file found yet."
    return
  end

  content = LOG_FILE.read
  all_lines = content.split("\n")
  tail = all_lines.last(lines) || []
  puts tail.join("\n")
end

# Runs the bot in the current terminal session.
#
# This is foreground mode.
def run_foreground
  run_bot
end

# Main CLI dispatcher.
def main
  command = get_command

  case command
  when "run"
    run_foreground
  when "start"
    start_bot
  when "stop"
    stop_bot
  when "status"
    show_status
  when "logs"
    show_logs
  else
    puts "Unknown command: #{command}"
    puts "Usage: ruby index.rb [run|start|stop|status|logs]"
  end
end

begin
  main
rescue StandardError => e
  puts "CLI error: #{e}"
  exit(1)
end