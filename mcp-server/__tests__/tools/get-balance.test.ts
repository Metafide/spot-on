import { describe, it, expect, vi } from 'vitest';
import { handleGetBalance } from '../../src/tools/get-balance.js';

describe('get_balance tool', () => {
  it('calls API and returns formatted result', async () => {
    const mockApi = {
      get: vi.fn().mockResolvedValue({ userId: 1, balance: '1000', withdrawal_req: 'none' }),
      post: vi.fn(),
    };
    const config = { currency: 'USDC', network: 'testnet' as const } as any;

    const result = await handleGetBalance(mockApi as any, config);
    expect(mockApi.get).toHaveBeenCalledWith('user-balance?currency=USDC&network=testnet');
    expect(result.content[0].text).toContain('1000');
  });
});
