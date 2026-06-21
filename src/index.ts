import { config, validateConfig } from './config/index.js';
import { LocalStore } from './db/index.js';
import { QuestradeClient } from './integrations/questrade.js';
import { MarketDataClient } from './integrations/marketData.js';
import { TelegramNotifier } from './integrations/telegram.js';
import { TechnicalStrategy } from './strategy/technicals.js';
import { RebalancerStrategy } from './strategy/rebalancer.js';
import { CapacityFilter } from './risk/capacity.js';
import { StrategySignal, OrderSuggestion } from './types.js';

async function runCycle(
  questrade: QuestradeClient,
  marketData: MarketDataClient,
  notifier: TelegramNotifier,
  technicalStrategy: TechnicalStrategy,
  rebalancerStrategy: RebalancerStrategy,
  capacityFilter: CapacityFilter
) {
  console.log(`\n⏳ [${new Date().toLocaleTimeString()}] Running evaluation cycle...`);

  try {
    // 1. Fetch Accounts (Balances & Positions)
    const accounts = await questrade.getAccounts();
    console.log(`💼 Loaded accounts: ${accounts.map(a => `${a.type} ($${(a.cash + a.positions.reduce((sum, p) => sum + p.marketValue, 0)).toFixed(2)})`).join(', ')}`);

    // 2. Fetch Watchlist Price Quotes
    const quotes = await marketData.getQuotes(config.watchlist);
    console.log(`📈 Watchlist prices: ${quotes.map(q => `${q.symbol}: $${q.price.toFixed(2)} (${q.changePercent > 0 ? '+' : ''}${q.changePercent}%)`).join(', ')}`);

    // 3. Generate Signals
    const technicalSignals = await technicalStrategy.evaluate(quotes);
    const rebalanceSignals = rebalancerStrategy.evaluate(accounts);
    
    // Combine signals
    const allSignals: StrategySignal[] = [...technicalSignals, ...rebalanceSignals];
    const activeSignals = allSignals.filter(s => s.action !== 'HOLD');

    if (activeSignals.length === 0) {
      console.log('✅ No active trade indicators detected this cycle.');
      return;
    }

    console.log(`🔔 Found ${activeSignals.length} strategy signal(s). Filtering through capacity and risk limits...`);

    // 4. Capacity & Risk Filtering
    const approvedOrders = capacityFilter.filterAndSize(activeSignals, accounts);

    if (approvedOrders.length === 0) {
      console.log('⚠️ Signal(s) generated but rejected due to buying power constraints or risk limits.');
      return;
    }

    // 5. Dispatch Notifications & Simulate Execution
    for (const order of approvedOrders) {
      const sent = await notifier.sendOrderAlert(order);

      if (sent && config.simulationMode) {
        console.log(`🔄 [PoC Simulation] Simulating execution of ${order.action} ${order.quantity} shares of ${order.symbol} in ${order.accountType}...`);
        questrade.simulateTradeExecution(
          order.accountType,
          order.symbol,
          order.action,
          order.quantity,
          order.price
        );
      }
    }
  } catch (error) {
    console.error(`❌ Cycle execution failed: ${(error as Error).message}`);
  }
}

async function main() {
  console.log('🚀 Starting Tradelah Personal Trade Advisor MVP PoC...');
  
  // Initialize Database
  LocalStore.init();

  // Validate inputs
  validateConfig();

  // Instantiate Modules
  const questrade = new QuestradeClient();
  const marketData = new MarketDataClient();
  const notifier = new TelegramNotifier();
  const technicalStrategy = new TechnicalStrategy();
  const rebalancerStrategy = new RebalancerStrategy();
  const capacityFilter = new CapacityFilter();

  await notifier.sendSystemAlert('Tradelah PoC engine has successfully started in simulation mode.');

  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    await runCycle(questrade, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);
    console.log('\n🏁 Single-run execution completed. Exiting.');
    process.exit(0);
  }

  // Periodic Loop (default 15 seconds for interactive PoC demonstration)
  const intervalMs = 15000;
  console.log(`🕒 Live monitoring active. Running evaluations every ${intervalMs / 1000} seconds. Press Ctrl+C to stop.`);

  // Run immediately on boot
  await runCycle(questrade, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);

  const timer = setInterval(async () => {
    await runCycle(questrade, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);
  }, intervalMs);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n🛑 Engine stopped. Goodbye!');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
