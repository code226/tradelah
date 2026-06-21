import { config } from '../config/index.js';
import { LocalStore } from '../db/index.js';
import { MarketQuote } from '../types.js';

export class MarketDataClient {
  private static priceHistoryKey = 'simulatedPriceHistory';

  /**
   * Fetches latest quotes for a list of symbols.
   */
  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    if (config.simulationMode) {
      return this.getMockQuotes(symbols);
    }

    // Real API fallback could fetch from free finance APIs like Yahoo Finance
    try {
      return this.getMockQuotes(symbols); 
    } catch (error) {
      console.error(`❌ [MarketData] Failed to fetch quotes: ${(error as Error).message}`);
      return this.getMockQuotes(symbols);
    }
  }

  /**
   * Simulates market price feeds with minor drift/fluctuations.
   */
  private getMockQuotes(symbols: string[]): MarketQuote[] {
    const store = LocalStore.read();
    let history: Record<string, number> = (store as any)[MarketDataClient.priceHistoryKey] || {};

    const basePrices: Record<string, number> = {
      'VFV.TO': 115.00,
      'XIU.TO': 32.50,
      'MSFT': 415.00,
      'AAPL': 178.00
    };

    const quotes: MarketQuote[] = symbols.map(symbol => {
      const basePrice = basePrices[symbol] || 100.00;
      const lastPrice = history[symbol] || basePrice;

      // Simulate a small tick movement (-1.2% to +1.2%)
      const percentageChange = (Math.random() * 2.4 - 1.2) / 100;
      const newPrice = Number((lastPrice * (1 + percentageChange)).toFixed(2));
      const driftFromBase = ((newPrice - basePrice) / basePrice) * 100;

      history[symbol] = newPrice;

      return {
        symbol,
        price: newPrice,
        changePercent: Number(driftFromBase.toFixed(2)),
        timestamp: new Date()
      };
    });

    // Save updated prices to store
    LocalStore.write({ [MarketDataClient.priceHistoryKey]: history } as any);

    return quotes;
  }
}
