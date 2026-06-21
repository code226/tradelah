import { Account, StrategySignal, TenantConfig } from '../types.js';

export class RebalancerStrategy {
  /**
   * Reviews the entire portfolio and creates rebalancing signals if allocations have drifted.
   * @param accounts - The tenant's parsed portfolio accounts.
   * @param tenantConfig - The tenant's configuration with target allocations and risk thresholds.
   */
  evaluate(accounts: Account[], tenantConfig: TenantConfig): StrategySignal[] {
    const signals: StrategySignal[] = [];

    // Calculate total portfolio value normalized to CAD (using a static 1.35 FX rate for MVP)
    const FX_RATE = 1.35;
    let totalPortfolioValueCAD = 0;
    const currentValuesCAD: Record<string, number> = {};

    for (const acc of accounts) {
      totalPortfolioValueCAD += acc.cashCAD + (acc.cashUSD * FX_RATE);
      for (const pos of acc.positions) {
        const posValueCAD = pos.currency === 'USD' ? pos.marketValue * FX_RATE : pos.marketValue;
        totalPortfolioValueCAD += posValueCAD;
        currentValuesCAD[pos.symbol] = (currentValuesCAD[pos.symbol] || 0) + posValueCAD;
      }
    }

    if (totalPortfolioValueCAD === 0) {
      return [];
    }

    // Evaluate drifts for tickers defined in this tenant's targetAllocations
    const targets = tenantConfig.targetAllocations;
    const threshold = tenantConfig.risk.rebalanceDriftThreshold;

    for (const [symbol, targetWeight] of Object.entries(targets)) {
      const currentValueCAD = currentValuesCAD[symbol] || 0;
      const currentWeight = currentValueCAD / totalPortfolioValueCAD;
      const drift = currentWeight - targetWeight;

      if (Math.abs(drift) > threshold) {
        const action = drift > 0 ? 'SELL' : 'BUY';
        const driftPercent = (drift * 100).toFixed(1);
        const targetPercent = (targetWeight * 100).toFixed(1);
        const currentPercent = (currentWeight * 100).toFixed(1);

        const reason = `Portfolio Drift Alert: ${symbol} is at ${currentPercent}% (Target: ${targetPercent}%). Drift of ${driftPercent}% exceeds the ${threshold * 100}% threshold.`;
        
        // Find a representative current price or default to 1
        let currentPrice = 1.0;
        let currency: 'CAD' | 'USD' = symbol.endsWith('.TO') || symbol.endsWith('.V') ? 'CAD' : 'USD';
        
        for (const acc of accounts) {
          const pos = acc.positions.find(p => p.symbol === symbol);
          if (pos) {
            currentPrice = pos.currentPrice;
            currency = pos.currency;
            break;
          }
        }

        signals.push({
          symbol,
          action,
          suggestedPrice: currentPrice,
          reason,
          currency,
          estimatedCost: 0, // Assigned during sizing
          timestamp: new Date()
        });
      }
    }

    return signals;
  }
}
