import { getConfig, updateConfig, type StrategyConfig } from '../config.js';
import { validateInterval, validateNetwork, validateMaxPositions } from '../utils/validation.js';

interface ConfigureInput {
  network?: string;
  interval?: number;
  max_positions?: number;
  price_range_min?: number;
  price_range_max?: number;
  position_amounts?: number[];
  enable_early_precision?: boolean;
}

export async function handleConfigureStrategy(input: ConfigureInput) {
  const errors: string[] = [];

  if (input.network !== undefined && !validateNetwork(input.network)) {
    errors.push('network must be "testnet" or "mainnet"');
  }
  if (input.interval !== undefined && !validateInterval(input.interval)) {
    errors.push('interval must be 60, 3600 or 86400');
  }
  if (input.max_positions !== undefined && !validateMaxPositions(input.max_positions)) {
    errors.push('max_positions must be 1-10');
  }
  if (input.price_range_min !== undefined && input.price_range_max !== undefined) {
    if (input.price_range_min >= input.price_range_max) {
      errors.push('price_range_min must be less than price_range_max');
    }
  }

  if (errors.length > 0) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `Validation failed: ${errors.join('; ')}` }],
    };
  }

  const updates: Partial<StrategyConfig> = {};
  if (input.network !== undefined) updates.network = input.network as StrategyConfig['network'];
  if (input.interval !== undefined) updates.interval = input.interval as StrategyConfig['interval'];
  if (input.max_positions !== undefined) updates.max_positions = input.max_positions;
  if (input.enable_early_precision !== undefined) updates.enable_early_precision = input.enable_early_precision;

  if (input.price_range_min !== undefined || input.price_range_max !== undefined) {
    const currentConfig = getConfig();
    const interval = input.interval ?? currentConfig.interval;
    const currentRange = currentConfig.price_ranges[interval] || { min: -40, max: 50 };
    updates.price_ranges = {
      ...currentConfig.price_ranges,
      [interval]: {
        min: input.price_range_min ?? currentRange.min,
        max: input.price_range_max ?? currentRange.max,
      },
    };
  }

  if (input.position_amounts !== undefined) {
    const currentConfig = getConfig();
    const interval = input.interval ?? currentConfig.interval;
    updates.position_amounts = {
      ...currentConfig.position_amounts,
      [interval]: input.position_amounts,
    };
  }

  const config = updateConfig(updates);
  return { content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }] };
}
