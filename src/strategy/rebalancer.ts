import { config } from '../config/index.js';
import { Account, StrategySignal } from '../types.js';

export class RebalancerStrategy {
  /**
   * Reviews the entire portfolio and creates rebalancing signals if allocations have drifted.
   */
  evaluate(accounts: Account[]): StrategySignal[] {
    const signals: StrategySignal[] = [];

    // Calculate total portfolio value (all accounts cash + all positions market value)
    let totalPortfolioValue = 0;
    const currentValues: Record<string, number> = {};

    for (const acc of accounts) {
      totalPortfolioValue += acc.cash;
      for (const pos of acc.positions) {
        totalPortfolioValue += pos.marketValue;
        currentValues[pos.symbol] = (currentValues[pos.symbol] || 0) + pos.marketValue;
      }
    }

    if (totalPortfolioValue === 0) {
      return [];
    }

    // Evaluate drifts for tickers defined in targetAllocations
    const targets = config.targetAllocations;
    const threshold = config.risk.rebalanceDriftThreshold;

    for (const [symbol, targetWeight] of Object.entries(targets)) {
      const currentValue = currentValues[symbol] || 0;
      const currentWeight = currentValue / totalPortfolioValue;
      const drift = currentWeight - targetWeight;

      if (Math.abs(drift) > threshold) {
        const action = drift > 0 ? 'SELL' : 'BUY';
        const driftPercent = (drift * 100).toFixed(1);
        const targetPercent = (targetWeight * 100).toFixed(1);
        const currentPercent = (currentWeight * 100).toFixed(1);

        const reason = `Portfolio Drift Alert: ${symbol} is at ${currentPercent}% (Target: ${targetPercent}%). Drift of ${driftPercent}% exceeds the ${threshold * 100}% threshold.`;
        
        // Find a representative current price or default to 1
        let currentPrice = 1.0;
        for (const acc of accounts) {
          const pos = acc.positions.find(p => p.symbol === symbol);
          if (pos) {
            currentPrice = pos.currentPrice;
            break;
          }
        }

        signals.push({
          symbol,
          action,
          suggestedPrice: currentPrice,
          reason,
          timestamp: new Date()
        });
      }
    }

    return signals;
  }
}
