# Metafide Spot CLI Bot 

A Metafide Spot CLI bot for automatically placing positions in the Metafide Spot game.

This project includes implementations in:

- JavaScript
- Python
- Go
- Ruby
- C++

Each version follows the same core behavior and the same CLI pattern, so it is easy to switch between languages while keeping the bot logic consistent.

---

## What this bot does

The bot continuously checks the Metafide Spot game and, when conditions allow, places randomized positions based on your configuration.

**Main behavior:**

- Validates config before startup
- Polls the Metafide API every 5 seconds
- Checks the current live game
- Checks whether positions can be placed
- Generates randomized strike prices around the current live price
- Submits positions to the API
- Retries failed submissions up to 3 times

---

## Features

- CLI commands for process management
- Foreground and background execution
- PID-based stop and status handling
- Log file support
- Config validation before startup
- Retry support for failed submissions
- Position cap enforcement per live round
- Similar project structure across all supported languages

---

## Common CLI commands

All versions follow the same command pattern:

| Command  | Description                                      |
|----------|--------------------------------------------------|
| `run`    | Runs the bot in the foreground                   |
| `start`  | Starts the bot in the background                 |
| `stop`   | Stops the background bot using the stored PID    |
| `status` | Shows whether the bot is currently running       |
| `logs`   | Prints recent log lines from the background bot  |

### `run`

Runs the bot in the foreground. Use this when testing, debugging, or watching logs live.

### `start`

Starts the bot in the background and frees your terminal.

### `stop`

Stops the background bot using the stored PID.

### `status`

Shows whether the bot is currently running.

### `logs`

Prints recent log lines from the background bot.

---

## Example commands by language

### JavaScript

```bash
node index.mjs run
node index.mjs start
node index.mjs stop
node index.mjs status
node index.mjs logs
```

### Python

```bash
python index.py run
python index.py start
python index.py stop
python index.py status
python index.py logs
```

### Go

Using `go run`:

```bash
go run . run
go run . start
go run . stop
go run . status
go run . logs
```

Using a built binary:

```bash
./metafide-bot run
./metafide-bot start
./metafide-bot stop
./metafide-bot status
./metafide-bot logs
```

### Ruby

```bash
ruby index.rb run
ruby index.rb start
ruby index.rb stop
ruby index.rb status
ruby index.rb logs
```

### C++

```bash
./metafide-bot run
./metafide-bot start
./metafide-bot stop
./metafide-bot status
./metafide-bot logs
```

---

## Common bot behavior

Each cycle works like this:

1. Fetch current game status
2. Inspect current placed positions
3. Stop early if max positions already reached
4. Fetch balance, live game, and live price
5. Verify the game can accept positions
6. Optionally check early precision window
7. Generate only the remaining allowed positions
8. Submit them
9. Retry failed ones up to 3 times

The bot waits 5 seconds between cycles.

### Position cap logic

The bot does not always place the full maximum every cycle. Instead, it calculates:

```
remainingSlots = MAX_ALLOWED_POSITIONS - currentPositionCount
```

So if your max is 10 and 6 positions already exist, it only attempts 4 more. This avoids unnecessary duplicate attempts.

### Retry logic

When submissions fail, the bot retries failed positions only.

- Max retries: `3`
- Delay between retries: `1 second`

---

## Configuration

Each language version includes a config file that defines the bot settings.

### Main config values

| Key                     | Description                                              |
|-------------------------|----------------------------------------------------------|
| `METAFIDE_API_KEY`      | Your Metafide API key                                    |
| `METAFIDE_USER_ADDRESS` | Your wallet address used for placing positions           |
| `NETWORK`               | `testnet` or `mainnet`                                   |
| `INTERVAL`              | `60`, `3600`, `23400`, or `86400`                        |
| `CURRENCY`              | Expected value: `USDC`                                   |
| `ASSET`                 | Default supported asset: `BTC_USDT`                      |
| `MAX_ALLOWED_POSITIONS` | Maximum positions the bot can place in a live round      |
| `ENABLE_EARLY_PRECISION`| If enabled, only places positions in the early window    |

### Example configuration

```
METAFIDE_API_KEY = ""
METAFIDE_USER_ADDRESS = ""
NETWORK = "testnet"
INTERVAL = 60
CURRENCY = "USDC"
ASSET = "BTC_USDT"
MAX_ALLOWED_POSITIONS = 10
ENABLE_EARLY_PRECISION = false
```

### Example position range configuration

```
60     -> [0.2, 0.3, 0.4, 0.5]
3600   -> [1, 2, 3, 4]
23400  -> [5, 6, 7, 8]
86400  -> [5, 6, 7, 8]
```

### Example price range configuration

```
60     -> min: -10,  max: 10
3600   -> min: -40,  max: 50
23400  -> min: -40,  max: 50
86400  -> min: -40,  max: 50
```

---

## Project structure

### JavaScript

```
javascript/
├── config.mjs
├── index.mjs
├── request.mjs
├── runner.mjs
├── spot.mjs
└── README.md
```

### Python

```
python/
├── config.py
├── index.py
├── request.py
├── runner.py
├── spot.py
└── requirements.txt
```

### Go

```
go/
├── config.go
├── main.go
├── request.go
├── runner.go
├── spot.go
└── go.mod
```

### Ruby

```
ruby/
├── config.rb
├── index.rb
├── request.rb
├── runner.rb
├── spot.rb
└── Gemfile
```

### C++

```
cpp/
├── config.hpp
├── main.cpp
├── request.cpp
├── request.hpp
├── runner.cpp
├── runner.hpp
├── spot.cpp
├── spot.hpp
└── CMakeLists.txt
```

---

## File overview

Across all languages, the files share the same responsibilities.

| File              | Responsibility                                                                 |
|-------------------|--------------------------------------------------------------------------------|
| `config.*`        | API key, wallet address, network, interval, currency, asset, ranges            |
| `request.*`       | Reusable HTTP helper for authenticated requests to the Metafide API            |
| `spot.*`          | Core bot logic — polling, generating positions, submitting, retrying           |
| `runner.*`        | Validates config, registers shutdown handlers, starts the bot loop             |
| `index.*` / `main.*` | CLI entry point — dispatches run, start, stop, status, logs commands       |

---

## Background process files

When running in background mode, each version creates:

| File                  | Purpose                                      |
|-----------------------|----------------------------------------------|
| `.metafide-bot.pid`   | Stores the running bot process ID            |
| `metafide-bot.log`    | Stores stdout and stderr from the background process |

---

## Language-specific setup

### JavaScript

**Requirements:** Node.js 18+

```bash
node index.mjs run
```

### TypeScript

**Requirements:** Node.js 18+, TypeScript, `@types/node`

```bash
npm install
npm run build
node dist/index.js run
```

### Python

**Requirements:** Python 3.10+, `requests`

```bash
pip install -r requirements.txt
python index.py run
```

### Go

**Requirements:** Go 1.22+

```bash
go run . run
```

Or build first:

```bash
go build -o metafide-bot
./metafide-bot run
```

### Ruby

**Requirements:** Ruby 3+

```bash
bundle install
ruby index.rb run
```

### C++

**Requirements:** C++17 compiler, libcurl, nlohmann/json, CMake

```bash
mkdir build
cd build
cmake ..
make
./metafide-bot run
```

---

## Logs

Foreground mode prints logs directly to the terminal.

Background mode writes logs to:

```
metafide-bot.log
```

View recent logs using the `logs` command for your chosen language.

---

## Validation errors

If config is missing or invalid, the bot will fail before starting. Examples:

- Missing API key
- Missing wallet address
- Invalid network
- Invalid interval
- Invalid position ranges
- Invalid price ranges

This prevents the bot from running in a broken state.

---

## Troubleshooting

### Bot says config is invalid

Check your config file and ensure:

- API key is set
- User address is set
- Network is `testnet` or `mainnet`
- Interval is one of `60`, `3600`, `23400`, `86400`

### Bot starts but places nothing

Possible reasons:

- Game is not accepting positions
- Early precision is enabled but the window is closed
- Max positions already reached
- API response is incomplete

Check logs for more details.

### Bot says it is already running

Run `status` first, then `stop` if needed.

### Bot left a stale PID file

The CLI automatically cleans stale PID files when possible during `start` and `status`.

---

## Recommended usage

### For testing

Use `testnet` first.

### For production

Only switch to `mainnet` after confirming:

- Your API key is correct
- Your wallet address is correct
- Your ranges are safe
- Your position sizing is correct
- Your asset and interval are correct

---

## Safety notes

Before using `mainnet`, confirm:

- Your funding amounts are intended
- Your ranges are intended
- Your asset and interval are correct
- You understand the game behavior

---

## Quick start

1. Fill in the config file for your chosen language
2. Run the bot in foreground mode to confirm behavior
3. Move to background mode when ready

**Foreground:**

```
run
```

**Background:**

```
start
```

Use the actual command syntax for the language you selected.

---

## Goal of this project

The goal of this project is to provide the same Metafide Spot bot experience across multiple languages, while keeping:

- The same CLI workflow
- The same bot logic
- The same configuration model
- The same operational behavior

That makes it easier to choose the language that best fits your environment or deployment style.