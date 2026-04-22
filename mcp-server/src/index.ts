#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MetafideApi } from './api.js';
import { getConfig } from './config.js';
import { handleGetBalance } from './tools/get-balance.js';
import { handleGetLivePrice } from './tools/get-live-price.js';
import { handleGetGameStatus } from './tools/get-game-status.js';
import { handleGetSpotGame } from './tools/get-spot-game.js';
import { handlePlacePosition } from './tools/place-position.js';
import { handleRunBotCycle } from './tools/run-bot-cycle.js';
import { handleConfigureStrategy } from './tools/configure-strategy.js';
import { handleGetConfig } from './tools/get-config.js';
import { handleGetResults } from './tools/get-results.js';

const server = new McpServer({
  name: 'metafide-spoton',
  version: '1.0.0',
});

function createApi(): MetafideApi {
  const config = getConfig();
  return new MetafideApi(config.endpoint, config.apiKey);
}

server.tool('get_balance', 'Get your current USDC balance', {}, async () => {
  return handleGetBalance(createApi(), getConfig());
});

server.tool('get_live_price', 'Get current BTC live price', {}, async () => {
  return handleGetLivePrice(createApi(), getConfig());
});

server.tool('get_game_status', 'Get active positions, projected winnings, and streak data', {}, async () => {
  return handleGetGameStatus(createApi(), getConfig());
});

server.tool('get_spot_game', 'Check if a game is active and accepting positions', {}, async () => {
  return handleGetSpotGame(createApi(), getConfig());
});

server.tool(
  'place_position',
  'Place a prediction position in the active Spot-On game',
  {
    strike_price: z.number().positive().describe('Predicted closing price'),
    amount: z.number().positive().describe('USDC amount to stake'),
    confirmed: z.boolean().optional().describe('Set to true to confirm mainnet position placement'),
  },
  async ({ strike_price, amount, confirmed }) => {
    return handlePlacePosition(createApi(), getConfig(), { strike_price, amount, confirmed });
  }
);

server.tool(
  'run_bot_cycle',
  'Run one full automated bot cycle: check game, generate randomized positions, submit',
  {
    confirmed: z.boolean().optional().describe('Set to true to confirm mainnet position placement'),
  },
  async ({ confirmed }) => {
    return handleRunBotCycle(createApi(), getConfig(), { confirmed });
  }
);

server.tool(
  'configure_strategy',
  'Adjust bot strategy: network, interval, max positions, price ranges',
  {
    network: z.enum(['testnet', 'mainnet']).optional().describe('Network to operate on'),
    interval: z.number().optional().describe('Game interval in seconds: 10, 60, 3600 or 86400'),
    max_positions: z.number().optional().describe('Maximum positions per round (1-10)'),
    price_range_min: z.number().optional().describe('Minimum price offset from live price'),
    price_range_max: z.number().optional().describe('Maximum price offset from live price'),
    position_amounts: z.array(z.number()).optional().describe('Array of USDC amounts to randomly pick from'),
    enable_early_precision: z.boolean().optional().describe('Only place positions during early precision window'),
  },
  async (input) => {
    return handleConfigureStrategy(input);
  }
);

server.tool('get_config', 'View current bot strategy configuration', {}, async () => {
  return handleGetConfig();
});

server.tool(
  'get_results',
  'Get historical game results — winnings, returns, closing prices. Use gid for a specific game or omit for recent history.',
  {
    gid: z.string().optional().describe('Specific game ID to look up'),
    interval: z.number().optional().describe('Filter by interval: 10, 60, 3600, or 86400'),
    limit: z.number().optional().describe('Max results (1-100, default 20)'),
    offset: z.number().optional().describe('Pagination offset'),
  },
  async ({ gid, interval, limit, offset }) => {
    return handleGetResults(createApi(), getConfig(), { gid, interval, limit, offset });
  }
);

async function main() {
  const config = getConfig();
  if (!config.apiKey) {
    console.error('Warning: METAFIDE_API_KEY environment variable is not set');
  }
  if (!config.userAddress) {
    console.error('Warning: METAFIDE_USER_ADDRESS environment variable is not set');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Metafide Spot-On MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
