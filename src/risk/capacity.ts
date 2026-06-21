import { config } from '../config/index.js';
import { Account, StrategySignal, OrderSuggestion, AccountType } from '../types.js';

export class CapacityFilter {
  /**
   * Filters trade signals through capacity limits and formats them as order recommendations.
   */
  filterAndSize(signals: StrategySignal[], accounts: Account[]): OrderSuggestion[] {
    const suggestions: OrderSuggestion[] = [];

    // Compute total portfolio value
    let totalPortfolioValue = 0;
    const currentValues: Record<string, number> = {};

    for (const acc of accounts) {
      totalPortfolioValue += acc.cash;
      for (const pos of acc.positions) {
        totalPortfolioValue += pos.marketValue;
        currentValues[pos.symbol] = (currentValues[pos.symbol] || 0) + pos.marketValue;
      }
    }

    if (totalPortfolioValue === 0) return [];

    for (const signal of signals) {
      if (signal.action === 'HOLD') continue;

      // Smart routing logic for account selection:
      // US assets (no .TO suffix) route to RRSP first (tax efficiency on US dividends).
      // Canadian assets (.TO suffix) route to TFSA first.
      const isUSAsset = !signal.symbol.endsWith('.TO');
      const preferredAccountType: AccountType = isUSAsset ? 'RRSP' : 'TFSA';
      const alternateAccountType: AccountType = isUSAsset ? 'TFSA' : 'RRSP';

      let selectedAccount = accounts.find(a => a.type === preferredAccountType);
      
      // If preferred account lacks cash for BUY, check the alternate
      if (signal.action === 'BUY' && selectedAccount && selectedAccount.cash < 500) {
        const altAcc = accounts.find(a => a.type === alternateAccountType);
        if (altAcc && altAcc.cash > selectedAccount.cash) {
          selectedAccount = altAcc;
        }
      }

      if (!selectedAccount) continue;

      const accountType = selectedAccount.type;
      const currentPrice = signal.suggestedPrice;

      if (signal.action === 'BUY') {
        // Cash checks
        const cashBuffer = totalPortfolioValue * config.risk.minCashBufferPercent;
        const safeAvailableCash = Math.max(0, selectedAccount.cash - cashBuffer);

        if (safeAvailableCash < 100) {
          // Insufficient buying capacity
          continue;
        }

        // Limit trade so total position weight won't exceed maxPositionSizePercent
        const targetAllocationWeight = config.targetAllocations[signal.symbol] || 0.10;
        const maxAllowedAllocation = totalPortfolioValue * Math.min(config.risk.maxPositionSizePercent, targetAllocationWeight * 1.5);
        const currentAllocationValue = currentValues[signal.symbol] || 0;
        const remainingBuyingRoom = Math.max(0, maxAllowedAllocation - currentAllocationValue);

        const buyBudget = Math.min(safeAvailableCash, remainingBuyingRoom);
        if (buyBudget < 100) continue;

        const quantity = Math.floor(buyBudget / currentPrice);
        if (quantity <= 0) continue;

        const estimatedCost = quantity * currentPrice;
        const currentWeight = currentAllocationValue / totalPortfolioValue;
        const newWeight = (currentAllocationValue + estimatedCost) / totalPortfolioValue;

        suggestions.push({
          symbol: signal.symbol,
          action: 'BUY',
          quantity,
          price: currentPrice,
          accountType,
          reason: signal.reason,
          estimatedCost,
          portfolioWeightImpact: {
            currentWeight,
            targetWeight: config.targetAllocations[signal.symbol] || 0,
            newWeight
          }
        });
      } else {
        // SELL signal
        const existingPosition = selectedAccount.positions.find(p => p.symbol === signal.symbol);
        if (!existingPosition || existingPosition.openQuantity <= 0) {
          // No shares to sell in this account
          continue;
        }

        // Sell rules: determine quantity to sell.
        // For rebalancing drift: sell enough to return near target allocation.
        const currentAllocationValue = currentValues[signal.symbol] || 0;
        const targetWeight = config.targetAllocations[signal.symbol] || 0;
        const targetValue = totalPortfolioValue * targetWeight;
        const overageValue = currentAllocationValue - targetValue;

        let sellQty = existingPosition.openQuantity;
        if (overageValue > 0 && overageValue < existingPosition.marketValue) {
          sellQty = Math.floor(overageValue / currentPrice);
        }

        if (sellQty <= 0) continue;

        const estimatedCredit = sellQty * currentPrice;
        const currentWeight = currentAllocationValue / totalPortfolioValue;
        const newWeight = Math.max(0, (currentAllocationValue - estimatedCredit) / totalPortfolioValue);

        suggestions.push({
          symbol: signal.symbol,
          action: 'SELL',
          quantity: sellQty,
          price: currentPrice,
          accountType,
          reason: signal.reason,
          estimatedCost: estimatedCredit, // represent incoming cash
          portfolioWeightImpact: {
            currentWeight,
            targetWeight,
            newWeight
          }
        });
      }
    }

    return suggestions;
  }
}
