import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

export async function handleGetBalance(api: MetafideApi, config: FullConfig) {
  const data = await api.get(`user-balance?currency=${config.currency}&network=${config.network}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
