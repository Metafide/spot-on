# Metafide Spot CLI Bot 

A Metafide Spot CLI bot for automatically placing positions in the Metafide Spot game.

This project includes implementations in:

- JavaScript
- Python

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
| `INTERVAL`              | `10`, `60`, `3600` or `86400`                  |
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
10     -> [0.01, 0.02, 0.03, 0.04]
60     -> [0.01, 0.02, 0.03, 0.04]
3600   -> [1, 2, 3, 4]
86400  -> [5, 6, 7, 8]
```

### Example price range configuration

```
10     -> min: -10,  max: 10
60     -> min: -10,  max: 10
3600   -> min: -40,  max: 50
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
- Interval is one of `10`, `60`, `3600`, `86400`

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

## MCP Server (AI Agent Integration)

The MCP server lets AI assistants like Claude interact with the Metafide Spot-On API directly. Instead of editing config files and running CLI commands, you can use natural language to check balances, place positions, and run the bot.

This works with any AI tool that supports the [Model Context Protocol](https://modelcontextprotocol.io), including Claude Desktop, Claude Code, ChatGPT Desktop, Gemini CLI, Cursor, and Windsurf.

### Quick setup

**1. Install the package**

```bash
npm install -g metafide-spoton-mcp
```

**2. Get your API credentials**

You need two values from [Metafide](https://beta.surge.metafide.io):
- **API key** - found in your account settings
- **Wallet address** - the Metafide wallet address you use to place positions

**3. Add to your AI tool**

Add this to your AI tool's MCP configuration file:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "metafide-spoton": {
      "command": "metafide-spoton-mcp",
      "env": {
        "METAFIDE_API_KEY": "your_api_key_here",
        "METAFIDE_USER_ADDRESS": "your_wallet_address_here"
      }
    }
  }
}
```

**Claude Code** (run in terminal):

```bash
claude mcp add metafide-spoton -- env METAFIDE_API_KEY=your_api_key_here METAFIDE_USER_ADDRESS=your_wallet_address_here metafide-spoton-mcp
```

**ChatGPT Desktop** (`~/.config/openai/mcp.json` on Mac):

```json
{
  "mcpServers": {
    "metafide-spoton": {
      "command": "metafide-spoton-mcp",
      "env": {
        "METAFIDE_API_KEY": "your_api_key_here",
        "METAFIDE_USER_ADDRESS": "your_wallet_address_here"
      }
    }
  }
}
```

**Gemini CLI** (run in terminal):

```bash
gemini mcp add metafide-spoton -- env METAFIDE_API_KEY=your_api_key_here METAFIDE_USER_ADDRESS=your_wallet_address_here metafide-spoton-mcp
```

Or add manually to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "metafide-spoton": {
      "command": "metafide-spoton-mcp",
      "env": {
        "METAFIDE_API_KEY": "your_api_key_here",
        "METAFIDE_USER_ADDRESS": "your_wallet_address_here"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in your project):

```json
{
  "mcpServers": {
    "metafide-spoton": {
      "command": "metafide-spoton-mcp",
      "env": {
        "METAFIDE_API_KEY": "your_api_key_here",
        "METAFIDE_USER_ADDRESS": "your_wallet_address_here"
      }
    }
  }
}
```

**Windsurf** (`.windsurf/mcp.json` in your project):

```json
{
  "mcpServers": {
    "metafide-spoton": {
      "command": "metafide-spoton-mcp",
      "env": {
        "METAFIDE_API_KEY": "your_api_key_here",
        "METAFIDE_USER_ADDRESS": "your_wallet_address_here"
      }
    }
  }
}
```

**4. Restart your AI tool and start chatting**

Once configured, you can ask things like:
- "What's my current balance?"
- "What's the live BTC price?"
- "Place a position at $72,000 for 1 USDC"
- "Run a bot cycle"
- "Switch to the 1-hour interval"

### Available tools

| Tool | What it does |
|------|-------------|
| `get_balance` | Check your current USDC balance |
| `get_live_price` | Get the current BTC live price |
| `get_game_status` | See active positions, projected winnings, and streak data |
| `get_spot_game` | Check if a game is active and accepting positions |
| `place_position` | Place a single prediction position |
| `run_bot_cycle` | Run one full automated cycle (check game, generate positions, submit) |
| `configure_strategy` | Adjust bot settings: network, interval, max positions, price ranges |
| `get_config` | View current bot configuration |

### Strategy configuration

The bot starts with sensible defaults (testnet, 60-second interval, BTC_USDT). You can adjust the strategy through conversation:

- "Switch to mainnet" - changes the network
- "Set the interval to 1 hour" - changes to 3600-second games
- "Set max positions to 5" - limits positions per round
- "Set the price range to -20 to +30" - adjusts randomized price offsets
- "Set position amounts to 1, 2, 3 USDC" - sets the amounts to randomly pick from

These settings persist for the duration of your session.

### Mainnet safety

When operating on mainnet, the server requires explicit confirmation before placing positions. This prevents accidental real-money trades. The AI will show you the position details and ask you to confirm before submitting.

### For developers

If you want to run the MCP server from source:

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

Run tests:

```bash
npm test
```

The server uses `stdio` transport and communicates via JSON-RPC over stdin/stdout.

---

## Goal of this project

The goal of this project is to provide the same Metafide Spot bot experience across multiple languages, while keeping:

- The same CLI workflow
- The same bot logic
- The same configuration model
- The same operational behavior

That makes it easier to choose the language that best fits your environment or deployment style.
