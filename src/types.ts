export interface Position {
  symbol: string;
  symbolId: number;
  openQuantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  marketValue: number;
}

export type AccountType = 'TFSA' | 'RRSP';

export interface Account {
  type: AccountType;
  accountId: string;
  cash: number;
  buyingPower: number;
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
  reason: string;
  timestamp: Date;
}

export interface OrderSuggestion {
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  accountType: AccountType;
  reason: string;
  estimatedCost: number;
  portfolioWeightImpact: {
    currentWeight: number;
    targetWeight: number;
    newWeight: number;
  };
}

export interface AppConfig {
  questradeApiUrl: string;
  questradeRefreshToken: string;
  telegramBotToken: string;
  telegramChatId: string;
  simulationMode: boolean;
  watchlist: string[];
  targetAllocations: Record<string, number>;
  risk: {
    maxPositionSizePercent: number;
    minCashBufferPercent: number;
    rebalanceDriftThreshold: number;
  };
}
