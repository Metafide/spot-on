import { getConfig } from '../config.js';

export async function handleGetConfig() {
  const config = getConfig();
  const display = { ...config, apiKey: config.apiKey ? '***' : '(not set)' };
  return { content: [{ type: 'text' as const, text: JSON.stringify(display, null, 2) }] };
}
