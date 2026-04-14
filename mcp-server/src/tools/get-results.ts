import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

interface GetResultsInput {
  gid?: string;
  interval?: number;
  limit?: number;
  offset?: number;
}

export async function handleGetResults(api: MetafideApi, config: FullConfig, input: GetResultsInput) {
  const params = new URLSearchParams({
    network: config.network,
  });

  if (input.gid) params.set('gid', input.gid);
  if (input.interval) params.set('interval', String(input.interval));
  if (input.limit) params.set('limit', String(input.limit));
  if (input.offset) params.set('offset', String(input.offset));
  params.set('asset', config.asset);

  const data = await api.get(`results?${params.toString()}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
