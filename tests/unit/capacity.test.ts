import test from 'node:test';
import assert from 'node:assert';
import { CapacityFilter } from '../../src/risk/capacity.js';
import { Account, StrategySignal, TenantConfig } from '../../src/types.js';

// Shared mock tenant config for capacity tests
const mockTenant: TenantConfig = {
  tenantName: 'TestUser',
  telegramChatId: 'test_chat_123',
  balancesCsvPath: './tests/fixtures/Balances.csv',
  positionsCsvPath: './tests/fixtures/Positions.csv',
  watchlist: ['VFV.TO', 'MSFT'],
  targetAllocations: {
    'VFV.TO': 0.40,
    'MSFT': 0.30,
    'XIU.TO': 0.30
  },
  risk: {
    maxPositionSizePercent: 0.50,
    minCashBufferPercent: 0.05,
    rebalanceDriftThreshold: 0.05
  }
};

test('Capacity & Risk Filter Suite (CAD/USD Isolation)', async (t) => {
  const filter = new CapacityFilter();

  await t.test('Routes US assets to RRSP and Canadian assets to TFSA', () => {
    const mockAccounts: Account[] = [
      {
        type: 'TFSA',
        accountId: 'tfsa123',
        cashCAD: 10000,
        cashUSD: 0,
        buyingPowerCAD: 10000,
        buyingPowerUSD: 0,
        positions: []
      },
      {
        type: 'RRSP',
        accountId: 'rrsp123',
        cashCAD: 0,
        cashUSD: 10000,
        buyingPowerCAD: 0,
        buyingPowerUSD: 10000,
        positions: []
      }
    ];

    const signals: StrategySignal[] = [
      {
        symbol: 'MSFT', // US Asset
        action: 'BUY',
        suggestedPrice: 400.00,
        reason: 'Technical oversold',
        currency: 'USD',
        estimatedCost: 0,
        timestamp: new Date()
      },
      {
        symbol: 'VFV.TO', // Canadian Asset
        action: 'BUY',
        suggestedPrice: 100.00,
        reason: 'Technical oversold',
        currency: 'CAD',
        estimatedCost: 0,
        timestamp: new Date()
      }
    ];

    const orders = filter.filterAndSize(signals, mockAccounts, mockTenant);

    assert.strictEqual(orders.length, 2);

    const msftOrder = orders.find(o => o.symbol === 'MSFT');
    const vfvOrder = orders.find(o => o.symbol === 'VFV.TO');

    assert.ok(msftOrder);
    assert.strictEqual(msftOrder.accountType, 'RRSP', 'US Ticker MSFT should route to RRSP');
    assert.strictEqual(msftOrder.currency, 'USD', 'Order should be marked USD');

    assert.ok(vfvOrder);
    assert.strictEqual(vfvOrder.accountType, 'TFSA', 'Canadian Ticker VFV.TO should route to TFSA');
    assert.strictEqual(vfvOrder.currency, 'CAD', 'Order should be marked CAD');
  });

  await t.test('Blocks cross-currency purchases (no forced FX conversion)', () => {
    const mockAccounts: Account[] = [
      {
        type: 'TFSA',
        accountId: 'tfsa123',
        cashCAD: 10000, // Lots of CAD
        cashUSD: 0,     // No USD
        buyingPowerCAD: 10000,
        buyingPowerUSD: 0,
        positions: []
      }
    ];

    const signals: StrategySignal[] = [
      {
        symbol: 'MSFT', // US Asset
        action: 'BUY',
        suggestedPrice: 400.00,
        reason: 'Rebalance top up',
        currency: 'USD',
        estimatedCost: 0,
        timestamp: new Date()
      }
    ];

    const orders = filter.filterAndSize(signals, mockAccounts, mockTenant);

    // Should reject because we have $0 cashUSD, even though we have $10k cashCAD.
    assert.strictEqual(orders.length, 0, 'Should prune buy suggestions if the target currency bucket lacks funds');
  });
});
