/**
 * =============================================================================
 * METAFIDE BOT CLI — index.mjs
 * =============================================================================
 *
 * This file is the command-line entry point for the bot.
 *
 * It provides a small process manager so the bot can be:
 *   - run in the foreground
 *   - started in the background
 *   - stopped later using a command
 *   - checked for status
 *   - inspected via log output
 *
 * Supported commands:
 *   node index.mjs run
 *   node index.mjs start
 *   node index.mjs stop
 *   node index.mjs status
 *   node index.mjs logs
 *
 * Why this file exists:
 *   The previous worker-based setup was useful for isolating logic, but it did
 *   not solve true background process management from the terminal.
 *
 *   This CLI does solve that by:
 *     1. starting a detached child process
 *     2. storing its PID in a file
 *     3. writing logs to a file
 *     4. allowing later stop/status/log commands
 * =============================================================================
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

/**
 * Convert import.meta.url into normal filesystem paths.
 * This is the ES module equivalent of __filename / __dirname in CommonJS.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Files used by the CLI process manager.
 *
 * PID_FILE:
 *   Stores the process ID of the background bot process.
 *
 * LOG_FILE:
 *   Stores the stdout/stderr output of the background bot.
 *
 * RUNNER_FILE:
 *   The actual bot runtime file. This is what gets launched in background mode.
 */
const PID_FILE = path.join(__dirname, ".metafide-bot.pid");
const LOG_FILE = path.join(__dirname, "metafide-bot.log");
const RUNNER_FILE = path.join(__dirname, "runner.mjs");

/**
 * Returns the CLI command passed by the user.
 *
 * Examples:
 *   node index.mjs run    -> "run"
 *   node index.mjs start  -> "start"
 *
 * Defaults to "run" if no command is given.
 */
function getCommand() {
  return process.argv[2] || "run";
}

/**
 * Reads the PID file and returns the stored process ID.
 *
 * Returns:
 *   - a valid integer PID if present
 *   - null if the file does not exist or is invalid
 */
function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;

  const raw = fs.readFileSync(PID_FILE, "utf8").trim();
  if (!raw) return null;

  const pid = Number(raw);
  return Number.isInteger(pid) ? pid : null;
}

/**
 * Checks whether a process is currently running for a given PID.
 *
 * We use:
 *   process.kill(pid, 0)
 *
 * This does NOT kill the process.
 * It only checks whether Node can signal it.
 *
 * Returns:
 *   true  -> process exists
 *   false -> process does not exist / cannot be signaled
 */
function isProcessRunning(pid) {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes the PID file if it exists.
 *
 * Used when:
 *   - the bot is stopped
 *   - a stale PID file is detected
 */
function removePidFile() {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

/**
 * Cleans up a stale PID file.
 *
 * A stale PID file means:
 *   - we have a PID file
 *   - but that process is no longer running
 *
 * This prevents "ghost bot" situations where the CLI thinks the bot is running
 * even though it has already exited.
 */
function ensureStalePidIsCleared() {
  const pid = readPid();
  if (pid && !isProcessRunning(pid)) {
    removePidFile();
  }
}

/**
 * Starts the bot in detached/background mode.
 *
 * Flow:
 *   1. Remove stale PID file if needed
 *   2. Refuse to start if bot is already running
 *   3. Open the log file for append mode
 *   4. Spawn a detached Node process running runner.mjs
 *   5. Save child PID to PID file
 *   6. Unref the child so this CLI command can exit immediately
 */
function startBot() {
  ensureStalePidIsCleared();

  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Bot is already running with PID ${existingPid}`);
    return;
  }

  const logFd = fs.openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [RUNNER_FILE], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    cwd: __dirname,
    env: process.env,
  });

  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  console.log(`Bot started in background. PID: ${child.pid}`);
  console.log(`Logs: ${LOG_FILE}`);
}

/**
 * Stops the background bot process using the PID file.
 *
 * Flow:
 *   1. Read PID file
 *   2. If no PID file exists, bot is not running
 *   3. If PID exists but process is dead, clean up stale PID file
 *   4. Otherwise send SIGTERM to stop the process
 *   5. Remove PID file
 */
function stopBot() {
  const pid = readPid();

  if (!pid) {
    console.log("Bot is not running.");
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`Found stale PID file for PID ${pid}. Cleaning up.`);
    removePidFile();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    removePidFile();
    console.log(`Bot stopped. PID: ${pid}`);
  } catch (error) {
    console.error(`Failed to stop bot with PID ${pid}:`, error.message);
  }
}

/**
 * Displays whether the bot is currently running.
 *
 * Also clears stale PID files automatically if needed.
 */
function showStatus() {
  ensureStalePidIsCleared();

  const pid = readPid();
  if (!pid) {
    console.log("Bot is not running.");
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`Bot is running. PID: ${pid}`);
  } else {
    console.log(`Bot is not running, stale PID file found for PID ${pid}.`);
    removePidFile();
  }
}

/**
 * Prints the last N lines of the log file.
 *
 * Defaults to the last 50 lines.
 */
function showLogs(lines = 50) {
  if (!fs.existsSync(LOG_FILE)) {
    console.log("No log file found yet.");
    return;
  }

  const content = fs.readFileSync(LOG_FILE, "utf8");
  const allLines = content.split("\n");
  const tail = allLines.slice(-lines).join("\n");
  console.log(tail);
}

/**
 * Runs the bot in the current terminal session.
 *
 * This is foreground mode:
 *   - logs are printed directly to the terminal
 *   - Ctrl+C stops the bot
 *
 * The actual runtime is implemented in runner.mjs.
 */
async function runForeground() {
  const { runBot } = await import("./runner.mjs");
  await runBot();
}

/**
 * Main CLI dispatcher.
 *
 * Maps each command to its matching behavior.
 */
async function main() {
  const command = getCommand();

  switch (command) {
    case "run":
      await runForeground();
      break;

    case "start":
      startBot();
      break;

    case "stop":
      stopBot();
      break;

    case "status":
      showStatus();
      break;

    case "logs":
      showLogs();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Usage: node index.mjs [run|start|stop|status|logs]");
  }
}

/**
 * Global top-level error handler for the CLI command itself.
 */
main().catch((error) => {
  console.error("CLI error:", error);
  process.exit(1);
});