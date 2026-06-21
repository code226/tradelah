import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { CsvImporter } from '../../src/integrations/csvImporter.js';
import { CapacityFilter } from '../../src/risk/capacity.js';
import { RebalancerStrategy } from '../../src/strategy/rebalancer.js';
import { TenantConfig } from '../../src/types.js';

// Helper to create a temporary CSV file for testing
function createTempCsv(filename: string, content: string): string {
  const dir = path.join(process.cwd(), 'data', 'test_fixtures');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// Helper to clean up test fixtures
function cleanupTempCsv(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

test('Multi-Tenant Integration Suite', async (t) => {
  const bal1 = `Account Number,Account Type,Cash in CAD,Cash in USD
111,Individual TFSA,10000.00,0.00`;
  const pos1 = `Equity Symbol,Account Number,Quantity,Cost Per Share,Market Value,Currency
VFV.TO,111,10,110.00,1100.00,CAD`;

  const bal2 = `Account Number,Account Type,Cash in CAD,Cash in USD
222,Individual TFSA,0.00,5000.00`;
  const pos2 = `Equity Symbol,Account Number,Quantity,Cost Per Share,Market Value,Currency
MSFT,222,50,400.00,20000.00,USD`;

  const bPath1 = createTempCsv('t1_bal.csv', bal1);
  const pPath1 = createTempCsv('t1_pos.csv', pos1);
  const bPath2 = createTempCsv('t2_bal.csv', bal2);
  const pPath2 = createTempCsv('t2_pos.csv', pos2);

  const tenant1: TenantConfig = {
    tenantName: 'TenantOne',
    telegramChatId: 'chat_1',
    balancesCsvPath: bPath1,
    positionsCsvPath: pPath1,
    watchlist: ['VFV.TO'],
    targetAllocations: { 'VFV.TO': 0.80 },
    risk: {
      maxPositionSizePercent: 0.80,
      minCashBufferPercent: 0.05,
      rebalanceDriftThreshold: 0.05
    }
  };

  const tenant2: TenantConfig = {
    tenantName: 'TenantTwo',
    telegramChatId: 'chat_2',
    balancesCsvPath: bPath2,
    positionsCsvPath: pPath2,
    watchlist: ['MSFT'],
    targetAllocations: { 'MSFT': 0.50 }, // Over-allocated (current is 20k / 25k = 80%)
    risk: {
      maxPositionSizePercent: 0.50,
      minCashBufferPercent: 0.05,
      rebalanceDriftThreshold: 0.05
    }
  };

  const rebalancer = new RebalancerStrategy();
  const capacityFilter = new CapacityFilter();

  try {
    await t.test('Evaluates and routes independent signals per tenant', () => {
      // Tenant 1
      const accounts1 = CsvImporter.import(tenant1.balancesCsvPath, tenant1.positionsCsvPath).accounts;
      const signals1 = rebalancer.evaluate(accounts1, tenant1);
      const orders1 = capacityFilter.filterAndSize(signals1, accounts1, tenant1);

      // Tenant 2
      const accounts2 = CsvImporter.import(tenant2.balancesCsvPath, tenant2.positionsCsvPath).accounts;
      const signals2 = rebalancer.evaluate(accounts2, tenant2);
      const orders2 = capacityFilter.filterAndSize(signals2, accounts2, tenant2);

      // Tenant 1 asserts (Expects BUY VFV)
      assert.strictEqual(orders1.length, 1);
      assert.strictEqual(orders1[0].tenantName, 'TenantOne');
      assert.strictEqual(orders1[0].action, 'BUY');
      assert.strictEqual(orders1[0].symbol, 'VFV.TO');

      // Tenant 2 asserts (Expects SELL MSFT due to overweight)
      assert.strictEqual(orders2.length, 1);
      assert.strictEqual(orders2[0].tenantName, 'TenantTwo');
      assert.strictEqual(orders2[0].action, 'SELL');
      assert.strictEqual(orders2[0].symbol, 'MSFT');
    });
  } finally {
    cleanupTempCsv(bPath1);
    cleanupTempCsv(pPath1);
    cleanupTempCsv(bPath2);
    cleanupTempCsv(pPath2);
  }
});
