import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePlacePosition } from '../../src/tools/place-position.js';
import { resetConfig, getConfig, updateConfig } from '../../src/config.js';

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
      getConfig(),
      { strike_price: 68000, amount: 0.01 }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('minimum');
  });
});
