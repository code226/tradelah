import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { AppConfig } from '../types.js';

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
    watchlist: [],
    targetAllocations: {},
    risk: {
      maxPositionSizePercent: 0.5,
      minCashBufferPercent: 0.05,
      rebalanceDriftThreshold: 0.05
    }
  };
}

export const config: AppConfig = {
  questradeApiUrl: process.env.QUESTRADE_API_URL || 'https://api01.questrade.com',
  questradeRefreshToken: process.env.QUESTRADE_REFRESH_TOKEN || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  simulationMode: process.env.SIMULATION_MODE === 'true',
  watchlist: rawConfig.watchlist || [],
  targetAllocations: rawConfig.targetAllocations || {},
  risk: {
    maxPositionSizePercent: rawConfig.risk?.maxPositionSizePercent ?? 0.5,
    minCashBufferPercent: rawConfig.risk?.minCashBufferPercent ?? 0.05,
    rebalanceDriftThreshold: rawConfig.risk?.rebalanceDriftThreshold ?? 0.05
  }
};

export function validateConfig() {
  const errors: string[] = [];

  if (!config.simulationMode) {
    if (!config.questradeRefreshToken) {
      errors.push('QUESTRADE_REFRESH_TOKEN is missing in .env (required when SIMULATION_MODE is false)');
    }
  }

  // Validate allocations sum to <= 1.0 (100%)
  const totalAllocation = Object.values(config.targetAllocations).reduce((a, b) => a + b, 0);
  if (totalAllocation > 1.001) {
    errors.push(`Target allocations sum up to ${(totalAllocation * 100).toFixed(1)}%, which exceeds 100%.`);
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
}
