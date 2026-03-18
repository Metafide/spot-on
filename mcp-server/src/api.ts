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
