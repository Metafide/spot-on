import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

export async function handleGetSpotGame(api: MetafideApi, config: FullConfig) {
  const data = await api.get(`spot?asset=${config.asset}&interval=${config.interval}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
