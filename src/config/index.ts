import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AppConfig, TenantConfig } from '../types.js';

// Load environment variables from .env
dotenv.config();

const configPath = path.join(process.cwd(), 'config.json');

let rawConfig: any = {};
try {
  const content = fs.readFileSync(configPath, 'utf8');
  rawConfig = JSON.parse(content);
} catch (error) {
  console.error(`⚠️ Failed to load config.json: ${(error as Error).message}. Using default parameters.`);
  rawConfig = {
    pollingIntervalSeconds: 900,
    marketHoursOnly: true
  };
}

export const config: AppConfig = {
  // Questrade API (dormant — retained for future iterations)
  questradeApiUrl: process.env.QUESTRADE_API_URL || 'https://api01.questrade.com',
  questradeRefreshToken: process.env.QUESTRADE_REFRESH_TOKEN || '',

  // Telegram (shared bot token)
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // Runtime
  simulationMode: process.env.SIMULATION_MODE === 'true',
  pollingIntervalSeconds: rawConfig.pollingIntervalSeconds ?? 900,
  marketHoursOnly: rawConfig.marketHoursOnly ?? true
};

/**
 * Validates global configuration.
 */
export function validateConfig() {
  const errors: string[] = [];

  if (!config.simulationMode && !config.telegramBotToken) {
    errors.push('TELEGRAM_BOT_TOKEN is missing in .env (required when SIMULATION_MODE is false).');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
}

/**
 * Scans the tenants/ directory and loads each tenant's config.json.
 * Each subdirectory under tenants/ is treated as a tenant.
 */
export function loadTenants(): TenantConfig[] {
  const tenantsDir = path.join(process.cwd(), 'tenants');
  const tenants: TenantConfig[] = [];

  if (!fs.existsSync(tenantsDir)) {
    console.error(`❌ Tenants directory not found: ${tenantsDir}`);
    console.error('   Create tenants/<name>/config.json and tenants/<name>/portfolio.csv for each user.');
    process.exit(1);
  }

  const entries = fs.readdirSync(tenantsDir, { withFileTypes: true });
  const tenantDirs = entries.filter(e => e.isDirectory());

  if (tenantDirs.length === 0) {
    console.error('❌ No tenant directories found under tenants/.');
    process.exit(1);
  }

  for (const dir of tenantDirs) {
    const tenantConfigPath = path.join(tenantsDir, dir.name, 'config.json');

    if (!fs.existsSync(tenantConfigPath)) {
      console.warn(`⚠️ Skipping tenant "${dir.name}": no config.json found.`);
      continue;
    }

    try {
      const content = fs.readFileSync(tenantConfigPath, 'utf8');
      const raw = JSON.parse(content);

      // Validate required fields
      const errors: string[] = [];
      if (!raw.tenantName) errors.push('tenantName is required');
      if (!raw.telegramChatId) errors.push('telegramChatId is required');
      if (!raw.balancesCsvPath) errors.push('balancesCsvPath is required');
      if (!raw.positionsCsvPath) errors.push('positionsCsvPath is required');
      if (!raw.watchlist || !Array.isArray(raw.watchlist)) errors.push('watchlist must be an array');
      if (!raw.targetAllocations || typeof raw.targetAllocations !== 'object') errors.push('targetAllocations is required');

      if (errors.length > 0) {
        console.error(`❌ Invalid config for tenant "${dir.name}":`);
        errors.forEach(err => console.error(`  - ${err}`));
        continue;
      }

      // Validate allocations sum
      const totalAllocation = Object.values(raw.targetAllocations as Record<string, number>).reduce((a, b) => a + b, 0);
      if (totalAllocation > 1.001) {
        console.warn(`⚠️ Tenant "${raw.tenantName}": target allocations sum to ${(totalAllocation * 100).toFixed(1)}% (exceeds 100%). Proceeding anyway.`);
      }

      const tenantConfig: TenantConfig = {
        tenantName: raw.tenantName,
        telegramChatId: raw.telegramChatId,
        balancesCsvPath: raw.balancesCsvPath,
        positionsCsvPath: raw.positionsCsvPath,
        watchlist: raw.watchlist,
        targetAllocations: raw.targetAllocations,
        risk: {
          maxPositionSizePercent: raw.risk?.maxPositionSizePercent ?? 0.5,
          minCashBufferPercent: raw.risk?.minCashBufferPercent ?? 0.05,
          rebalanceDriftThreshold: raw.risk?.rebalanceDriftThreshold ?? 0.05
        }
      };

      tenants.push(tenantConfig);
      console.log(`👤 Loaded tenant: ${tenantConfig.tenantName}`);
    } catch (error) {
      console.error(`❌ Failed to parse config for tenant "${dir.name}": ${(error as Error).message}`);
    }
  }

  if (tenants.length === 0) {
    console.error('❌ No valid tenant configurations loaded. Exiting.');
    process.exit(1);
  }

  return tenants;
}
