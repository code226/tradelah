import { MarketQuote, StrategySignal } from '../types.js';
import { LocalStore } from '../db/index.js';

export class TechnicalStrategy {
  private static priceHistoryKey = 'simulatedPriceHistoryRecords';

  /**
   * Evaluates quotes and generates BUY/SELL/HOLD signals.
   */
  async evaluate(quotes: MarketQuote[]): Promise<StrategySignal[]> {
    const store = LocalStore.read();
    const history: Record<string, number[]> = (store as any)[TechnicalStrategy.priceHistoryKey] || {};

    const signals: StrategySignal[] = [];

    for (const quote of quotes) {
      const symbol = quote.symbol;
      
      // Keep track of the last 14 price points for RSI calculation
      if (!history[symbol]) {
        history[symbol] = [];
      }
      history[symbol].push(quote.price);
      if (history[symbol].length > 15) {
        history[symbol].shift();
      }

      const rsi = this.calculateRSI(history[symbol]);
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let reason = `Price is steady at $${quote.price}. Simulated RSI: ${rsi.toFixed(1)}.`;

      if (rsi < 30) {
        action = 'BUY';
        reason = `Simulated RSI of ${rsi.toFixed(1)} is below 30 (Oversold threshold). Indicator suggests entry opportunity.`;
      } else if (rsi > 70) {
        action = 'SELL';
        reason = `Simulated RSI of ${rsi.toFixed(1)} is above 70 (Overbought threshold). Indicator suggests taking profit.`;
      }

      signals.push({
        symbol,
        action,
        suggestedPrice: quote.price,
        reason,
        timestamp: new Date()
      });
    }

    // Save updated history
    LocalStore.write({ [TechnicalStrategy.priceHistoryKey]: history } as any);

    return signals;
  }

  /**
   * Helper to calculate a basic RSI based on historical close values.
   */
  private calculateRSI(prices: number[]): number {
    if (prices.length < 6) {
      // Not enough data yet, return a neutral RSI of 50
      return 50;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    if (losses === 0) {
      return 100;
    }

    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }
}
