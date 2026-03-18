import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetafideApi } from '../src/api.js';

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
        json: async () => ({ error: 'Rate limit exceeded', resetIn: 0.001 }),
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
      json: async () => ({ error: 'Rate limit exceeded', resetIn: 0.001, limit: 120, current: 121 }),
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
