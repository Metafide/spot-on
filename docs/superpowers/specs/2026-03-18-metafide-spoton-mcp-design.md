# Metafide Spot-On MCP Server — Design Spec

## Overview

A TypeScript MCP server that wraps the Metafide Spot-On REST API into Claude-friendly tools. Enables non-technical users to interact with the Spot-On prediction game through natural language via Claude Desktop, Claude Code, or custom Claude agents.

## Architecture

```
Claude (Desktop / Code / Agent SDK)
    | MCP Protocol (stdio)
metafide-spoton-mcp server
    | HTTPS (x-api-key auth)
Metafide REST API (api.metafide.io)
```

- Stateless — no background loops, no persistent connections
- Auth via environment variables
- Strategy config held in memory, sensible defaults, reset on restart
- Default network: testnet

## Authentication

Two required environment variables:

- `METAFIDE_API_KEY` — API key from Metafide dashboard
- `METAFIDE_USER_ADDRESS` — user's wallet address (matches template convention)

These are set once in the MCP server config (e.g., Claude Desktop `claude_desktop_config.json`) and never exposed in tool calls. All API requests include the `x-api-key` header.

## Tools

### Read-only tools

#### get_balance

- **Purpose:** Fetch current USDC balance
- **Parameters:** none (uses config for currency/network)
- **API call:** `GET /user-balance?currency={currency}&network={network}`
- **Returns:** `{ userId, balance, withdrawal_req }`

#### get_live_price

- **Purpose:** Fetch current BTC price
- **Parameters:** none (uses config for asset)
- **API call:** `GET /live-price?asset={asset}`
- **Returns:** `{ timestamp, value }`

#### get_game_status

- **Purpose:** Get active positions, projected winnings, streak data
- **Parameters:** none (uses config for asset/currency/network/interval)
- **API call:** `GET /status?asset={asset}&token={currency}&network={network}&interval={interval}`
- **Returns:** `{ positions: [...], streaks: [...] }`

#### get_spot_game

- **Purpose:** Check if a game is active and accepting positions
- **Parameters:** none (uses config for asset/interval)
- **API call:** `GET /spot?asset={asset}&interval={interval}`
- **Returns:** `{ can_place_position, early_precision_window, liveGame: { gid } }`

### Action tools

#### place_position

- **Purpose:** Place a single prediction position
- **Parameters:**
  - `strike_price` (number, required) — predicted closing price
  - `amount` (number, required) — USDC amount to stake
  - `confirmed` (boolean, optional) — required `true` on mainnet to execute
- **Behavior:**
  1. Fetch current game state via `GET /spot`
  2. Validate game is accepting positions
  3. Validate amount meets minimum for current interval (60s: 0.1, 3600s: 1, 86400s: 5)
  4. If network is mainnet and `confirmed` is not `true`: return confirmation object with details, do not submit
  5. If testnet or confirmed: `POST /spot` with payload:
     ```
     { gid: <from GET /spot>, c: currency, a: asset, sp: strike_price (string),
       f: amount (string), pw: METAFIDE_USER_ADDRESS, n: network, it: interval }
     ```
- **Returns:** `{ txid }` on success, or `{ confirmation_required: true, details: { strike_price, amount, network, game_id } }` on mainnet without confirmation

#### run_bot_cycle

- **Purpose:** Execute one full automated bot cycle (mirrors template logic)
- **Parameters:**
  - `confirmed` (boolean, optional) — required `true` on mainnet
- **Behavior:**
  1. Fetch game status — check current position count
  2. If at max positions, return early with status
  3. Fetch balance, game state, live price (parallel)
  4. Validate game is accepting positions
  5. If early precision enabled, check window
  6. Generate randomized positions (remaining slots)
  7. If mainnet and not confirmed: return confirmation with generated positions preview
  8. Submit positions
  9. Retry only the failed subset of submissions (max 3 retries, 1s delay between attempts)
- **Returns:** `{ positions_submitted, positions_failed, total_positions, details: [...] }`

#### configure_strategy

- **Purpose:** Adjust bot parameters at runtime
- **Parameters (all optional):**
  - `network` — "testnet" or "mainnet"
  - `interval` — 60, 3600 or 86400
  - `max_positions` — 1 to 10
  - `price_range_min` — minimum price offset (number)
  - `price_range_max` — maximum price offset (number)
  - `position_amounts` — array of USDC amounts to randomly pick from
  - `enable_early_precision` — boolean
- **Validation:** same rules as template runner validation
- **Returns:** updated config object

#### get_config

- **Purpose:** View all current strategy settings
- **Parameters:** none
- **Returns:** full config object including defaults and any runtime overrides

## Default Configuration

```
network: "testnet"
interval: 60
currency: "USDC"
asset: "BTC_USDT"
max_positions: 10
enable_early_precision: false
price_ranges: {
  60:    { min: -10,  max: 10 }
  3600:  { min: -40,  max: 50 }
  86400: { min: -40,  max: 50 }
}
position_amounts: {
  60:    [0.01, 0.02, 0.03, 0.04]
  3600:  [1, 2, 3, 4]
  86400: [5, 6, 7, 8]
}
```

## Rate Limiting

### Server-side limits (from node-be)

| Endpoint | Global (per min) | Per-user (per min) |
|----------|------------------|--------------------|
| GET /spot | 12,000 | 120 |
| POST /spot | 3,000 | 30 |
| GET /live-price | 12,000 | 120 |
| GET /status | 12,000 | 120 |
| GET /user-balance | 12,000 | 120 |

### MCP server behavior

- No client-side throttle — limits are generous for interactive MCP usage
- On 429 response: parse `resetIn` from response body (default 5s if absent), wait that duration, retry once
- If still 429 after retry: return error to Claude with limit details
- `run_bot_cycle` should be spaced at least 5 seconds apart (matching template behavior); server logs a warning if called more frequently

## Error Handling

| Status | Behavior |
|--------|----------|
| 401 | Return: "Invalid API key — check METAFIDE_API_KEY env var" |
| 409 | Return: "Position already placed for this game" (no retry) |
| 422 | Return: "Invalid parameters" + API response details |
| 429 | Parse resetIn, wait, retry once. Surface error if still blocked. |
| 500/503 | Retry once after 2s. Surface error on second failure. |

## Project Structure

```
spot-on/
├── templates/              (existing)
└── mcp-server/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts            # MCP server entry (stdio transport)
    │   ├── api.ts              # Metafide API client
    │   ├── config.ts           # In-memory config + defaults
    │   ├── tools/
    │   │   ├── get-balance.ts
    │   │   ├── get-live-price.ts
    │   │   ├── get-game-status.ts
    │   │   ├── get-spot-game.ts
    │   │   ├── place-position.ts
    │   │   ├── run-bot-cycle.ts
    │   │   ├── configure-strategy.ts
    │   │   └── get-config.ts
    │   └── utils/
    │       ├── rate-limit.ts   # 429 handler
    │       └── validation.ts   # Input validation
    └── README.md
```

## Installation (end users)

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "metafide": {
      "command": "npx",
      "args": ["metafide-spoton-mcp"],
      "env": {
        "METAFIDE_API_KEY": "your-key-here",
        "METAFIDE_USER_ADDRESS": "your-wallet-here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add metafide \
  --env METAFIDE_API_KEY=your-key-here \
  --env METAFIDE_USER_ADDRESS=your-wallet-here \
  -- npx metafide-spoton-mcp
```

## Example User Interactions

**Casual user:**
> "What's my balance?" → get_balance
> "What's BTC at?" → get_live_price
> "Bet $3 that BTC hits 68500 in the next hour" → configure_strategy (interval=3600) + place_position

**Power user / agent:**
> "Run a bot cycle every 30 seconds for the next 10 minutes on 1-minute games" → Claude loops run_bot_cycle with timing

**Strategy adjustment:**
> "Switch to 1-hour games and increase max positions to 5" → configure_strategy
