import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { LocalStore } from '../../src/db/index.js';
import { CsvImporter } from '../../src/integrations/csvImporter.js';
import { MarketDataClient } from '../../src/integrations/marketData.js';
import { TechnicalStrategy } from '../../src/strategy/technicals.js';
import { RebalancerStrategy } from '../../src/strategy/rebalancer.js';
import { CapacityFilter } from '../../src/risk/capacity.js';
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

test('E2E Application Workflow Suite (Dual-CSV + Multi-Tenant)', async (t) => {
  LocalStore.init();

  const balCsv = `Account Number,Account Type,Cash in CAD,Cash in USD
111,Individual TFSA,10000.00,0.00
222,Individual RRSP,0.00,5000.00`;

  const posCsv = `Equity Symbol,Account Number,Quantity,Cost Per Share,Market Value,Currency
VFV.TO,111,50,110.00,5500.00,CAD
MSFT,222,10,400.00,4000.00,USD`;

  const balPath = createTempCsv('e2e_bal.csv', balCsv);
  const posPath = createTempCsv('e2e_pos.csv', posCsv);

  const mockTenant: TenantConfig = {
    tenantName: 'E2EUser',
    telegramChatId: 'test_chat',
    balancesCsvPath: balPath,
    positionsCsvPath: posPath,
    watchlist: ['VFV.TO', 'MSFT'],
    targetAllocations: {
      'VFV.TO': 0.60, // Aggressively target VFV to force a BUY drift
      'MSFT': 0.20
    },
    risk: {
      maxPositionSizePercent: 0.80,
      minCashBufferPercent: 0.05,
      rebalanceDriftThreshold: 0.05
    }
  };

  const marketData = new MarketDataClient();
  const technicalStrategy = new TechnicalStrategy();
  const rebalancerStrategy = new RebalancerStrategy();
  const capacityFilter = new CapacityFilter();

  try {
    await t.test('Full loop imports dual-CSV, evaluates strategy, and filters orders strictly by currency', async () => {
      // 1. Fetch current status from CSV
      const { accounts } = CsvImporter.import(mockTenant.balancesCsvPath, mockTenant.positionsCsvPath);
      const quotes = await marketData.getQuotes(mockTenant.watchlist);

      // 2. Evaluate signals
      const technicalSignals = await technicalStrategy.evaluate(quotes);
      const rebalanceSignals = rebalancerStrategy.evaluate(accounts, mockTenant);
      const allSignals = [...technicalSignals, ...rebalanceSignals];

      // 3. Filter orders
      const approvedOrders = capacityFilter.filterAndSize(allSignals, accounts, mockTenant);
      
      // Assert that we have trade recommendations
      assert.ok(approvedOrders.length > 0, 'Rebalancer should have recommended trades due to underweight positions');

      // 4. Verify order properties and currency tracking
      const orderToExecute = approvedOrders[0];
      assert.strictEqual(orderToExecute.tenantName, 'E2EUser');
      assert.ok(orderToExecute.action === 'BUY' || orderToExecute.action === 'SELL');
      assert.ok(orderToExecute.quantity > 0);
      assert.ok(orderToExecute.estimatedCost > 0);
      assert.ok(orderToExecute.currency === 'CAD' || orderToExecute.currency === 'USD');
    });
  } finally {
    cleanupTempCsv(balPath);
    cleanupTempCsv(posPath);
  }
});
