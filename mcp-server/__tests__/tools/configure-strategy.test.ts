import { describe, it, expect, beforeEach } from 'vitest';
import { handleConfigureStrategy } from '../../src/tools/configure-strategy.js';
import { handleGetConfig } from '../../src/tools/get-config.js';
import { resetConfig } from '../../src/config.js';

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

  it('updates price ranges for current interval', async () => {
    const result = await handleConfigureStrategy({ price_range_min: -5, price_range_max: 5 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.price_ranges[60].min).toBe(-5);
    expect(parsed.price_ranges[60].max).toBe(5);
    // Other intervals unchanged
    expect(parsed.price_ranges[3600].min).toBe(-40);
  });

  it('updates position amounts for current interval', async () => {
    const result = await handleConfigureStrategy({ position_amounts: [1, 2, 3] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.position_amounts[60]).toEqual([1, 2, 3]);
    // Other intervals unchanged
    expect(parsed.position_amounts[3600]).toEqual([1, 2, 3, 4]);
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
