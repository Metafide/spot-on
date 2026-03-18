import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRunBotCycle } from '../../src/tools/run-bot-cycle.js';
import { resetConfig, getConfig, updateConfig } from '../../src/config.js';

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
    mockApi.get
      .mockResolvedValueOnce({ positions: [], streaks: [] })
      .mockResolvedValueOnce({ balance: '1000' })
      .mockResolvedValueOnce({ can_place_position: true, early_precision_window: true, liveGame: { gid: 'g1' } })
      .mockResolvedValueOnce({ value: 68000.5, timestamp: Date.now() });

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
