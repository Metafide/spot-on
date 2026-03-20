# Metafide Spot Bot — JavaScript CLI

A JavaScript CLI bot for automatically placing positions in the Metafide Spot game.

This version is designed to be easy to run from the terminal in either:

- foreground mode
- background mode with start/stop/status/log commands

---

## What this bot does

The bot continuously checks the Metafide Spot game and, when conditions allow, places randomized positions based on your configuration.

Main behavior:

- validates your config before startup
- polls the Metafide API every 5 seconds
- checks the current live game
- checks whether positions can be placed
- generates randomized strike prices around the current live price
- submits positions to the API
- retries failed submissions up to 3 times

---

## Features

- CLI commands for process management
- background execution
- PID-based stop/status handling
- log file support
- config validation before startup
- retry support for failed submissions
- position cap enforcement per live round

---

## Project structure

```text
.
├── config.mjs
├── index.mjs
├── request.mjs
├── runner.mjs
├── spot.mjs
└── README.md
```

### File overview

#### `config.mjs`

Contains all configuration values such as:

- API key
- user wallet address
- network
- interval
- currency
- asset
- allowed position ranges
- price randomization ranges

#### `index.mjs`

CLI entry point.

Provides commands like:

- `run`
- `start`
- `stop`
- `status`
- `logs`

#### `runner.mjs`

Runtime launcher.

Responsible for:

- validating config
- setting up shutdown handling
- starting the main bot loop

#### `request.mjs`

Reusable HTTP request utility for calling the Metafide API.

#### `spot.mjs`

Core bot logic.

Responsible for:

- polling game state
- generating positions
- submitting positions
- retrying failures
- printing summaries

---

## Requirements

- Node.js 18 or higher

Node 18+ is recommended because it includes native `fetch`.

Check your Node version:

```bash
node -v
```

---

## Setup

### 1. Clone or copy the project

Place the bot files in a folder.

### 2. Update `config.mjs`

Open `config.mjs` and set your real values:

```javascript
const METAFIDE_API_KEY = "";
const METAFIDE_USER_ADDRESS = "";
```

You should also review:

- `NETWORK`
- `INTERVAL`
- `CURRENCY`
- `ASSET`
- `MAX_ALLOWED_POSITIONS`
- `ENABLE_EARLY_PRECISION`

---

## Configuration

### Required fields

#### `METAFIDE_API_KEY`

Your Metafide API key.

#### `METAFIDE_USER_ADDRESS`

Your wallet address used for placing positions.

---

### Main config fields

#### `NETWORK`

Supported values:

- `"testnet"`
- `"mainnet"`

Example:

```javascript
const NETWORK = "testnet";
```

---

#### `INTERVAL`

Supported values:

- `60`
- `3600`
- `86400`

Example:

```javascript
const INTERVAL = 60;
```

---

#### `CURRENCY`

Currently expected:

```javascript
const CURRENCY = "USDC";
```

---

#### `ASSET`

Current JavaScript version is configured for:

```javascript
const ASSET = "BTC_USDT";
```

---

#### `MAX_ALLOWED_POSITIONS`

Maximum positions the bot can place in a live round.

Example:

```javascript
const MAX_ALLOWED_POSITIONS = 10;
```

---

#### `ENABLE_EARLY_PRECISION`

If `true`, the bot only places positions during the early precision window.

Example:

```javascript
const ENABLE_EARLY_PRECISION = false;
```

---

### `POSITIONS_RANGE`

Defines the possible funding amounts the bot may choose from for each interval.

Example:

```javascript
const POSITIONS_RANGE = {
  60: [0.01, 0.02, 0.03, 0.04],
  3600: [1, 2, 3, 4],
  86400: [5, 6, 7, 8],
};
```

---

### `PRICE_RANGES`

Defines how much the strike price can vary from the current live price.

Example:

```javascript
const PRICE_RANGES = {
  60: { min: -10, max: 10 },
  3600: { min: -40, max: 50 },
  86400: { min: -40, max: 50 },
};
```

---

## Running the bot

### Foreground mode

Runs directly in your terminal.

```bash
node index.mjs run
```

Use this when:

- testing
- debugging
- watching logs live

Stop with:

```bash
Ctrl + C
```

---

### Background mode

Starts the bot as a detached process and frees your terminal.

```bash
node index.mjs start
```

This will:

- create a PID file
- write logs to a log file
- allow later stop/status/log commands

---

## CLI commands

### Run in foreground

```bash
node index.mjs run
```

### Start in background

```bash
node index.mjs start
```

### Stop background bot

```bash
node index.mjs stop
```

### Check bot status

```bash
node index.mjs status
```

### View recent logs

```bash
node index.mjs logs
```

---

## Background process files

When running in background mode, the CLI creates:

### PID file

```text
.metafide-bot.pid
```

This stores the running bot process ID.

### Log file

```text
metafide-bot.log
```

This stores stdout and stderr from the background process.

---

## Example workflow

Start the bot:

```bash
node index.mjs start
```

Check if it is running:

```bash
node index.mjs status
```

Read logs:

```bash
node index.mjs logs
```

Stop it later:

```bash
node index.mjs stop
```

---

## Bot cycle behavior

Each cycle works like this:

1. fetch current game status
2. inspect current placed positions
3. stop early if max positions already reached
4. fetch balance, live game, and live price
5. verify the game can accept positions
6. optionally check early precision window
7. generate only the remaining allowed positions
8. submit them
9. retry failed ones up to 3 times

The bot waits 5 seconds between cycles.

---

## Important behavior

### Position cap logic

The bot does **not** always place the full max every cycle.

Instead, it calculates:

```text
remainingSlots = MAX_ALLOWED_POSITIONS - currentPositionCount
```

So if your max is 10 and 6 positions already exist, it only attempts 4 more.

This avoids unnecessary duplicate attempts.

---

### Retry logic

When submissions fail, the bot retries failed positions only.

- max retries: 3
- delay between retries: 1 second

---

## Logs

Foreground mode prints logs directly to the terminal.

Background mode writes logs to:

```text
metafide-bot.log
```

You can view the recent log output using:

```bash
node index.mjs logs
```

---

## Validation errors

If config is missing or invalid, the bot will fail before starting.

Examples:

- missing API key
- missing wallet address
- invalid network
- invalid interval
- invalid position ranges
- invalid price ranges

This prevents the bot from running in a broken state.

---

## Recommended usage

### For testing

Use testnet first.

```javascript
const NETWORK = "testnet";
```

### For production

Only switch to mainnet after confirming:

- your API key is correct
- your wallet address is correct
- your ranges are safe
- your position sizing is correct

---

## Troubleshooting

### Bot says config is invalid

Check `config.mjs` and ensure:

- `METAFIDE_API_KEY` is set
- `METAFIDE_USER_ADDRESS` is set
- `NETWORK` is valid
- `INTERVAL` is valid

---

### Bot starts but places nothing

Possible reasons:

- game is not accepting positions
- early precision is enabled but the window is closed
- max positions already reached
- API response is incomplete

Check logs:

```bash
node index.mjs logs
```

---

### Bot says it is already running

Check status:

```bash
node index.mjs status
```

If needed, stop it:

```bash
node index.mjs stop
```

---

### Bot left a stale PID file

The CLI automatically cleans stale PID files when possible during:

- `start`
- `status`

---

## Safety notes

Use carefully on live environments.

Before using `mainnet`, confirm:

- your funding amounts are intended
- your ranges are intended
- your asset and interval are correct
- you understand the game behavior

---

## Quick start

1. Fill in `config.mjs`
2. Run:

```bash
node index.mjs run
```

3. Once confirmed, use background mode:

```bash
node index.mjs start
```
