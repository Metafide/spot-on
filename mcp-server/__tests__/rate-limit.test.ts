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
