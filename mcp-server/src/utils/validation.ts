const VALID_INTERVALS = [60, 3600, 86400] as const;
const VALID_NETWORKS = ["testnet", "mainnet"] as const;
const POSITION_MINIMUMS: Record<number, number> = { 60: 0.1, 3600: 1, 86400: 5 };

export function validateInterval(interval: number): boolean {
  return (VALID_INTERVALS as readonly number[]).includes(interval);
}

export function validateNetwork(network: string): boolean {
  return (VALID_NETWORKS as readonly string[]).includes(network);
}

export function validateMaxPositions(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

export function validatePositionAmount(amount: number, interval: number): boolean {
  const min = POSITION_MINIMUMS[interval];
  if (min === undefined) return false;
  return amount >= min;
}

export function validateStrikePrice(price: number): boolean {
  return price > 0;
}
