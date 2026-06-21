import { config, validateConfig, loadTenants } from './config/index.js';
import { LocalStore } from './db/index.js';
import { CsvImporter } from './integrations/csvImporter.js';
import { MarketDataClient } from './integrations/marketData.js';
import { TelegramNotifier } from './integrations/telegram.js';
import { TechnicalStrategy } from './strategy/technicals.js';
import { RebalancerStrategy } from './strategy/rebalancer.js';
import { CapacityFilter } from './risk/capacity.js';
import { StrategySignal, TenantConfig } from './types.js';

async function runTenantCycle(
  tenant: TenantConfig,
  marketData: MarketDataClient,
  notifier: TelegramNotifier,
  technicalStrategy: TechnicalStrategy,
  rebalancerStrategy: RebalancerStrategy,
  capacityFilter: CapacityFilter
) {
  console.log(`\n  👤 Processing tenant: ${tenant.tenantName}`);

  try {
    // 1. Import portfolio from CSV
    const { accounts, warnings, csvLastModified } = CsvImporter.import(tenant.balancesCsvPath, tenant.positionsCsvPath);
    
    warnings.forEach(w => console.log(`  ${w}`));
    console.log(`  📋 CSV last updated: ${csvLastModified.toLocaleString()}`);
    console.log(`  💼 Accounts: ${accounts.map(a => `${a.type} ($${(a.cashCAD + a.cashUSD + a.positions.reduce((sum, p) => sum + p.marketValue, 0)).toFixed(2)})`).join(', ')}`);

    // 2. Fetch Watchlist Price Quotes
    const quotes = await marketData.getQuotes(tenant.watchlist);
    console.log(`  📈 Prices: ${quotes.map(q => `${q.symbol}: $${q.price.toFixed(2)} (${q.changePercent > 0 ? '+' : ''}${q.changePercent}%)`).join(', ')}`);

    // 3. Generate Signals (pass tenant config for per-tenant thresholds)
    const technicalSignals = await technicalStrategy.evaluate(quotes);
    const rebalanceSignals = rebalancerStrategy.evaluate(accounts, tenant);
    
    const allSignals: StrategySignal[] = [...technicalSignals, ...rebalanceSignals];
    const activeSignals = allSignals.filter(s => s.action !== 'HOLD');

    if (activeSignals.length === 0) {
      console.log(`  ✅ No active signals for ${tenant.tenantName} this cycle.`);
      return;
    }

    console.log(`  🔔 ${activeSignals.length} signal(s) found. Filtering through capacity and risk limits...`);

    // 4. Capacity & Risk Filtering (pass tenant config for per-tenant limits)
    const approvedOrders = capacityFilter.filterAndSize(activeSignals, accounts, tenant);

    if (approvedOrders.length === 0) {
      console.log(`  ⚠️ Signals rejected due to capacity or risk limits.`);
      return;
    }

    // 5. Dispatch Notifications to this tenant's Telegram
    for (const order of approvedOrders) {
      await notifier.sendOrderAlert(order, tenant.telegramChatId);
    }
  } catch (error) {
    console.error(`  ❌ Error processing ${tenant.tenantName}: ${(error as Error).message}`);
  }
}

async function runCycle(
  tenants: TenantConfig[],
  marketData: MarketDataClient,
  notifier: TelegramNotifier,
  technicalStrategy: TechnicalStrategy,
  rebalancerStrategy: RebalancerStrategy,
  capacityFilter: CapacityFilter
) {
  console.log(`\n⏳ [${new Date().toLocaleTimeString()}] Running evaluation cycle for ${tenants.length} tenant(s)...`);

  for (const tenant of tenants) {
    await runTenantCycle(tenant, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);
  }

  console.log(`\n✅ Cycle complete.`);
}

async function main() {
  console.log('🚀 Starting Tradelah v0.2 — Personal Trade Advisor (Multi-Tenant CSV Mode)...');
  
  // Initialize Database
  LocalStore.init();

  // Validate global config
  validateConfig();

  // Load tenant configurations
  const tenants = loadTenants();
  console.log(`📋 Loaded ${tenants.length} tenant(s): ${tenants.map(t => t.tenantName).join(', ')}`);

  // Instantiate shared modules
  const marketData = new MarketDataClient();
  const notifier = new TelegramNotifier();
  const technicalStrategy = new TechnicalStrategy();
  const rebalancerStrategy = new RebalancerStrategy();
  const capacityFilter = new CapacityFilter();

  await notifier.sendSystemAlert('Tradelah v0.2 engine started in CSV + multi-tenant mode.');

  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    await runCycle(tenants, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);
    console.log('\n🏁 Single-run execution completed. Exiting.');
    process.exit(0);
  }

  // Periodic Loop
  const intervalMs = config.pollingIntervalSeconds * 1000;
  console.log(`🕒 Live monitoring active. Running every ${config.pollingIntervalSeconds}s. Press Ctrl+C to stop.`);

  // Run immediately on boot
  await runCycle(tenants, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);

  const timer = setInterval(async () => {
    await runCycle(tenants, marketData, notifier, technicalStrategy, rebalancerStrategy, capacityFilter);
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
