import test from 'node:test';
import assert from 'node:assert';
import { LocalStore } from '../../src/db/index.js';
import { QuestradeClient } from '../../src/integrations/questrade.js';
import { MarketDataClient } from '../../src/integrations/marketData.js';
import { TechnicalStrategy } from '../../src/strategy/technicals.js';
import { RebalancerStrategy } from '../../src/strategy/rebalancer.js';
import { CapacityFilter } from '../../src/risk/capacity.js';

test('E2E Application Workflow Suite', async (t) => {
  LocalStore.init();

  // Reset portfolio state to guarantee test predictability
  const initialTFSAHoldingValue = 9200.00 + 4875.00; // VFV + XIU
  const initialRRSPHoldingValue = 8300.00 + 2670.00; // MSFT + AAPL
  
  const mockInitialAccounts = [
    {
      type: 'TFSA' as const,
      accountId: 'e2e_tfsa',
      cash: 10000.00,
      buyingPower: 10000.00,
      positions: [
        {
          symbol: 'VFV.TO',
          symbolId: 101,
          openQuantity: 50,
          averageEntryPrice: 110.00,
          currentPrice: 110.00,
          marketValue: 5500.00
        }
      ]
    },
    {
      type: 'RRSP' as const,
      accountId: 'e2e_rrsp',
      cash: 5000.00,
      buyingPower: 5000.00,
      positions: [
        {
          symbol: 'MSFT',
          symbolId: 201,
          openQuantity: 10,
          averageEntryPrice: 400.00,
          currentPrice: 400.00,
          marketValue: 4000.00
        }
      ]
    }
  ];

  LocalStore.write({ simulatedPortfolioState: mockInitialAccounts });

  const questrade = new QuestradeClient();
  const marketData = new MarketDataClient();
  const technicalStrategy = new TechnicalStrategy();
  const rebalancerStrategy = new RebalancerStrategy();
  const capacityFilter = new CapacityFilter();

  await t.test('Full loop rebalances portfolio and updates persistent data', async () => {
    // 1. Fetch current status
    const accounts = await questrade.getAccounts();
    const quotes = await marketData.getQuotes(['VFV.TO', 'MSFT']);

    // 2. Evaluate signals
    const technicalSignals = await technicalStrategy.evaluate(quotes);
    const rebalanceSignals = rebalancerStrategy.evaluate(accounts);
    const allSignals = [...technicalSignals, ...rebalanceSignals];

    // 3. Filter orders
    const approvedOrders = capacityFilter.filterAndSize(allSignals, accounts);
    
    // Assert that we have trade recommendations
    assert.ok(approvedOrders.length > 0, 'Rebalancer should have recommended trades due to underweight positions');

    // 4. Simulate executing the first trade
    const orderToExecute = approvedOrders[0];
    questrade.simulateTradeExecution(
      orderToExecute.accountType,
      orderToExecute.symbol,
      orderToExecute.action,
      orderToExecute.quantity,
      orderToExecute.price
    );

    // 5. Fetch updated accounts and assert the balance and holding updated
    const updatedAccounts = await questrade.getAccounts();
    const targetAccount = updatedAccounts.find(a => a.type === orderToExecute.accountType);
    
    assert.ok(targetAccount);
    if (orderToExecute.action === 'BUY') {
      const position = targetAccount.positions.find(p => p.symbol === orderToExecute.symbol);
      assert.ok(position, 'New position should exist in simulated holdings');
      assert.ok(position.openQuantity > 0, 'Position quantity should have increased');
    }
  });
});
