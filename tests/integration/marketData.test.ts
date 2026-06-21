import test from 'node:test';
import assert from 'node:assert';
import { MarketDataClient } from '../../src/integrations/marketData.js';
import { LocalStore } from '../../src/db/index.js';

test('Market Data & DB Storage Integration Suite', async (t) => {
  // Initialize storage
  LocalStore.init();
  const client = new MarketDataClient();

  await t.test('Fetches price quotes and saves history logs to store.json', async () => {
    const testSymbols = ['VFV.TO', 'MSFT'];
    
    // Trigger quote fetch
    const quotes = await client.getQuotes(testSymbols);
    assert.strictEqual(quotes.length, 2);
    
    // Verify results
    const vfv = quotes.find(q => q.symbol === 'VFV.TO');
    assert.ok(vfv);
    assert.ok(vfv.price > 0);
    assert.ok(vfv.timestamp instanceof Date);

    // Read local storage to verify write integration occurred
    const store = LocalStore.read();
    const history = (store as any).simulatedPriceHistory;
    
    assert.ok(history, 'Database store should contain the simulatedPriceHistory registry');
    assert.ok(history['VFV.TO'], 'History should contain VFV.TO quote');
    assert.ok(history['MSFT'], 'History should contain MSFT quote');
  });
});
