const METAFIDE_API_URL =
  "https://staging-rest-service-714806972467.us-east1.run.app";
const METAFIDE_API_VERSION = "v1";
const METAFIDE_BASE_PATH = "surge/games/";

export interface StrategyConfig {
  network: "testnet" | "mainnet";
  interval: 60 | 3600 | 86400;
  currency: string;
  asset: string;
  max_positions: number;
  enable_early_precision: boolean;
  price_ranges: Record<number, { min: number; max: number }>;
  position_amounts: Record<number, number[]>;
}

export interface FullConfig extends StrategyConfig {
  apiKey: string;
  userAddress: string;
  endpoint: string;
}

const DEFAULTS: StrategyConfig = {
  network: "testnet",
  interval: 60,
  currency: "USDC",
  asset: "BTC_USDT",
  max_positions: 10,
  enable_early_precision: false,
  price_ranges: {
    60: { min: -10, max: 10 },
    3600: { min: -40, max: 50 },
    86400: { min: -40, max: 50 },
  },
  position_amounts: {
    60: [0.01, 0.02, 0.03, 0.04],
    3600: [1, 2, 3, 4],
    86400: [5, 6, 7, 8],
  },
};

let current: StrategyConfig = { ...DEFAULTS };

export function getConfig(): FullConfig {
  return {
    ...current,
    price_ranges: { ...current.price_ranges },
    position_amounts: { ...current.position_amounts },
    apiKey: process.env.METAFIDE_API_KEY ?? "",
    userAddress: process.env.METAFIDE_USER_ADDRESS ?? "",
    endpoint: `${METAFIDE_API_URL}/${METAFIDE_API_VERSION}/${METAFIDE_BASE_PATH}`,
  };
}

export function updateConfig(partial: Partial<StrategyConfig>): FullConfig {
  current = { ...current, ...partial };
  return getConfig();
}

export function resetConfig(): FullConfig {
  current = { ...DEFAULTS };
  return getConfig();
}
