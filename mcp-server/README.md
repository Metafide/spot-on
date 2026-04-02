# Metafide Spot-On MCP

A bare-metal MCP server for the Metafide Spot-On prediction game. Connects your AI assistant (Claude, ChatGPT, Gemini, Cursor, Windsurf) directly to the Spot-On API through natural language.

You make every decision. The server translates your words into API calls.

---

## Quick Start

### Prerequisites

- **Node.js 18+** -- check with `node --version` ([download](https://nodejs.org/))
- **Metafide API key + wallet address** -- get them at https://mf-gr6ah752x-metafide.vercel.app/wallet
- **Docs** -- https://docs.metafide.io/docs/intro

### 1. Install

```bash
npm install -g metafide-spoton-mcp
```

### 2. Run the setup wizard

```bash
metafide-spoton-setup
```

The wizard prompts for your API key and wallet address, then auto-detects installed AI tools (Claude Desktop, ChatGPT, etc.) and configures them.

### 3. Configure your AI tool (if not auto-detected)

<details>
<summary>Claude Desktop</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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
</details>

<details>
<summary>Claude Code CLI</summary>

```bash
claude mcp add metafide-spoton -- env METAFIDE_API_KEY=your_api_key METAFIDE_USER_ADDRESS=your_wallet_address metafide-spoton-mcp
```
</details>

<details>
<summary>ChatGPT Desktop</summary>

Add to `~/.config/openai/mcp.json`:

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
</details>

<details>
<summary>Gemini CLI</summary>

```bash
gemini mcp add metafide-spoton -- env METAFIDE_API_KEY=your_api_key METAFIDE_USER_ADDRESS=your_wallet_address metafide-spoton-mcp
```
</details>

<details>
<summary>Cursor / Windsurf</summary>

Add to `.cursor/mcp.json` or `.windsurf/mcp.json` in your project:

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
</details>

### 4. Restart your AI tool and start playing

```
"Check my balance"
"What's the live BTC price?"
"Place a position at 68,500 with 1 USDC"
```

---

## Available Tools (8)

| Tool | What it does |
|------|-------------|
| `get_balance` | Check your current USDC balance |
| `get_live_price` | Get the current BTC price |
| `get_game_status` | See active positions, projected winnings, and streak data |
| `get_spot_game` | Check if a game is active and accepting positions |
| `place_position` | Place a single prediction at a specific price |
| `run_bot_cycle` | Run one full cycle: check game, generate random positions, submit |
| `configure_strategy` | Adjust settings: network, interval, max positions, price ranges |
| `get_config` | View current bot configuration |

---

## How it works

The Spot-On game runs in short rounds (1 minute, 1 hour, or 1 day). Each round, you predict where BTC's price will be when the round closes. The closer your prediction, the larger your share of the prize pool. You can place up to 10 independent predictions per round.

This MCP server gives your AI assistant direct access to the Spot-On API. You tell it what to do in plain English and it makes the API calls.

### Example conversations

> "What game is running right now?"

> "Place 5 positions spread between 68,400 and 68,500, each with 1 USDC"

> "Run a bot cycle on testnet with 60-second games"

> "Switch to 1-hour games and set max positions to 5"

> "What are my current positions and how are they doing?"

---

## Configuration

### Settings you can change

| Setting | Default | Options |
|---------|---------|---------|
| `network` | testnet | testnet, mainnet |
| `interval` | 60 | 60 (1min), 3600 (1hr), 86400 (1day) |
| `max_positions` | 10 | 1-10 |
| `price_range_min` | -10 | Any number |
| `price_range_max` | 10 | Any number |
| `position_amounts` | [0.1, 0.2, 0.3, 0.4] | Array of USDC amounts |

Change settings through conversation:

> "Switch to mainnet"

> "Set the interval to 3600 and max positions to 5"

### Mainnet safety

All position-placing tools require `confirmed: true` on mainnet. Your AI tool will ask for confirmation before placing real-money positions.

---

## Want intelligence?

This is the bare-metal server -- you make every decision.

For an intelligent agent that builds optimized portfolios, learns from results, and runs autonomously, see [Spot-On Agent MCP](https://github.com/amlan-ops/spot-on-agent):

- Adaptive strategy engine (anchor/hedge/precision positions)
- Performance tracking across sessions
- Multiple play modes (bare-metal, collaborative, autonomous)
- Multi-account support
- Settlement enrichment

---

## Resources

- **Docs:** https://docs.metafide.io/docs/intro
- **Wallet:** https://mf-gr6ah752x-metafide.vercel.app/wallet
- **Templates (JS/Python):** https://github.com/Metafide/spot-on
