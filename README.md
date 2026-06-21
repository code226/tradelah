# Tradelah 📈

Tradelah is a multi-tenant personal trading and rebalancing advisor designed to monitor portfolios offline via dual CSV exports (`Balances.csv` and `Positions.csv`). It assesses current holdings and native currency cash capacities, evaluates technical and allocation indicators, filters trade signals through strict risk controls, and pushes alerts directly to your messaging application (Telegram) before market opportunities slip by.

---

## ✨ Features

*   **Multi-Tenant CSV Import Pipeline**: Supports evaluating multiple independent portfolios via local CSV exports (`Balances.csv` and `Positions.csv`). *(Note: The direct Questrade API integration has been preserved and made dormant for future use)*.
*   **CAD/USD Strict Separation**: Accounts are strictly siloed into native `CAD` and `USD` currency buckets. Tradelah guarantees no cross-currency purchases (e.g. attempting to buy USD equities with CAD cash) to prevent unexpected FX conversion costs. 
*   **Dual Strategy Engine**:
    *   **Technicals**: Dynamic Relative Strength Index (RSI) analysis tracking asset trends over a rolling window.
    *   **Drift Rebalancer**: Aggregates total holdings value across accounts (normalizing USD values to CAD for weight calculation) to calculate weight drifts against your custom allocation targets.
*   **Tax-Optimized Asset Routing**: Smart trade routing logic:
    *   US assets (e.g., `MSFT`, `AAPL`) are routed to the **RRSP** to avoid foreign dividend withholding taxes.
    *   Canadian trackers/ETFs (e.g., `VFV.TO`, `XIU.TO`) are routed to the **TFSA** to maximize tax-free growth.
*   **Capacity & Risk compliance**:
    *   Sizes purchases automatically based on actual account buying power in the native currency.
    *   Locks in a safety **cash buffer** (e.g., 5%) to prevent margin violations or overdrawing.
    *   Caps trade sizes so single positions do not violate maximum weight rules.
*   **Flexible Notifications**: Pushes rich, markdown-formatted trade alerts to a **Telegram Bot** per tenant, distinctly suffixing estimated costs and targets with the local currency.

---

## 🏛️ Architecture Design

Tradelah follows a clean pipeline architecture executed on a periodic loop:

1. **Ingestion Layer (`integrations/csvImporter.ts`)**: 
   A two-pass parser reads `Balances.csv` to establish account cash bases in CAD/USD, and then maps `Positions.csv` holdings into those respective accounts.
2. **Market Data Layer (`integrations/marketData.ts`)**: 
   Fetches the latest live market quotes for the tenant's watchlist tickers to ensure drift and technical evaluations are real-time.
3. **Strategy Engine (`strategy/`)**:
   - `RebalancerStrategy`: Converts USD values to CAD via a fixed FX multiplier temporarily to calculate aggregate portfolio weights, detecting any percentage drifts outside acceptable limits.
   - `TechnicalStrategy`: Uses historical mock pricing to determine if an asset is technically oversold.
4. **Risk & Sizing Filter (`risk/capacity.ts`)**:
   The engine attempts to fulfill "BUY/SELL" signals by verifying if the preferred tax-advantaged account (RRSP for USD, TFSA for CAD) has the raw purchasing power in the exact native currency bucket, factoring in cash buffers and maximum exposure rules.
5. **Notification Layer (`integrations/telegram.ts`)**:
   Format the approved and sized order suggestions and dispatch them via the Telegram Bot API to the tenant's specific Chat ID.

---

## 📁 Repository Structure

```text
tradelah/
├── data/                   # Git-ignored local DB file & cached tokens
├── docs/                   # Walkthroughs and Specs
├── tenants/                # Multi-tenant directories containing CSVs and config.json
│   ├── bernard/
│   └── spouse/
├── src/
│   ├── config/             # Config loader, environment variables, validation
│   ├── db/                 # Local JSON file store manager (persistence)
│   ├── integrations/       # API clients (CsvImporter, Market quotes, Telegram, Questrade [Dormant])
│   ├── risk/               # Sizing, capacity, and tax routing compliance filter
│   ├── strategy/           # Strategy signals (RSI technicals & rebalancer drift)
│   ├── index.ts            # Entrypoint orchestration script
│   └── types.ts            # Project-wide typings
├── .env.example            # Environment variables template
├── tsconfig.json           # TypeScript configuration
└── package.json            # Node project configuration
```

---

## 🚀 Getting Started

### 📋 Prerequisites
*   **Node.js**: `v18+` (v22.14.0 recommended, utilizes native fetch)
*   **Telegram Bot Token & Chat ID**: Required to push alerts to your phone.

### ⚙️ Installation & Configuration

1.  **Clone this repository and install packages**:
    ```bash
    npm install
    ```

2.  **Setup your environment variables**:
    Copy the sample configuration file and add your secret credentials:
    ```bash
    cp .env.example .env
    ```
    *Keep `SIMULATION_MODE=true` to safely run local mock simulations.*

3.  **Define your tenant portfolio profiles**:
    Each tenant requires a directory inside `tenants/` containing their `Balances.csv` and `Positions.csv` exports from Questrade, and a `config.json`:
    
    `tenants/bernard/config.json`:
    ```json
    {
      "tenantName": "Bernard",
      "telegramChatId": "123456789",
      "balancesCsvPath": "./tenants/bernard/Balances.csv",
      "positionsCsvPath": "./tenants/bernard/Positions.csv",
      "watchlist": ["VFV.TO", "XIU.TO", "MSFT", "AAPL"],
      "targetAllocations": {
        "VFV.TO": 0.40,
        "XIU.TO": 0.20,
        "MSFT": 0.20,
        "AAPL": 0.20
      },
      "risk": {
        "maxPositionSizePercent": 0.50,
        "minCashBufferPercent": 0.05,
        "rebalanceDriftThreshold": 0.05
      }
    }
    ```

---

## 🛠️ CLI Commands

*   **Build the application**:
    ```bash
    npm run build
    ```

*   **Execute the automated tests** (Runs unit, integration, and E2E checks via native test runner):
    ```bash
    npm test
    ```

*   **Execute a single evaluation cycle (Diagnostic run)**:
    ```bash
    npm run dev -- --once
    ```

*   **Start the continuous advisor loop**:
    ```bash
    npm run dev
    ```
