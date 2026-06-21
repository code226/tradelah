import { config } from '../config/index.js';
import { LocalStore } from '../db/index.js';
import { Account, Position, AccountType } from '../types.js';

export class QuestradeClient {
  private apiServer: string = '';
  private accessToken: string = '';

  constructor() {
    const store = LocalStore.read();
    this.apiServer = store.questradeApiServer || config.questradeApiUrl;
    this.accessToken = store.questradeAccessToken || '';
  }

  /**
   * Ensures we have a valid access token. Rotates refresh token if needed.
   */
  async authenticate(): Promise<boolean> {
    if (config.simulationMode) {
      console.log('🔑 [Questrade Mock] Authenticating... Token is valid.');
      const store = LocalStore.read();
      if (!store.questradeAccessToken) {
        console.log('🔄 [Questrade Mock] Initializing tokens in local storage...');
        LocalStore.write({
          questradeAccessToken: 'mock_access_token_abc123',
          questradeRefreshToken: 'mock_refresh_token_xyz789',
          questradeApiServer: 'https://api-mock.questrade.com',
          tokenExpiresAt: Date.now() + 3600 * 1000 // 1 hour from now
        });
      }
      return true;
    }

    // Real API integration logic
    const store = LocalStore.read();
    const tokenExpired = Date.now() >= store.tokenExpiresAt;

    if (!store.questradeAccessToken || tokenExpired) {
      console.log('🔄 [Questrade API] Access token expired or missing. Refreshing...');
      const refreshToken = store.questradeRefreshToken || config.questradeRefreshToken;
      if (!refreshToken) {
        throw new Error('No refresh token available. Manual authentication required.');
      }

      try {
        const tokenUrl = `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${refreshToken}`;
        const response = await fetch(tokenUrl);

        if (!response.ok) {
          throw new Error(`Token refresh failed with status ${response.status}`);
        }

        const data: any = await response.json();
        const expiresAt = Date.now() + data.expires_in * 1000;

        LocalStore.write({
          questradeAccessToken: data.access_token,
          questradeRefreshToken: data.refresh_token,
          questradeApiServer: data.api_server,
          tokenExpiresAt: expiresAt
        });

        this.apiServer = data.api_server;
        this.accessToken = data.access_token;
        console.log('✅ [Questrade API] Tokens refreshed and updated in store.json');
      } catch (error) {
        console.error(`❌ [Questrade API] Authentication failure: ${(error as Error).message}`);
        return false;
      }
    } else {
      this.accessToken = store.questradeAccessToken;
      this.apiServer = store.questradeApiServer;
    }

    return true;
  }

  /**
   * Fetches TFSA and RRSP account details, balances, and holdings.
   */
  async getAccounts(): Promise<Account[]> {
    await this.authenticate();

    if (config.simulationMode) {
      return this.getMockAccounts();
    }

    // Real API logic to fetch accounts, balances, and positions
    try {
      const headers = { Authorization: `Bearer ${this.accessToken}` };
      const accountsRes = await fetch(`${this.apiServer}v1/accounts`, { headers });
      if (!accountsRes.ok) throw new Error(`Failed to fetch accounts: ${accountsRes.statusText}`);
      
      const accountsData: any = await accountsRes.json();
      const accountsList: Account[] = [];

      for (const rawAcc of accountsData.accounts) {
        // We only care about TFSA and RRSP registered accounts for this app
        const type = rawAcc.type as AccountType;
        if (type !== 'TFSA' && type !== 'RRSP') continue;

        const accountId = rawAcc.number;

        // Fetch Balances
        const balancesRes = await fetch(`${this.apiServer}v1/accounts/${accountId}/balances`, { headers });
        const balancesData: any = balancesRes.ok ? await balancesRes.json() : {};
        // Combine CAD and USD cash for simplicity (expressed in CAD equivalent)
        const cashObj = balancesData.perCurrencyBalances?.find((b: any) => b.currency === 'CAD') || { cash: 0, buyingPower: 0 };
        const usdCashObj = balancesData.perCurrencyBalances?.find((b: any) => b.currency === 'USD') || { cash: 0, buyingPower: 0 };
        
        // Fetch Positions
        const positionsRes = await fetch(`${this.apiServer}v1/accounts/${accountId}/positions`, { headers });
        const positionsData: any = positionsRes.ok ? await positionsRes.json() : { positions: [] };

        const positions: Position[] = positionsData.positions.map((p: any) => ({
          symbol: p.symbol,
          symbolId: p.symbolId,
          openQuantity: p.openQuantity,
          averageEntryPrice: p.averageEntryPrice,
          currentPrice: p.currentPrice,
          marketValue: p.currentMarketValue
        }));

        accountsList.push({
          type,
          accountId,
          cash: cashObj.cash + (usdCashObj.cash * 1.36), // approximate USD to CAD exchange rate
          buyingPower: cashObj.buyingPower + (usdCashObj.buyingPower * 1.36),
          positions
        });
      }

      return accountsList;
    } catch (error) {
      console.error(`❌ [Questrade API] Error fetching accounts: ${(error as Error).message}`);
      console.log('⚠️ Falling back to mock portfolio due to connection failure.');
      return this.getMockAccounts();
    }
  }

  /**
   * Generates mock data for TFSA and RRSP portfolios.
   */
  private getMockAccounts(): Account[] {
    const store = LocalStore.read();
    
    // If we have saved simulated state in store.json, use it; otherwise create initial mock portfolio state
    if (store.simulatedPortfolioState) {
      return store.simulatedPortfolioState;
    }

    const mockPortfolio: Account[] = [
      {
        type: 'TFSA',
        accountId: '88776655',
        cashCAD: 12500.00,
        cashUSD: 0,
        buyingPowerCAD: 12500.00,
        buyingPowerUSD: 0,
        positions: [
          {
            symbol: 'VFV.TO',
            symbolId: 43211,
            openQuantity: 80,
            averageEntryPrice: 112.50,
            currentPrice: 115.00,
            marketValue: 9200.00,
            currency: 'CAD'
          },
          {
            symbol: 'XIU.TO',
            symbolId: 43212,
            openQuantity: 150,
            averageEntryPrice: 31.00,
            currentPrice: 32.50,
            marketValue: 4875.00,
            currency: 'CAD'
          }
        ]
      },
      {
        type: 'RRSP',
        accountId: '11223344',
        cashCAD: 0,
        cashUSD: 4200.00,
        buyingPowerCAD: 0,
        buyingPowerUSD: 4200.00,
        positions: [
          {
            symbol: 'MSFT',
            symbolId: 88991,
            openQuantity: 20,
            averageEntryPrice: 395.00,
            currentPrice: 415.00,
            marketValue: 8300.00,
            currency: 'USD'
          },
          {
            symbol: 'AAPL',
            symbolId: 88992,
            openQuantity: 15,
            averageEntryPrice: 172.00,
            currentPrice: 178.00,
            marketValue: 2670.00,
            currency: 'USD'
          }
        ]
      }
    ];

    LocalStore.write({ simulatedPortfolioState: mockPortfolio });
    return mockPortfolio;
  }

  /**
   * Update the local mock database state to simulate trades executing.
   */
  simulateTradeExecution(accountType: AccountType, symbol: string, action: 'BUY' | 'SELL', quantity: number, price: number) {
    const accounts = this.getMockAccounts();
    const targetAccount = accounts.find(a => a.type === accountType);
    if (!targetAccount) return;

    const isUSD = !symbol.endsWith('.TO');
    const estimatedCost = quantity * price;

    if (action === 'BUY') {
      if (isUSD) {
        targetAccount.cashUSD -= estimatedCost;
        targetAccount.buyingPowerUSD -= estimatedCost;
      } else {
        targetAccount.cashCAD -= estimatedCost;
        targetAccount.buyingPowerCAD -= estimatedCost;
      }

      const existingPos = targetAccount.positions.find(p => p.symbol === symbol);
      if (existingPos) {
        const currentCostBase = existingPos.openQuantity * existingPos.averageEntryPrice;
        existingPos.openQuantity += quantity;
        existingPos.averageEntryPrice = (currentCostBase + estimatedCost) / existingPos.openQuantity;
        existingPos.currentPrice = price;
        existingPos.marketValue = existingPos.openQuantity * price;
      } else {
        targetAccount.positions.push({
          symbol,
          symbolId: Math.floor(Math.random() * 90000) + 10000,
          openQuantity: quantity,
          averageEntryPrice: price,
          currentPrice: price,
          marketValue: estimatedCost,
          currency: isUSD ? 'USD' : 'CAD'
        });
      }
    } else {
      // SELL
      if (isUSD) {
        targetAccount.cashUSD += estimatedCost;
        targetAccount.buyingPowerUSD += estimatedCost;
      } else {
        targetAccount.cashCAD += estimatedCost;
        targetAccount.buyingPowerCAD += estimatedCost;
      }

      const existingPosIndex = targetAccount.positions.findIndex(p => p.symbol === symbol);
      if (existingPosIndex !== -1) {
        const existingPos = targetAccount.positions[existingPosIndex];
        if (existingPos.openQuantity <= quantity) {
          targetAccount.positions.splice(existingPosIndex, 1);
        } else {
          existingPos.openQuantity -= quantity;
          existingPos.currentPrice = price;
          existingPos.marketValue = existingPos.openQuantity * price;
        }
      }
    }

    LocalStore.write({ simulatedPortfolioState: accounts });
  }
}
