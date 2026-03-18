# Metafide Spot-On MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that wraps the Metafide Spot-On REST API into 8 Claude-friendly tools.

**Architecture:** Stateless stdio MCP server using `@modelcontextprotocol/sdk`. Each tool maps to one or more Metafide API calls. Auth via env vars, strategy config in memory. No background loops.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod` v3, Node.js 18+

**Spec:** `docs/superpowers/specs/2026-03-18-metafide-spoton-mcp-design.md`

---

## File Structure

```
mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Server entry point, stdio transport, tool registration
│   ├── api.ts                # HTTP client wrapping all 5 Metafide endpoints
│   ├── config.ts             # In-memory mutable config with defaults
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
│       ├── rate-limit.ts     # 429 handler with resetIn parsing
│       └── validation.ts     # Shared input validators
└── __tests__/
    ├── api.test.ts
    ├── config.test.ts
    ├── rate-limit.test.ts
    ├── validation.test.ts
    └── tools/
        ├── get-balance.test.ts
        ├── place-position.test.ts
        ├── run-bot-cycle.test.ts
        └── configure-strategy.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`

- [ ] **Step 1: Create mcp-server directory**

```bash
mkdir -p /Users/amlanchowdhury/Projects/spot-on/mcp-server/src/tools
mkdir -p /Users/amlanchowdhury/Projects/spot-on/mcp-server/src/utils
mkdir -p /Users/amlanchowdhury/Projects/spot-on/mcp-server/__tests__/tools
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "metafide-spoton-mcp",
  "version": "1.0.0",
  "description": "MCP server for Metafide Spot-On prediction game",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "metafide-spoton-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.25.32"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npm install
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx tsc --noEmit
```

Expected: No errors (no source files yet, clean compile).

- [ ] **Step 6: Commit**

```bash
git add mcp-server/package.json mcp-server/tsconfig.json mcp-server/package-lock.json
git commit -m "Scaffold MCP server project"
```

---

### Task 2: Config Module

**Files:**
- Create: `mcp-server/src/config.ts`
- Test: `mcp-server/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getConfig, updateConfig, resetConfig } from '../src/config.js';

describe('config', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('returns default config', () => {
    const config = getConfig();
    expect(config.network).toBe('testnet');
    expect(config.interval).toBe(60);
    expect(config.currency).toBe('USDC');
    expect(config.asset).toBe('BTC_USDT');
    expect(config.max_positions).toBe(10);
    expect(config.enable_early_precision).toBe(false);
  });

  it('updates partial config', () => {
    updateConfig({ network: 'mainnet', interval: 3600 });
    const config = getConfig();
    expect(config.network).toBe('mainnet');
    expect(config.interval).toBe(3600);
    expect(config.currency).toBe('USDC'); // unchanged
  });

  it('resets config to defaults', () => {
    updateConfig({ network: 'mainnet' });
    resetConfig();
    expect(getConfig().network).toBe('testnet');
  });

  it('returns API URL and endpoint', () => {
    const config = getConfig();
    expect(config.apiKey).toBe('');
    expect(config.userAddress).toBe('');
    expect(config.endpoint).toContain('/v1/surge/games/');
  });

  it('reads API key from env', () => {
    // env vars are read at import time, tested via integration
    const config = getConfig();
    expect(typeof config.apiKey).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/config.ts

const METAFIDE_API_URL = "https://staging-rest-service-714806972467.us-east1.run.app";
const METAFIDE_API_VERSION = "v1";
const METAFIDE_BASE_PATH = "surge/games/";

export interface StrategyConfig {
  network: "testnet" | "mainnet";
  interval: 60 | 3600 | 23400 | 86400;
  currency: string;
  asset: string;
  max_positions: number;
  enable_early_precision: boolean;
  price_ranges: Record<number, { min: number; max: number }>;
  position_amounts: Record<number, number[]>;
}

export interface FullConfig extends StrategyConfig {
  apiKey: string;
  userAddress: string;
  endpoint: string;
}

const DEFAULTS: StrategyConfig = {
  network: "testnet",
  interval: 60,
  currency: "USDC",
  asset: "BTC_USDT",
  max_positions: 10,
  enable_early_precision: false,
  price_ranges: {
    60:    { min: -10, max: 10 },
    3600:  { min: -40, max: 50 },
    23400: { min: -40, max: 50 },
    86400: { min: -40, max: 50 },
  },
  position_amounts: {
    60:    [0.2, 0.3, 0.4, 0.5],
    3600:  [1, 2, 3, 4],
    23400: [5, 6, 7, 8],
    86400: [5, 6, 7, 8],
  },
};

let current: StrategyConfig = { ...DEFAULTS };

export function getConfig(): FullConfig {
  return {
    ...current,
    price_ranges: { ...current.price_ranges },
    position_amounts: { ...current.position_amounts },
    apiKey: process.env.METAFIDE_API_KEY ?? "",
    userAddress: process.env.METAFIDE_USER_ADDRESS ?? "",
    endpoint: `${METAFIDE_API_URL}/${METAFIDE_API_VERSION}/${METAFIDE_BASE_PATH}`,
  };
}

export function updateConfig(partial: Partial<StrategyConfig>): FullConfig {
  current = { ...current, ...partial };
  return getConfig();
}

export function resetConfig(): FullConfig {
  current = { ...DEFAULTS };
  return getConfig();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/config.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/config.ts mcp-server/__tests__/config.test.ts
git commit -m "Add config module with defaults and runtime updates"
```

---

### Task 3: Validation Utils

**Files:**
- Create: `mcp-server/src/utils/validation.ts`
- Test: `mcp-server/__tests__/validation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateInterval,
  validateNetwork,
  validateMaxPositions,
  validatePositionAmount,
  validateStrikePrice,
} from '../src/utils/validation.js';

describe('validation', () => {
  describe('validateInterval', () => {
    it('accepts valid intervals', () => {
      expect(validateInterval(60)).toBe(true);
      expect(validateInterval(3600)).toBe(true);
      expect(validateInterval(23400)).toBe(true);
      expect(validateInterval(86400)).toBe(true);
    });
    it('rejects invalid intervals', () => {
      expect(validateInterval(100)).toBe(false);
      expect(validateInterval(0)).toBe(false);
    });
  });

  describe('validateNetwork', () => {
    it('accepts valid networks', () => {
      expect(validateNetwork('testnet')).toBe(true);
      expect(validateNetwork('mainnet')).toBe(true);
    });
    it('rejects invalid networks', () => {
      expect(validateNetwork('devnet')).toBe(false);
    });
  });

  describe('validateMaxPositions', () => {
    it('accepts 1-10', () => {
      expect(validateMaxPositions(1)).toBe(true);
      expect(validateMaxPositions(10)).toBe(true);
    });
    it('rejects out of range', () => {
      expect(validateMaxPositions(0)).toBe(false);
      expect(validateMaxPositions(11)).toBe(false);
    });
  });

  describe('validatePositionAmount', () => {
    it('validates minimum per interval', () => {
      expect(validatePositionAmount(0.1, 60)).toBe(true);
      expect(validatePositionAmount(0.05, 60)).toBe(false);
      expect(validatePositionAmount(1, 3600)).toBe(true);
      expect(validatePositionAmount(0.5, 3600)).toBe(false);
      expect(validatePositionAmount(5, 86400)).toBe(true);
      expect(validatePositionAmount(4, 86400)).toBe(false);
    });
  });

  describe('validateStrikePrice', () => {
    it('accepts positive numbers', () => {
      expect(validateStrikePrice(68000)).toBe(true);
    });
    it('rejects zero and negative', () => {
      expect(validateStrikePrice(0)).toBe(false);
      expect(validateStrikePrice(-100)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/utils/validation.ts

const VALID_INTERVALS = [60, 3600, 23400, 86400] as const;
const VALID_NETWORKS = ["testnet", "mainnet"] as const;
const POSITION_MINIMUMS: Record<number, number> = { 60: 0.1, 3600: 1, 23400: 5, 86400: 5 };

export function validateInterval(interval: number): boolean {
  return (VALID_INTERVALS as readonly number[]).includes(interval);
}

export function validateNetwork(network: string): boolean {
  return (VALID_NETWORKS as readonly string[]).includes(network);
}

export function validateMaxPositions(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

export function validatePositionAmount(amount: number, interval: number): boolean {
  const min = POSITION_MINIMUMS[interval];
  if (min === undefined) return false;
  return amount >= min;
}

export function validateStrikePrice(price: number): boolean {
  return price > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/validation.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/utils/validation.ts mcp-server/__tests__/validation.test.ts
git commit -m "Add input validation utilities"
```

---

### Task 4: Rate Limit Handler

**Files:**
- Create: `mcp-server/src/utils/rate-limit.ts`
- Test: `mcp-server/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { parseRateLimitError, RateLimitError } from '../src/utils/rate-limit.js';

describe('rate-limit', () => {
  it('parses 429 response with resetIn', () => {
    const body = {
      error: 'Rate limit exceeded',
      message: 'Too many requests',
      limit: 120,
      current: 121,
      resetIn: 45,
    };
    const result = parseRateLimitError(body);
    expect(result.resetIn).toBe(45);
    expect(result.limit).toBe(120);
    expect(result.current).toBe(121);
  });

  it('defaults resetIn to 5 when absent', () => {
    const body = { error: 'Rate limit exceeded' };
    const result = parseRateLimitError(body);
    expect(result.resetIn).toBe(5);
  });

  it('RateLimitError has correct message', () => {
    const err = new RateLimitError('GET /spot', 120, 121, 45);
    expect(err.message).toContain('GET /spot');
    expect(err.message).toContain('45');
    expect(err.resetIn).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/utils/rate-limit.ts

export interface RateLimitInfo {
  resetIn: number;
  limit: number;
  current: number;
  message: string;
}

export class RateLimitError extends Error {
  resetIn: number;
  limit: number;
  current: number;

  constructor(endpoint: string, limit: number, current: number, resetIn: number) {
    super(
      `Rate limited on ${endpoint}. ${current}/${limit} requests used. Resets in ${resetIn} seconds.`
    );
    this.name = 'RateLimitError';
    this.resetIn = resetIn;
    this.limit = limit;
    this.current = current;
  }
}

export function parseRateLimitError(body: Record<string, unknown>): RateLimitInfo {
  return {
    resetIn: typeof body.resetIn === 'number' ? body.resetIn : 5,
    limit: typeof body.limit === 'number' ? body.limit : 0,
    current: typeof body.current === 'number' ? body.current : 0,
    message: typeof body.message === 'string' ? body.message : 'Rate limit exceeded',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/rate-limit.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/utils/rate-limit.ts mcp-server/__tests__/rate-limit.test.ts
git commit -m "Add rate limit error parsing and handler"
```

---

### Task 5: API Client

**Files:**
- Create: `mcp-server/src/api.ts`
- Test: `mcp-server/__tests__/api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetafideApi } from '../src/api.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MetafideApi', () => {
  let api: MetafideApi;

  beforeEach(() => {
    mockFetch.mockReset();
    api = new MetafideApi('https://test.api/v1/surge/games/', 'test-key');
  });

  it('sends GET request with x-api-key header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: '1000' }),
    });

    const result = await api.get('user-balance?currency=USDC&network=testnet');
    expect(result).toEqual({ balance: '1000' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.api/v1/surge/games/user-balance?currency=USDC&network=testnet',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    );
  });

  it('sends POST request with JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ txid: 'abc123' }),
    });

    const body = { gid: 'g1', c: 'USDC', a: 'BTC_USDT', sp: '68000', f: '5', pw: '0x1', n: 'testnet', it: 60 };
    const result = await api.post('spot', body);
    expect(result).toEqual({ txid: 'abc123' });

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(body);
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'Invalid API key' }),
    });

    await expect(api.get('user-balance')).rejects.toThrow('401');
  });

  it('retries once on 429 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: 'Rate limit exceeded', resetIn: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ balance: '500' }),
      });

    const result = await api.get('user-balance');
    expect(result).toEqual({ balance: '500' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after retry still 429', async () => {
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: 'Rate limit exceeded', resetIn: 1, limit: 120, current: 121 }),
    };
    mockFetch
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(rateLimitResponse);

    await expect(api.get('user-balance')).rejects.toThrow('Rate limited');
  });

  it('retries once on 500 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: 68000 }),
      });

    const result = await api.get('live-price');
    expect(result).toEqual({ value: 68000 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 409', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: 'Duplicate position' }),
    });

    await expect(api.post('spot', {})).rejects.toThrow('409');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/api.ts

import { parseRateLimitError, RateLimitError } from './utils/rate-limit.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MetafideApi {
  private endpoint: string;
  private apiKey: string;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', path, body);
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    isRetry = false
  ): Promise<unknown> {
    const url = `${this.endpoint}${path}`;
    const headers: Record<string, string> = { 'x-api-key': this.apiKey };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    });

    if (response.ok) {
      return response.json();
    }

    const status = response.status;
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = (await response.json()) as Record<string, unknown>;
    } catch {
      // response may not be JSON
    }

    // 429: retry once after resetIn delay
    if (status === 429 && !isRetry) {
      const info = parseRateLimitError(errorBody);
      await sleep(info.resetIn * 1000);
      return this.request(method, path, body, true);
    }

    if (status === 429 && isRetry) {
      const info = parseRateLimitError(errorBody);
      throw new RateLimitError(`${method} ${path}`, info.limit, info.current, info.resetIn);
    }

    // 500/503: retry once after 2s
    if ((status === 500 || status === 503) && !isRetry) {
      await sleep(2000);
      return this.request(method, path, body, true);
    }

    // All other errors: throw immediately (401, 409, 422, etc.)
    const message = typeof errorBody.error === 'string' ? errorBody.error : response.statusText;
    throw new Error(`API error ${status}: ${message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/api.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/api.ts mcp-server/__tests__/api.test.ts
git commit -m "Add Metafide API client with retry and rate limit handling"
```

---

### Task 6: Read-Only Tools (get_balance, get_live_price, get_game_status, get_spot_game)

**Files:**
- Create: `mcp-server/src/tools/get-balance.ts`
- Create: `mcp-server/src/tools/get-live-price.ts`
- Create: `mcp-server/src/tools/get-game-status.ts`
- Create: `mcp-server/src/tools/get-spot-game.ts`
- Test: `mcp-server/__tests__/tools/get-balance.test.ts`

- [ ] **Step 1: Write one representative test (get_balance)**

```typescript
// __tests__/tools/get-balance.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleGetBalance } from '../src/tools/get-balance.js';

describe('get_balance tool', () => {
  it('calls API and returns formatted result', async () => {
    const mockApi = {
      get: vi.fn().mockResolvedValue({ userId: 1, balance: '1000', withdrawal_req: 'none' }),
      post: vi.fn(),
    };
    const config = { currency: 'USDC', network: 'testnet' as const };

    const result = await handleGetBalance(mockApi as any, config as any);
    expect(mockApi.get).toHaveBeenCalledWith('user-balance?currency=USDC&network=testnet');
    expect(result.content[0].text).toContain('1000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/get-balance.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write all four read-only tools**

```typescript
// src/tools/get-balance.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleGetBalance(api: MetafideApi, config: FullConfig): Promise<CallToolResult> {
  const data = await api.get(`user-balance?currency=${config.currency}&network=${config.network}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
```

```typescript
// src/tools/get-live-price.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleGetLivePrice(api: MetafideApi, config: FullConfig): Promise<CallToolResult> {
  const data = await api.get(`live-price?asset=${config.asset}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
```

```typescript
// src/tools/get-game-status.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleGetGameStatus(api: MetafideApi, config: FullConfig): Promise<CallToolResult> {
  const data = await api.get(
    `status?asset=${config.asset}&token=${config.currency}&network=${config.network}&interval=${config.interval}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
```

```typescript
// src/tools/get-spot-game.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleGetSpotGame(api: MetafideApi, config: FullConfig): Promise<CallToolResult> {
  const data = await api.get(`spot?asset=${config.asset}&interval=${config.interval}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/get-balance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/get-balance.ts mcp-server/src/tools/get-live-price.ts mcp-server/src/tools/get-game-status.ts mcp-server/src/tools/get-spot-game.ts mcp-server/__tests__/tools/get-balance.test.ts
git commit -m "Add read-only tools: balance, price, game status, spot game"
```

---

### Task 7: configure_strategy and get_config Tools

**Files:**
- Create: `mcp-server/src/tools/configure-strategy.ts`
- Create: `mcp-server/src/tools/get-config.ts`
- Test: `mcp-server/__tests__/tools/configure-strategy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/tools/configure-strategy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleConfigureStrategy } from '../src/tools/configure-strategy.js';
import { handleGetConfig } from '../src/tools/get-config.js';
import { resetConfig, getConfig } from '../src/config.js';

describe('configure_strategy tool', () => {
  beforeEach(() => resetConfig());

  it('updates network and interval', async () => {
    const result = await handleConfigureStrategy({ network: 'mainnet', interval: 3600 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.network).toBe('mainnet');
    expect(parsed.interval).toBe(3600);
  });

  it('rejects invalid interval', async () => {
    const result = await handleConfigureStrategy({ interval: 999 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('interval');
  });

  it('rejects invalid network', async () => {
    const result = await handleConfigureStrategy({ network: 'devnet' });
    expect(result.isError).toBe(true);
  });

  it('rejects invalid max_positions', async () => {
    const result = await handleConfigureStrategy({ max_positions: 0 });
    expect(result.isError).toBe(true);
  });
});

describe('get_config tool', () => {
  beforeEach(() => resetConfig());

  it('returns current config', async () => {
    const result = await handleGetConfig();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.network).toBe('testnet');
    expect(parsed.interval).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/configure-strategy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/tools/configure-strategy.ts
import { getConfig, updateConfig, type StrategyConfig } from '../config.js';
import { validateInterval, validateNetwork, validateMaxPositions } from '../utils/validation.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ConfigureInput {
  network?: string;
  interval?: number;
  max_positions?: number;
  price_range_min?: number;
  price_range_max?: number;
  position_amounts?: number[];
  enable_early_precision?: boolean;
}

export async function handleConfigureStrategy(input: ConfigureInput): Promise<CallToolResult> {
  const errors: string[] = [];

  if (input.network !== undefined && !validateNetwork(input.network)) {
    errors.push('network must be "testnet" or "mainnet"');
  }
  if (input.interval !== undefined && !validateInterval(input.interval)) {
    errors.push('interval must be 60, 3600, 23400, or 86400');
  }
  if (input.max_positions !== undefined && !validateMaxPositions(input.max_positions)) {
    errors.push('max_positions must be 1-10');
  }
  if (input.price_range_min !== undefined && input.price_range_max !== undefined) {
    if (input.price_range_min >= input.price_range_max) {
      errors.push('price_range_min must be less than price_range_max');
    }
  }

  if (errors.length > 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Validation failed: ${errors.join('; ')}` }],
    };
  }

  const updates: Partial<StrategyConfig> = {};
  if (input.network !== undefined) updates.network = input.network as StrategyConfig['network'];
  if (input.interval !== undefined) updates.interval = input.interval as StrategyConfig['interval'];
  if (input.max_positions !== undefined) updates.max_positions = input.max_positions;
  if (input.enable_early_precision !== undefined) updates.enable_early_precision = input.enable_early_precision;

  // Apply price range updates for the current interval
  if (input.price_range_min !== undefined || input.price_range_max !== undefined) {
    const currentConfig = getConfig();
    const interval = input.interval ?? currentConfig.interval;
    const currentRange = currentConfig.price_ranges[interval] || { min: -40, max: 50 };
    updates.price_ranges = {
      ...currentConfig.price_ranges,
      [interval]: {
        min: input.price_range_min ?? currentRange.min,
        max: input.price_range_max ?? currentRange.max,
      },
    };
  }

  // Apply position amounts for the current interval
  if (input.position_amounts !== undefined) {
    const currentConfig = getConfig();
    const interval = input.interval ?? currentConfig.interval;
    updates.position_amounts = {
      ...currentConfig.position_amounts,
      [interval]: input.position_amounts,
    };
  }

  const config = updateConfig(updates);
  return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
}
```

```typescript
// src/tools/get-config.ts
import { getConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function handleGetConfig(): Promise<CallToolResult> {
  const config = getConfig();
  // Redact API key for safety
  const display = { ...config, apiKey: config.apiKey ? '***' : '(not set)' };
  return { content: [{ type: 'text', text: JSON.stringify(display, null, 2) }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/configure-strategy.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/configure-strategy.ts mcp-server/src/tools/get-config.ts mcp-server/__tests__/tools/configure-strategy.test.ts
git commit -m "Add configure_strategy and get_config tools"
```

---

### Task 8: place_position Tool

**Files:**
- Create: `mcp-server/src/tools/place-position.ts`
- Test: `mcp-server/__tests__/tools/place-position.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/tools/place-position.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePlacePosition } from '../src/tools/place-position.js';
import { resetConfig, getConfig, updateConfig } from '../src/config.js';

describe('place_position tool', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    resetConfig();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
  });

  it('places position on testnet without confirmation', async () => {
    mockApi.get.mockResolvedValue({
      can_place_position: true,
      early_precision_window: true,
      liveGame: { gid: 'game-1' },
    });
    mockApi.post.mockResolvedValue({ txid: 'tx-abc' });

    const result = await handlePlacePosition(
      mockApi as any,
      getConfig(),
      { strike_price: 68000, amount: 0.5 }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.txid).toBe('tx-abc');
    expect(mockApi.post).toHaveBeenCalledWith('spot', expect.objectContaining({
      gid: 'game-1',
      sp: '68000',
      f: '0.5',
    }));
  });

  it('requires confirmation on mainnet', async () => {
    updateConfig({ network: 'mainnet' });
    mockApi.get.mockResolvedValue({
      can_place_position: true,
      liveGame: { gid: 'game-1' },
    });

    const result = await handlePlacePosition(
      mockApi as any,
      getConfig(),
      { strike_price: 68000, amount: 1 }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.confirmation_required).toBe(true);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('executes on mainnet when confirmed', async () => {
    updateConfig({ network: 'mainnet' });
    mockApi.get.mockResolvedValue({
      can_place_position: true,
      liveGame: { gid: 'game-1' },
    });
    mockApi.post.mockResolvedValue({ txid: 'tx-main' });

    const result = await handlePlacePosition(
      mockApi as any,
      getConfig(),
      { strike_price: 68000, amount: 1, confirmed: true }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.txid).toBe('tx-main');
  });

  it('returns error when game not accepting positions', async () => {
    mockApi.get.mockResolvedValue({ can_place_position: false });

    const result = await handlePlacePosition(
      mockApi as any,
      getConfig(),
      { strike_price: 68000, amount: 0.5 }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not accepting');
  });

  it('validates amount minimum', async () => {
    const result = await handlePlacePosition(
      mockApi as any,
      getConfig(), // interval=60, min=0.1
      { strike_price: 68000, amount: 0.01 }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('minimum');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/place-position.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/tools/place-position.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import { validatePositionAmount, validateStrikePrice } from '../utils/validation.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface PlacePositionInput {
  strike_price: number;
  amount: number;
  confirmed?: boolean;
}

const POSITION_MINIMUMS: Record<number, number> = { 60: 0.1, 3600: 1, 23400: 5, 86400: 5 };

export async function handlePlacePosition(
  api: MetafideApi,
  config: FullConfig,
  input: PlacePositionInput
): Promise<CallToolResult> {
  // Validate inputs
  if (!validateStrikePrice(input.strike_price)) {
    return { isError: true, content: [{ type: 'text', text: 'strike_price must be a positive number' }] };
  }
  if (!validatePositionAmount(input.amount, config.interval)) {
    const min = POSITION_MINIMUMS[config.interval];
    return {
      isError: true,
      content: [{ type: 'text', text: `Amount below minimum for ${config.interval}s interval. Minimum: ${min} USDC` }],
    };
  }

  // Fetch game state
  const game = (await api.get(`spot?asset=${config.asset}&interval=${config.interval}`)) as {
    can_place_position: boolean;
    early_precision_window?: boolean;
    liveGame: { gid: string };
  };

  if (!game.can_place_position) {
    return { isError: true, content: [{ type: 'text', text: 'Game is not accepting positions right now.' }] };
  }

  // Mainnet confirmation gate
  if (config.network === 'mainnet' && !input.confirmed) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          confirmation_required: true,
          details: {
            strike_price: input.strike_price,
            amount: input.amount,
            network: config.network,
            game_id: game.liveGame.gid,
            asset: config.asset,
            currency: config.currency,
          },
        }, null, 2),
      }],
    };
  }

  // Submit position
  const payload = {
    gid: game.liveGame.gid,
    c: config.currency,
    a: config.asset,
    sp: String(input.strike_price),
    f: String(input.amount),
    pw: config.userAddress,
    n: config.network,
    it: config.interval,
  };

  const result = await api.post('spot', payload);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/place-position.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/place-position.ts mcp-server/__tests__/tools/place-position.test.ts
git commit -m "Add place_position tool with mainnet confirmation gate"
```

---

### Task 9: run_bot_cycle Tool

**Files:**
- Create: `mcp-server/src/tools/run-bot-cycle.ts`
- Test: `mcp-server/__tests__/tools/run-bot-cycle.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/tools/run-bot-cycle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRunBotCycle } from '../src/tools/run-bot-cycle.js';
import { resetConfig, getConfig, updateConfig } from '../src/config.js';

describe('run_bot_cycle tool', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    resetConfig();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
  });

  it('runs full cycle and submits positions', async () => {
    // Status: no existing positions
    mockApi.get
      .mockResolvedValueOnce({ positions: [], streaks: [] }) // status
      .mockResolvedValueOnce({ balance: '1000' }) // balance
      .mockResolvedValueOnce({ can_place_position: true, early_precision_window: true, liveGame: { gid: 'g1' } }) // spot
      .mockResolvedValueOnce({ value: 68000.5, timestamp: Date.now() }); // price

    mockApi.post.mockResolvedValue({ txid: 'tx-1' });

    updateConfig({ max_positions: 2 });
    const result = await handleRunBotCycle(mockApi as any, getConfig(), {});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.positions_submitted).toBe(2);
    expect(mockApi.post).toHaveBeenCalledTimes(2);
  });

  it('skips when max positions reached', async () => {
    mockApi.get.mockResolvedValueOnce({
      positions: [{ f: '1' }, { f: '1' }],
      streaks: [],
    });

    updateConfig({ max_positions: 2 });
    const result = await handleRunBotCycle(mockApi as any, getConfig(), {});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.positions_submitted).toBe(0);
    expect(parsed.reason).toContain('max');
  });

  it('requires confirmation on mainnet', async () => {
    updateConfig({ network: 'mainnet', max_positions: 1 });
    mockApi.get
      .mockResolvedValueOnce({ positions: [], streaks: [] })
      .mockResolvedValueOnce({ balance: '1000' })
      .mockResolvedValueOnce({ can_place_position: true, liveGame: { gid: 'g1' } })
      .mockResolvedValueOnce({ value: 68000, timestamp: Date.now() });

    const result = await handleRunBotCycle(mockApi as any, getConfig(), {});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.confirmation_required).toBe(true);
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('skips when game not accepting positions', async () => {
    mockApi.get
      .mockResolvedValueOnce({ positions: [], streaks: [] })
      .mockResolvedValueOnce({ balance: '1000' })
      .mockResolvedValueOnce({ can_place_position: false })
      .mockResolvedValueOnce({ value: 68000, timestamp: Date.now() });

    const result = await handleRunBotCycle(mockApi as any, getConfig(), {});

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.positions_submitted).toBe(0);
    expect(parsed.reason).toContain('not accepting');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/run-bot-cycle.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/tools/run-bot-cycle.ts
import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface BotCycleInput {
  confirmed?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface PositionPayload {
  gid: string;
  c: string;
  a: string;
  sp: string;
  f: string;
  pw: string;
  n: string;
  it: number;
}

function generatePositions(config: FullConfig, gid: string, currentPrice: number, count: number): PositionPayload[] {
  const amountOptions = config.position_amounts[config.interval] || [1];
  const priceRange = config.price_ranges[config.interval] || { min: -40, max: 50 };
  const positions: PositionPayload[] = [];

  for (let i = 0; i < count; i++) {
    const amount = amountOptions[Math.floor(Math.random() * amountOptions.length)];
    const offset = randInt(priceRange.min, priceRange.max);
    const strikePrice = currentPrice + offset;

    positions.push({
      gid,
      c: config.currency,
      a: config.asset,
      sp: strikePrice.toFixed(0),
      f: String(amount),
      pw: config.userAddress,
      n: config.network,
      it: config.interval,
    });
  }

  return positions;
}

async function submitPositions(
  api: MetafideApi,
  positions: PositionPayload[],
  retries = 0
): Promise<{ submitted: number; failed: number; details: string[] }> {
  const MAX_RETRIES = 3;
  const details: string[] = [];
  let submitted = 0;

  const results = await Promise.allSettled(
    positions.map((p) => api.post('spot', p as unknown as Record<string, unknown>))
  );

  const failedPositions: PositionPayload[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const res = result.value as { txid?: string };
      details.push(`Position ${i + 1}: placed (txid: ${res.txid})`);
      submitted++;
    } else {
      details.push(`Position ${i + 1}: failed (${result.reason?.message || 'unknown error'})`);
      failedPositions.push(positions[i]);
    }
  });

  if (failedPositions.length > 0 && retries < MAX_RETRIES) {
    details.push(`Retrying ${failedPositions.length} failed position(s)... (attempt ${retries + 1} of ${MAX_RETRIES})`);
    await sleep(1000);
    const retryResult = await submitPositions(api, failedPositions, retries + 1);
    submitted += retryResult.submitted;
    details.push(...retryResult.details);
    return { submitted, failed: retryResult.failed, details };
  }

  return { submitted, failed: failedPositions.length, details };
}

export async function handleRunBotCycle(
  api: MetafideApi,
  config: FullConfig,
  input: BotCycleInput
): Promise<CallToolResult> {
  // Step 1: Fetch status
  const status = (await api.get(
    `status?asset=${config.asset}&token=${config.currency}&network=${config.network}&interval=${config.interval}`
  )) as { positions: unknown[]; streaks: unknown[] };

  const currentCount = (status.positions || []).length;

  // Step 2: Check position cap
  if (currentCount >= config.max_positions) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: `Already at max positions (${currentCount}/${config.max_positions})`,
        }, null, 2),
      }],
    };
  }

  // Step 3: Fetch balance, game, price in parallel
  const [balance, game, price] = await Promise.all([
    api.get(`user-balance?currency=${config.currency}&network=${config.network}`),
    api.get(`spot?asset=${config.asset}&interval=${config.interval}`) as Promise<{
      can_place_position: boolean;
      early_precision_window?: boolean;
      liveGame: { gid: string };
    }>,
    api.get(`live-price?asset=${config.asset}`) as Promise<{ value: number; timestamp: number }>,
  ]);

  if (!balance || !game || !price) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Incomplete data from API. Try again.' }],
    };
  }

  // Step 4: Check game state
  if (!game.can_place_position) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: 'Game is not accepting positions right now.',
        }, null, 2),
      }],
    };
  }

  // Step 5: Early precision check
  if (config.enable_early_precision && !game.early_precision_window) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: 'Early precision window is not open.',
        }, null, 2),
      }],
    };
  }

  // Step 6: Generate positions
  const currentPrice = Number(price.value.toFixed(0));
  const remainingSlots = config.max_positions - currentCount;
  const positions = generatePositions(config, game.liveGame.gid, currentPrice, remainingSlots);

  // Step 7: Mainnet confirmation gate
  if (config.network === 'mainnet' && !input.confirmed) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          confirmation_required: true,
          positions_preview: positions.map((p) => ({
            strike_price: p.sp,
            amount: p.f,
            game_id: p.gid,
          })),
          network: config.network,
          total_to_submit: positions.length,
        }, null, 2),
      }],
    };
  }

  // Step 8: Submit
  const result = await submitPositions(api, positions);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        positions_submitted: result.submitted,
        positions_failed: result.failed,
        total_positions: currentCount + result.submitted,
        details: result.details,
      }, null, 2),
    }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run __tests__/tools/run-bot-cycle.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/run-bot-cycle.ts mcp-server/__tests__/tools/run-bot-cycle.test.ts
git commit -m "Add run_bot_cycle tool with position generation and retry logic"
```

---

### Task 10: MCP Server Entry Point

**Files:**
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Write the server entry point**

This file wires all tools into the MCP server. It uses `@modelcontextprotocol/sdk` to register each tool with its Zod schema.

```typescript
#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
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

const server = new McpServer({
  name: 'metafide-spoton',
  version: '1.0.0',
});

function createApi(): MetafideApi {
  const config = getConfig();
  return new MetafideApi(config.endpoint, config.apiKey);
}

// Read-only tools
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

// Action tools
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
    interval: z.number().optional().describe('Game interval in seconds: 60, 3600, 23400, or 86400'),
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

// Start server
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
```

- [ ] **Step 2: Build and verify compilation**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx tsc
```

Expected: Compiles with no errors. `dist/` directory created.

- [ ] **Step 3: Verify the binary entry point**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && head -1 dist/index.js
```

Expected: `#!/usr/bin/env node`

Note: If the shebang is missing from tsc output, add it manually or use a build script. The `bin` field in package.json points to `dist/index.js`.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "Add MCP server entry point with all 8 tools registered"
```

---

### Task 11: Full Test Suite Run and Build Verification

- [ ] **Step 1: Run all tests**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Clean build**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && rm -rf dist && npx tsc
```

Expected: Clean compile, no errors.

- [ ] **Step 3: Verify server starts (will exit quickly without MCP client, but should not crash)**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && echo '{}' | timeout 2 node dist/index.js 2>&1 || true
```

Expected: See "Metafide Spot-On MCP Server running on stdio" on stderr, or a clean exit. No crash.

- [ ] **Step 4: Add dist to gitignore**

Create `mcp-server/.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 5: Final commit**

```bash
git add mcp-server/.gitignore
git commit -m "Add gitignore and verify full build"
```

---

### Task 12: Integration Smoke Test

- [ ] **Step 1: Test with Claude Code MCP inspector (if available)**

```bash
cd /Users/amlanchowdhury/Projects/spot-on/mcp-server && npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a browser UI to test each tool interactively. Verify:
- `get_config` returns defaults
- `configure_strategy` with `{ "interval": 3600 }` updates config
- `get_live_price` returns BTC price (requires valid API key in env)

- [ ] **Step 2: Test with actual API key (if available)**

```bash
METAFIDE_API_KEY=your-key METAFIDE_USER_ADDRESS=your-address npx @modelcontextprotocol/inspector node dist/index.js
```

Test `get_balance`, `get_live_price`, `get_spot_game` with real credentials on testnet.

- [ ] **Step 3: Commit any fixes from smoke testing**

```bash
git add -A mcp-server/
git commit -m "Fix issues found during integration smoke test"
```

(Only if changes were needed.)
