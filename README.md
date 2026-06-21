# Tradelah 📈

Tradelah is a personal trading and rebalancing advisor daemon designed to monitor registered Questrade portfolios (**TFSA** and **RRSP**). It assesses current holdings and cash capacity, evaluates technical and allocation indicators, filters trade signals through strict risk controls, and pushes alerts directly to your messaging application before market opportunities slip by.

---

## ✨ Features

*   **Questrade Integration**: Full API support for polling registered accounts (TFSA & RRSP), fetching CAD/USD cash balances, active positions, and handling secure, automatic OAuth2 token rotation.
*   **Dual Strategy Engine**:
    *   **Technicals**: Dynamic Relative Strength Index (RSI) analysis tracking asset trends over a rolling window.
    *   **Drift Rebalancer**: Aggregates total holdings value across accounts to calculate weight drifts against your custom allocation targets.
*   **Tax-Optimized Asset Routing**: Smart trade routing logic:
    *   US assets (e.g., `MSFT`, `AAPL`) are routed to the **RRSP** to avoid foreign dividend withholding taxes.
    *   Canadian trackers/ETFs (e.g., `VFV.TO`, `XIU.TO`) are routed to the **TFSA** to maximize tax-free growth.
*   **Capacity & Risk compliance**:
    *   Sizes purchases automatically based on actual account buying power.
    *   Locks in a safety **cash buffer** (e.g., 5%) to prevent margin violations or overdrawing.
    *   Caps trade sizes so single positions do not violate maximum weight rules.
*   **Flexible Notifications**: Pushes rich, markdown-formatted trade alerts to a **Telegram Bot** (or beautiful box-framed notification logs to the console in simulation mode).

---

## 📁 Repository Structure

```text
tradelah/
├── data/                   # Git-ignored local DB file & cached tokens (data/store.json)
├── docs/
│   └── specs/
│       └── prd-mvp.md      # Product Requirements Document (PRD)
├── src/
│   ├── config/             # Config loader, environment variables, validation
│   ├── db/                 # Local JSON file store manager (persistence)
│   ├── integrations/       # API clients (Questrade, Market quotes, Telegram)
│   ├── risk/               # Sizing, capacity, and tax routing compliance filter
│   ├── strategy/           # Strategy signals (RSI technicals & rebalancer drift)
│   ├── index.ts            # Entrypoint orchestration script
│   └── types.ts            # Project-wide typings
├── .env.example            # Environment variables template
├── config.json             # Asset allocations and watchlist configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Node project configuration
```

---

## 🚀 Getting Started

### 📋 Prerequisites
*   **Node.js**: `v18+` (v22.14.0 recommended, utilizes native fetch)
*   **Questrade API Developer Key**: Required for live account data fetching.
*   **Telegram Bot Token & Chat ID**: Required if you want to push alerts to your phone.

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
    *Open `.env` and fill in your keys. Keep `SIMULATION_MODE=true` to safely run local mock simulations first.*

3.  **Define your target portfolio weights in `config.json`**:
    Add your target assets (make sure target allocations sum to $\le 100\%$):
    ```json
    {
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

*   **Start the continuous advisor loop** (Runs active evaluation cycles and auto-executes simulated trades in mock mode):
    ```bash
    npm run dev
    ```
