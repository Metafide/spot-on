#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

interface McpConfig {
  mcpServers: Record<string, { command: string; env: Record<string, string> }>;
}

const SERVER_NAME = 'metafide-spoton';
const COMMAND = 'metafide-spoton-mcp';

interface ToolConfig {
  name: string;
  configPath: string;
}

function getToolConfigs(): ToolConfig[] {
  const home = homedir();
  return [
    {
      name: 'Claude Desktop',
      configPath: process.platform === 'win32'
        ? join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')
        : join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    },
    {
      name: 'ChatGPT Desktop',
      configPath: join(home, '.config', 'openai', 'mcp.json'),
    },
  ];
}

function readOrCreateConfig(path: string): McpConfig {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return { mcpServers: {} };
    }
  }
  return { mcpServers: {} };
}

async function main() {
  console.log('\n  Metafide Spot-On MCP - Setup Wizard\n');

  const apiKey = await ask('  Metafide API Key: ');
  if (!apiKey.trim()) {
    console.log('  API key is required. Exiting.');
    rl.close();
    return;
  }

  const userAddress = await ask('  Metafide Wallet Address: ');
  if (!userAddress.trim()) {
    console.log('  Wallet address is required. Exiting.');
    rl.close();
    return;
  }

  const env = {
    METAFIDE_API_KEY: apiKey.trim(),
    METAFIDE_USER_ADDRESS: userAddress.trim(),
  };

  const serverEntry = { command: COMMAND, env };

  console.log('\n  Detecting installed AI tools...\n');

  const tools = getToolConfigs();
  let configured = 0;

  for (const tool of tools) {
    const parentDir = dirname(tool.configPath);
    if (!existsSync(parentDir) && !existsSync(tool.configPath)) {
      continue;
    }

    const answer = await ask(`  Found ${tool.name}. Configure it? (y/n): `);
    if (answer.toLowerCase() !== 'y') continue;

    const config = readOrCreateConfig(tool.configPath);
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[SERVER_NAME] = serverEntry;

    mkdirSync(parentDir, { recursive: true });
    writeFileSync(tool.configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`  Updated: ${tool.configPath}\n`);
    configured++;
  }

  console.log('  --- Manual setup for other tools ---\n');

  console.log('  Claude Code:');
  console.log(`  claude mcp add ${SERVER_NAME} -- env METAFIDE_API_KEY=${apiKey.trim()} METAFIDE_USER_ADDRESS=${userAddress.trim()} ${COMMAND}\n`);

  console.log('  Gemini CLI:');
  console.log(`  gemini mcp add ${SERVER_NAME} -- env METAFIDE_API_KEY=${apiKey.trim()} METAFIDE_USER_ADDRESS=${userAddress.trim()} ${COMMAND}\n`);

  console.log('  Cursor / Windsurf:');
  console.log('  Add to .cursor/mcp.json or .windsurf/mcp.json:');
  console.log(JSON.stringify({ mcpServers: { [SERVER_NAME]: serverEntry } }, null, 2));

  console.log('  To use testnet (staging), add METAFIDE_API_URL to your env:');
  console.log(`  METAFIDE_API_URL=https://staging-rest-service-714806972467.us-east1.run.app\n`);

  console.log(`\n  Setup complete. ${configured} tool(s) configured automatically.`);
  console.log('  Restart your AI tool to start using the bot.\n');

  rl.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
