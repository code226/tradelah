import test from 'node:test';
import assert from 'node:assert';
import { CapacityFilter } from '../../src/risk/capacity.js';
import { Account, StrategySignal } from '../../src/types.js';

test('Capacity & Risk Filter Suite', async (t) => {
  const filter = new CapacityFilter();

  await t.test('Routes US assets to RRSP and Canadian assets to TFSA', () => {
    const mockAccounts: Account[] = [
      {
        type: 'TFSA',
        accountId: 'tfsa123',
        cash: 10000,
        buyingPower: 10000,
        positions: []
      },
      {
        type: 'RRSP',
        accountId: 'rrsp123',
        cash: 10000,
        buyingPower: 10000,
        positions: []
      }
    ];

    const signals: StrategySignal[] = [
      {
        symbol: 'MSFT', // US Asset
        action: 'BUY',
        suggestedPrice: 400.00,
        reason: 'Technical oversold',
        timestamp: new Date()
      },
      {
        symbol: 'VFV.TO', // Canadian Asset
        action: 'BUY',
        suggestedPrice: 100.00,
        reason: 'Technical oversold',
        timestamp: new Date()
      }
    ];

    const orders = filter.filterAndSize(signals, mockAccounts);

    assert.strictEqual(orders.length, 2);

    const msftOrder = orders.find(o => o.symbol === 'MSFT');
    const vfvOrder = orders.find(o => o.symbol === 'VFV.TO');

    assert.ok(msftOrder);
    assert.strictEqual(msftOrder.accountType, 'RRSP', 'US Ticker MSFT should route to RRSP');

    assert.ok(vfvOrder);
    assert.strictEqual(vfvOrder.accountType, 'TFSA', 'Canadian Ticker VFV.TO should route to TFSA');
  });

  await t.test('Respects cash buffer constraints', () => {
    const mockAccounts: Account[] = [
      {
        type: 'TFSA',
        accountId: 'tfsa123',
        cash: 100, // Very low cash
        buyingPower: 100,
        positions: []
      }
    ];

    const signals: StrategySignal[] = [
      {
        symbol: 'VFV.TO',
        action: 'BUY',
        suggestedPrice: 100.00,
        reason: 'Rebalance top up',
        timestamp: new Date()
      }
    ];

    const orders = filter.filterAndSize(signals, mockAccounts);

    // Cash buffer is 5% of total portfolio value.
    // Total value = $100. Cash buffer = $5. Available for trade = $95.
    // Ticker price is $100. We cannot purchase even 1 share.
    assert.strictEqual(orders.length, 0, 'Should prune buy suggestions if cash buffer is violated');
  });
});
