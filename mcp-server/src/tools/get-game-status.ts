import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

export async function handleGetGameStatus(api: MetafideApi, config: FullConfig) {
  const data = await api.get(
    `status?asset=${config.asset}&token=${config.currency}&network=${config.network}&interval=${config.interval}`
  );
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
