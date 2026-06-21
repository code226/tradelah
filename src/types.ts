export interface Position {
  symbol: string;
  symbolId: number;
  openQuantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  currency: 'CAD' | 'USD';
}

export type AccountType = 'TFSA' | 'RRSP' | 'MARGIN';

export interface Account {
  type: AccountType;
  accountId: string;
  cashCAD: number;
  cashUSD: number;
  buyingPowerCAD: number;
  buyingPowerUSD: number;
  positions: Position[];
}

export interface MarketQuote {
  symbol: string;
  price: number;
  changePercent: number;
  timestamp: Date;
}

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface StrategySignal {
  symbol: string;
  action: SignalAction;
  suggestedPrice: number;
  estimatedCost: number;
  currency: 'CAD' | 'USD';
  reason: string;
  timestamp: Date;
}

export interface OrderSuggestion {
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  accountType: AccountType;
  tenantName: string;
  reason: string;
  currency: 'CAD' | 'USD';
  estimatedCost: number;
  portfolioWeightImpact: {
    currentWeight: number;
    targetWeight: number;
    newWeight: number;
  };
}

// --- Global application config (from .env and root config.json) ---

export interface AppConfig {
  // Questrade API (dormant — retained for future iterations)
  questradeApiUrl: string;
  questradeRefreshToken: string;

  // Telegram (shared bot token — one bot serves all tenants)
  telegramBotToken: string;

  // Runtime
  simulationMode: boolean;
  pollingIntervalSeconds: number;
  marketHoursOnly: boolean;
}

// --- Per-tenant configuration (from tenants/*/config.json) ---

export interface TenantConfig {
  tenantName: string;
  telegramChatId: string;
  balancesCsvPath: string;
  positionsCsvPath: string;
  watchlist: string[];
  targetAllocations: Record<string, number>;
  risk: {
    maxPositionSizePercent: number;
    minCashBufferPercent: number;
    rebalanceDriftThreshold: number;
  };
}
