import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { CsvImporter } from '../../src/integrations/csvImporter.js';

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

test('Dual-CSV Importer Suite', async (t) => {
  const balancesCsv = `Account Number,Account Type,Cash in CAD,Cash in USD
111,Individual TFSA,12500.00,0.00
222,Individual RRSP,1000.00,4200.00`;

  const positionsCsv = `Equity Symbol,Account Number,Quantity,Cost Per Share,Market Value,Currency
VFV.TO,111,80,112.50,9200.00,CAD
XIU.TO,111,150,31.00,4875.00,CAD
MSFT,222,20,395.00,8300.00,USD
AAPL,222,15,172.00,2670.00,USD`;

  await t.test('Parses valid dual Balances.csv and Positions.csv exports', () => {
    const balPath = createTempCsv('valid_bal.csv', balancesCsv);
    const posPath = createTempCsv('valid_pos.csv', positionsCsv);

    try {
      const result = CsvImporter.import(balPath, posPath);

      assert.strictEqual(result.accounts.length, 2, 'Should detect TFSA and RRSP accounts');

      const tfsa = result.accounts.find(a => a.type === 'TFSA');
      const rrsp = result.accounts.find(a => a.type === 'RRSP');

      assert.ok(tfsa, 'TFSA account should exist');
      assert.strictEqual(tfsa.positions.length, 2, 'TFSA should have 2 positions (VFV.TO, XIU.TO)');
      assert.strictEqual(tfsa.cashCAD, 12500, 'TFSA CAD cash should be $12,500');
      assert.strictEqual(tfsa.cashUSD, 0, 'TFSA USD cash should be $0');

      assert.ok(rrsp, 'RRSP account should exist');
      assert.strictEqual(rrsp.positions.length, 2, 'RRSP should have 2 positions (MSFT, AAPL)');
      assert.strictEqual(rrsp.cashCAD, 1000, 'RRSP CAD cash should be $1,000');
      assert.strictEqual(rrsp.cashUSD, 4200, 'RRSP USD cash should be $4,200');

      // Verify position details and currency mapping
      const msft = rrsp.positions.find(p => p.symbol === 'MSFT');
      assert.ok(msft);
      assert.strictEqual(msft.openQuantity, 20);
      assert.strictEqual(msft.averageEntryPrice, 395.00);
      assert.strictEqual(msft.marketValue, 8300);
      assert.strictEqual(msft.currency, 'USD');
    } finally {
      cleanupTempCsv(balPath);
      cleanupTempCsv(posPath);
    }
  });

  await t.test('Throws on file not found', () => {
    assert.throws(
      () => CsvImporter.import('/nonexistent/path/bal.csv', '/nonexistent/path/pos.csv'),
      /not found/i,
      'Should throw when CSV file does not exist'
    );
  });
});
