import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const storePath = path.join(dataDir, 'store.json');

interface StoreSchema {
  // Questrade OAuth tokens (dormant — retained for future API integration)
  questradeAccessToken: string;
  questradeRefreshToken: string;
  questradeApiServer: string;
  tokenExpiresAt: number;

  // Simulated price history for strategy engine testing
  simulatedPortfolioState?: any;
}

const defaultStore: StoreSchema = {
  questradeAccessToken: '',
  questradeRefreshToken: '',
  questradeApiServer: '',
  tokenExpiresAt: 0
};

export class LocalStore {
  static init() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify(defaultStore, null, 2), 'utf8');
    }
  }

  static read(): StoreSchema {
    this.init();
    try {
      const data = fs.readFileSync(storePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('⚠️ Store could not be read. Resetting to default.');
      return defaultStore;
    }
  }

  static write(data: Partial<StoreSchema>) {
    this.init();
    try {
      const current = this.read();
      const updated = { ...current, ...data };
      fs.writeFileSync(storePath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (error) {
      console.error(`❌ Failed to write to store.json: ${(error as Error).message}`);
    }
  }
}
