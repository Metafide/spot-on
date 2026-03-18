import type { MetafideApi } from '../api.js';
import type { FullConfig } from '../config.js';

interface BotCycleInput {
  confirmed?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface PositionPayload {
  gid: string;
  c: string;
  a: string;
  sp: string;
  f: string;
  pw: string;
  n: string;
  it: number;
}

function generatePositions(config: FullConfig, gid: string, currentPrice: number, count: number): PositionPayload[] {
  const amountOptions = config.position_amounts[config.interval] || [1];
  const priceRange = config.price_ranges[config.interval] || { min: -40, max: 50 };
  const positions: PositionPayload[] = [];

  for (let i = 0; i < count; i++) {
    const amount = amountOptions[Math.floor(Math.random() * amountOptions.length)];
    const offset = randInt(priceRange.min, priceRange.max);
    const strikePrice = currentPrice + offset;

    positions.push({
      gid,
      c: config.currency,
      a: config.asset,
      sp: strikePrice.toFixed(0),
      f: String(amount),
      pw: config.userAddress,
      n: config.network,
      it: config.interval,
    });
  }

  return positions;
}

async function submitPositions(
  api: MetafideApi,
  positions: PositionPayload[],
  retries = 0
): Promise<{ submitted: number; failed: number; details: string[] }> {
  const MAX_RETRIES = 3;
  const details: string[] = [];
  let submitted = 0;

  const results = await Promise.allSettled(
    positions.map((p) => api.post('spot', p as unknown as Record<string, unknown>))
  );

  const failedPositions: PositionPayload[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const res = result.value as { txid?: string };
      details.push(`Position ${i + 1}: placed (txid: ${res.txid})`);
      submitted++;
    } else {
      details.push(`Position ${i + 1}: failed (${result.reason?.message || 'unknown error'})`);
      failedPositions.push(positions[i]);
    }
  });

  if (failedPositions.length > 0 && retries < MAX_RETRIES) {
    details.push(`Retrying ${failedPositions.length} failed position(s)... (attempt ${retries + 1} of ${MAX_RETRIES})`);
    await sleep(1000);
    const retryResult = await submitPositions(api, failedPositions, retries + 1);
    submitted += retryResult.submitted;
    details.push(...retryResult.details);
    return { submitted, failed: retryResult.failed, details };
  }

  return { submitted, failed: failedPositions.length, details };
}

export async function handleRunBotCycle(
  api: MetafideApi,
  config: FullConfig,
  input: BotCycleInput
) {
  // Step 1: Fetch status
  const status = (await api.get(
    `status?asset=${config.asset}&token=${config.currency}&network=${config.network}&interval=${config.interval}`
  )) as { positions: unknown[]; streaks: unknown[] };

  const currentCount = (status.positions || []).length;

  // Step 2: Check position cap
  if (currentCount >= config.max_positions) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: `Already at max positions (${currentCount}/${config.max_positions})`,
        }, null, 2),
      }],
    };
  }

  // Step 3: Fetch balance, game, price in parallel
  const [balance, game, price] = await Promise.all([
    api.get(`user-balance?currency=${config.currency}&network=${config.network}`),
    api.get(`spot?asset=${config.asset}&interval=${config.interval}`) as Promise<{
      can_place_position: boolean;
      early_precision_window?: boolean;
      liveGame: { gid: string };
    }>,
    api.get(`live-price?asset=${config.asset}`) as Promise<{ value: number; timestamp: number }>,
  ]);

  if (!balance || !game || !price) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: 'Incomplete data from API. Try again.' }],
    };
  }

  // Step 4: Check game state
  if (!game.can_place_position) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: 'Game is not accepting positions right now.',
        }, null, 2),
      }],
    };
  }

  // Step 5: Early precision check
  if (config.enable_early_precision && !game.early_precision_window) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          positions_submitted: 0,
          positions_failed: 0,
          total_positions: currentCount,
          reason: 'Early precision window is not open.',
        }, null, 2),
      }],
    };
  }

  // Step 6: Generate positions
  const currentPrice = Number(price.value.toFixed(0));
  const remainingSlots = config.max_positions - currentCount;
  const positions = generatePositions(config, game.liveGame.gid, currentPrice, remainingSlots);

  // Step 7: Mainnet confirmation gate
  if (config.network === 'mainnet' && !input.confirmed) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          confirmation_required: true,
          positions_preview: positions.map((p) => ({
            strike_price: p.sp,
            amount: p.f,
            game_id: p.gid,
          })),
          network: config.network,
          total_to_submit: positions.length,
        }, null, 2),
      }],
    };
  }

  // Step 8: Submit
  const result = await submitPositions(api, positions);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        positions_submitted: result.submitted,
        positions_failed: result.failed,
        total_positions: currentCount + result.submitted,
        details: result.details,
      }, null, 2),
    }],
  };
}
