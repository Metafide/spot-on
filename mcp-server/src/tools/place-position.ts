import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';
import { validatePositionAmount, validateStrikePrice } from '../utils/validation.js';

interface PlacePositionInput {
  strike_price: number;
  amount: number;
  confirmed?: boolean;
}

const POSITION_MINIMUMS: Record<number, number> = { 60: 0.1, 3600: 1, 86400: 5 };

export async function handlePlacePosition(
  api: MetafideApi,
  config: FullConfig,
  input: PlacePositionInput
) {
  if (!validateStrikePrice(input.strike_price)) {
    return { isError: true as const, content: [{ type: 'text' as const, text: 'strike_price must be a positive number' }] };
  }
  if (!validatePositionAmount(input.amount, config.interval)) {
    const min = POSITION_MINIMUMS[config.interval];
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `Amount below minimum for ${config.interval}s interval. Minimum: ${min} USDC` }],
    };
  }

  const game = (await api.get(`spot?asset=${config.asset}&interval=${config.interval}`)) as {
    can_place_position: boolean;
    early_precision_window?: boolean;
    liveGame: { gid: string };
  };

  if (!game.can_place_position) {
    return { isError: true as const, content: [{ type: 'text' as const, text: 'Game is not accepting positions right now.' }] };
  }

  if (config.network === 'mainnet' && !input.confirmed) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          confirmation_required: true,
          details: {
            strike_price: input.strike_price,
            amount: input.amount,
            network: config.network,
            game_id: game.liveGame.gid,
            asset: config.asset,
            currency: config.currency,
          },
        }, null, 2),
      }],
    };
  }

  const payload = {
    gid: game.liveGame.gid,
    c: config.currency,
    a: config.asset,
    sp: String(input.strike_price),
    f: String(input.amount),
    pw: config.userAddress,
    n: config.network,
    it: config.interval,
  };

  const result = await api.post('spot', payload);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
