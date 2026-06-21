import { Account, StrategySignal, OrderSuggestion, AccountType, TenantConfig } from '../types.js';

export class CapacityFilter {
  /**
   * Filters trade signals through capacity limits and formats them as order recommendations.
   * @param signals - Strategy signals to evaluate.
   * @param accounts - The tenant's portfolio accounts.
   * @param tenantConfig - The tenant's configuration with risk limits and target allocations.
   */
  filterAndSize(signals: StrategySignal[], accounts: Account[], tenantConfig: TenantConfig): OrderSuggestion[] {
    const suggestions: OrderSuggestion[] = [];

    // Calculate total portfolio value normalized to CAD
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

    if (totalPortfolioValueCAD === 0) return [];

    for (const signal of signals) {
      if (signal.action === 'HOLD') continue;

      // Ensure signal has a currency (default to CAD if unknown, but rebalancer now provides it)
      const assetCurrency = signal.currency || (signal.symbol.endsWith('.TO') ? 'CAD' : 'USD');
      
      // Smart routing logic for account selection:
      // US assets route to RRSP first (tax efficiency on US dividends).
      // Canadian assets (.TO suffix) route to TFSA first.
      const preferredAccountType: AccountType = assetCurrency === 'USD' ? 'RRSP' : 'TFSA';
      const alternateAccountType: AccountType = assetCurrency === 'USD' ? 'TFSA' : 'RRSP';

      let selectedAccount = accounts.find(a => a.type === preferredAccountType);
      
      // Check cash in the correct currency bucket
      const getCash = (acc: Account) => assetCurrency === 'USD' ? acc.cashUSD : acc.cashCAD;

      // If preferred account lacks cash for BUY, check the alternate
      if (signal.action === 'BUY' && selectedAccount && getCash(selectedAccount) < 500) {
        const altAcc = accounts.find(a => a.type === alternateAccountType);
        if (altAcc && getCash(altAcc) > getCash(selectedAccount)) {
          selectedAccount = altAcc;
        }
      }

      // If preferred account doesn't exist at all, try the alternate
      if (!selectedAccount) {
        selectedAccount = accounts.find(a => a.type === alternateAccountType);
      }

      if (!selectedAccount) continue;

      const accountType = selectedAccount.type;
      const currentPrice = signal.suggestedPrice;
      const accountCash = getCash(selectedAccount);

      if (signal.action === 'BUY') {
        // Cash checks (must use the exact currency bucket, no FX conversion allowed)
        // Cash buffer is still calculated against the total normalized portfolio value,
        // but we apply it to the respective bucket (e.g., if buffer is $5k CAD, we need $5k CAD equivalent)
        const cashBufferCAD = totalPortfolioValueCAD * tenantConfig.risk.minCashBufferPercent;
        const cashBufferLocal = assetCurrency === 'USD' ? cashBufferCAD / FX_RATE : cashBufferCAD;
        
        const safeAvailableCash = Math.max(0, accountCash - cashBufferLocal);

        if (safeAvailableCash < 100) {
          // Insufficient buying capacity in this specific currency
          continue;
        }

        // Limit trade so total position weight won't exceed maxPositionSizePercent
        const targetAllocationWeight = tenantConfig.targetAllocations[signal.symbol] || 0.10;
        const maxAllowedAllocationCAD = totalPortfolioValueCAD * Math.min(tenantConfig.risk.maxPositionSizePercent, targetAllocationWeight * 1.5);
        const currentAllocationValueCAD = currentValuesCAD[signal.symbol] || 0;
        const remainingBuyingRoomCAD = Math.max(0, maxAllowedAllocationCAD - currentAllocationValueCAD);
        const remainingBuyingRoomLocal = assetCurrency === 'USD' ? remainingBuyingRoomCAD / FX_RATE : remainingBuyingRoomCAD;

        const buyBudget = Math.min(safeAvailableCash, remainingBuyingRoomLocal);
        if (buyBudget < 100) continue;

        const quantity = Math.floor(buyBudget / currentPrice);
        if (quantity <= 0) continue;

        const estimatedCost = quantity * currentPrice;
        const currentWeight = currentAllocationValueCAD / totalPortfolioValueCAD;
        const estimatedCostCAD = assetCurrency === 'USD' ? estimatedCost * FX_RATE : estimatedCost;
        const newWeight = (currentAllocationValueCAD + estimatedCostCAD) / totalPortfolioValueCAD;

        suggestions.push({
          symbol: signal.symbol,
          action: 'BUY',
          quantity,
          price: currentPrice,
          accountType,
          tenantName: tenantConfig.tenantName,
          reason: signal.reason,
          currency: assetCurrency,
          estimatedCost,
          portfolioWeightImpact: {
            currentWeight,
            targetWeight: tenantConfig.targetAllocations[signal.symbol] || 0,
            newWeight
          }
        });
      } else {
        // SELL signal
        const existingPosition = selectedAccount.positions.find(p => p.symbol === signal.symbol);
        if (!existingPosition || existingPosition.openQuantity <= 0) {
          continue;
        }

        const currentAllocationValueCAD = currentValuesCAD[signal.symbol] || 0;
        const targetWeight = tenantConfig.targetAllocations[signal.symbol] || 0;
        const targetValueCAD = totalPortfolioValueCAD * targetWeight;
        const overageValueCAD = currentAllocationValueCAD - targetValueCAD;
        const overageValueLocal = assetCurrency === 'USD' ? overageValueCAD / FX_RATE : overageValueCAD;

        let sellQty = existingPosition.openQuantity;
        // Don't sell all if we are just over by a bit, unless we are very close to 0 quantity
        if (overageValueLocal > 0 && overageValueLocal < existingPosition.marketValue) {
          sellQty = Math.floor(overageValueLocal / currentPrice);
        }

        if (sellQty <= 0) continue;

        const estimatedCredit = sellQty * currentPrice;
        const currentWeight = currentAllocationValueCAD / totalPortfolioValueCAD;
        const estimatedCreditCAD = assetCurrency === 'USD' ? estimatedCredit * FX_RATE : estimatedCredit;
        const newWeight = Math.max(0, (currentAllocationValueCAD - estimatedCreditCAD) / totalPortfolioValueCAD);

        suggestions.push({
          symbol: signal.symbol,
          action: 'SELL',
          quantity: sellQty,
          price: currentPrice,
          accountType,
          tenantName: tenantConfig.tenantName,
          reason: signal.reason,
          currency: assetCurrency,
          estimatedCost: estimatedCredit,
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
