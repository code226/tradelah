import fs from 'fs';
import { Account, AccountType, Position } from '../types.js';

export interface CsvParseResult {
  accounts: Account[];
  warnings: string[];
  csvLastModified: Date;
}

export class CsvImporter {
  /**
   * Imports and merges Questrade Balances.csv and Positions.csv
   * @param balancesPath Path to the Balances.csv export
   * @param positionsPath Path to the Positions.csv export
   */
  static import(balancesPath: string, positionsPath: string): CsvParseResult {
    const warnings: string[] = [];

    // Check files
    this.checkStaleness(balancesPath, warnings);
    this.checkStaleness(positionsPath, warnings);

    const balancesCsv = fs.readFileSync(balancesPath, 'utf8');
    const positionsCsv = fs.readFileSync(positionsPath, 'utf8');

    // 1. Parse Balances (Creates the Account objects with Cash)
    const accountsMap = this.parseBalances(balancesCsv, warnings);

    // 2. Parse Positions (Attaches holdings to the mapped accounts)
    this.parsePositions(positionsCsv, accountsMap, warnings);

    const accounts = Array.from(accountsMap.values());
    if (accounts.length === 0) {
      throw new Error(`[CsvImporter] Failed to parse any valid accounts from ${balancesPath}`);
    }

    const lastModB = fs.statSync(balancesPath).mtime;
    const lastModP = fs.statSync(positionsPath).mtime;
    const csvLastModified = lastModB > lastModP ? lastModB : lastModP;

    return { accounts, warnings, csvLastModified };
  }

  private static parseBalances(csv: string, warnings: string[]): Map<string, Account> {
    const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      throw new Error('[CsvImporter] Balances CSV is empty or contains only headers.');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const accNumIdx = headers.findIndex(h => h === 'account number');
    const accTypeIdx = headers.findIndex(h => h === 'account type');
    const cashCadIdx = headers.findIndex(h => h === 'cash in cad' || h === 'cash in cad combined');
    const cashUsdIdx = headers.findIndex(h => h === 'cash in usd');

    if (accNumIdx === -1 || accTypeIdx === -1) {
      throw new Error('[CsvImporter] Balances CSV missing required columns (Account Number, Account Type).');
    }

    const accountsMap = new Map<string, Account>();

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      if (cols.length < headers.length) continue;

      const accNum = cols[accNumIdx];
      const rawType = cols[accTypeIdx];
      
      let type: AccountType = 'MARGIN';
      if (rawType.toUpperCase().includes('TFSA')) type = 'TFSA';
      else if (rawType.toUpperCase().includes('RRSP')) type = 'RRSP';

      const cashCAD = cashCadIdx !== -1 ? this.parseNumber(cols[cashCadIdx]) : 0;
      const cashUSD = cashUsdIdx !== -1 ? this.parseNumber(cols[cashUsdIdx]) : 0;

      accountsMap.set(accNum, {
        type,
        accountId: accNum,
        cashCAD,
        cashUSD,
        buyingPowerCAD: cashCAD,
        buyingPowerUSD: cashUSD,
        positions: []
      });
    }

    return accountsMap;
  }

  private static parsePositions(csv: string, accountsMap: Map<string, Account>, warnings: string[]): void {
    const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return; // No positions is valid, just cash

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const symbolIdx = headers.findIndex(h => h === 'equity symbol' || h === 'symbol');
    const accNumIdx = headers.findIndex(h => h === 'account number');
    const qtyIdx = headers.findIndex(h => h === 'quantity');
    const costIdx = headers.findIndex(h => h === 'cost per share' || h === 'average cost');
    const mktValIdx = headers.findIndex(h => h === 'market value');
    const currencyIdx = headers.findIndex(h => h === 'currency');

    if (symbolIdx === -1 || accNumIdx === -1 || qtyIdx === -1 || costIdx === -1 || mktValIdx === -1) {
      throw new Error('[CsvImporter] Positions CSV missing required columns.');
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      if (cols.length < headers.length) continue;

      const accNum = cols[accNumIdx];
      const symbol = cols[symbolIdx];
      const qty = this.parseNumber(cols[qtyIdx]);

      // Skip invalid or 0 qty lines
      if (qty <= 0) {
        if (qty < 0) warnings.push(`Skipped negative quantity for ${symbol} in account ${accNum}`);
        continue;
      }

      const account = accountsMap.get(accNum);
      if (!account) {
        warnings.push(`Skipped position ${symbol} for unknown account number ${accNum}`);
        continue;
      }

      const mktVal = this.parseNumber(cols[mktValIdx]);
      const avgCost = this.parseNumber(cols[costIdx]);
      let currentPrice = mktVal / qty;

      let currency: 'CAD' | 'USD' = 'CAD';
      if (currencyIdx !== -1) {
        const rawCurr = cols[currencyIdx].toUpperCase();
        if (rawCurr === 'USD') currency = 'USD';
      } else {
         // Fallback inference if column is missing
         if (!symbol.endsWith('.TO') && !symbol.endsWith('.V')) currency = 'USD';
      }

      account.positions.push({
        symbol,
        symbolId: symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0), // Mock ID
        openQuantity: qty,
        averageEntryPrice: avgCost,
        currentPrice: currentPrice,
        marketValue: mktVal,
        currency
      });
    }
  }

  private static parseNumber(val: string): number {
    const clean = val.replace(/[\$,]/g, '').trim();
    return Number(clean) || 0;
  }

  private static checkStaleness(filePath: string, warnings: string[]) {
    try {
      const stats = fs.statSync(filePath);
      const mtime = stats.mtime;
      const now = new Date();
      const diffHours = (now.getTime() - mtime.getTime()) / (1000 * 60 * 60);

      if (diffHours > 24) {
        warnings.push(`Data Stale: ${filePath} is more than 24 hours old. Please export a fresh copy from Questrade.`);
      }
    } catch (e) {
      throw new Error(`[CsvImporter] File not found: ${filePath}`);
    }
  }

  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
}
