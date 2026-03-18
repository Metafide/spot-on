import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

export async function handleGetLivePrice(api: MetafideApi, config: FullConfig) {
  const data = await api.get(`live-price?asset=${config.asset}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
