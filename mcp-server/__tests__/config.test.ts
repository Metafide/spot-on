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
    expect(config.currency).toBe('USDC');
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
    const config = getConfig();
    expect(typeof config.apiKey).toBe('string');
  });
});
