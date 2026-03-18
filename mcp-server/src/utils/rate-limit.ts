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
