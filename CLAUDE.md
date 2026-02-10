# Portfolio Insights - Claude Documentation

## 🧹 Latest Changes
- **NEW**: Added Dashboard page with comprehensive portfolio metrics and technical alerts
- **NEW**: Added RSI and marketCap fields to Stock interface (placeholders for future data)
- Dashboard is now the default landing page

---

## 📋 Portfolio Insights Website Structure

### 🏗️ Main Application Architecture
```
App Component (Main Router)
├── Navigation Bar (6 tabs)
├── Main Content Area
└── Shared State Management
```

### 📱 6 Main Pages/Components

#### 1. **Dashboard** (`Dashboard`) - NEW
- **Purpose**: Overview dashboard with portfolio metrics and technical alerts
- **Location**: `app/components/Dashboard.tsx`
- **Features**:
  - **Portfolio Overview Cards**: Total Value, Invested, Gain/Loss, Today's P&L, Weekly, Monthly
  - **Portfolio Metrics**: Weighted avg P/E, Profit Growth, Sales Growth, vs 50/200 DMA, 52W High/Low, RSI, Market Cap
  - **Technical Alerts**: Stocks below 50/200 DMA, Death/Golden Cross, near 52W high/low, big daily moves
  - **Gain/Loss Distribution**: Visual bar chart of portfolio performance ranges
  - **Sector Performance**: Top 5 gaining and losing sectors by 1M return
  - **Performance Leaderboard**: Top/Bottom 5 performers by gain %
  - **Technical Status Table**: DMA positions, 52W positions for all stocks
- **Alert Categories**:
  - Critical: Death Cross, Below 200 DMA
  - High: Below 50 DMA, Near 52W Low, Big Daily Drop
  - Positive: Golden Cross, Above 50/200 DMA
  - Info: Near 52W High, Big Daily Gain

#### 2. **Portfolio Insights** (`PortfolioInsightsPage`)
- **Purpose**: Main portfolio analysis dashboard
- **Features**: 
  - Interactive data table with all portfolio holdings
  - **NEW**: Portfolio Contribution % column (YTD return × weightage)
  - Filtering, sorting, column visibility controls
  - Remarks and assignment management
  - Range filters for advanced analysis
- **Data Source**: Combined GridKey + Screener data
- **Table**: Single functional table (`filteredAndSortedData`)

#### 3. **Analysis** (`AnalysisPage`)
- **Purpose**: Visual portfolio analysis and charts
- **Features**:
  - **Allocation Chart**: Holdings by value (with Show More/Less for all stocks)
  - **Performance Chart**: Gain/loss distribution with All-time/1Y toggle
  - **Growth Chart**: Top performers by profit/sales growth
  - **Sector Chart**: Industry allocation breakdown
  - **Sector Rotation**: Industry performance analysis
  - **Portfolio Value Chart**: Historical value tracking with CSV download
- **Charts**: 6 different chart types with interactive controls

#### 4. **Trend & Momentum** (`TrendMomentumPage`)
- **Purpose**: Technical analysis dashboard
- **Features**: Performance heatmaps, trend indicators
- **Data**: Uses return periods (1D, 1W, 1M, 3M, 6M, 1Y)

#### 5. **Screener Data** (`UploadPage`)
- **Purpose**: Upload and process Screener.in CSV files
- **Features**: File validation, CSV parsing, data processing
- **Updates**: Stock prices, returns, fundamentals

#### 6. **GridKey Data** (`GridKeyPage`)
- **Purpose**: Upload GridKey CSV files for holdings data
- **Features**: Quantity and buy price processing
- **Updates**: Portfolio holdings, quantities, average buy prices

---

## 🔄 Data Flow Architecture

### Data Sources
1. **Screener.in CSV**: Stock prices, returns, P/E ratios, growth metrics
2. **GridKey CSV**: Holdings quantities, average buy prices
3. **API Storage**: Redis backend for persistence

### Data Processing Pipeline
```
Screener Upload → Parse CSV → Store in Redis → Load on App Start
GridKey Upload → Parse CSV → Store in Redis → Combine with Screener Data
Combined Data → Calculate Amounts → Calculate Weightages → Calculate Portfolio Contribution
```

### Key Calculations
- **Current Amount**: `quantity × current_price`
- **Weightage**: `(current_amount / total_portfolio_value) × 100`
- **Portfolio Contribution**: `ytd_return × weightage / 100` (with 1Y→6M→3M fallback)
- **All-time Gain**: `((current_price - avg_buy_price) / avg_buy_price) × 100`

---

## 🎯 Recent Enhancements Added

### 1. Portfolio Contribution Feature
- **What**: Shows how much each stock contributes to overall portfolio performance
- **Where**: New column in Portfolio Insights table
- **Calculation**: YTD return × weightage percentage
- **Fallback Logic**: 1Y return → 6M return → 3M return

### 2. Performance Chart Modes
- **All-time Mode**: Total returns since purchase
- **1Y Mode**: Market returns over 1 year period (with fallback logic)
- **Toggle Buttons**: Switch between the two views

### 3. Show More in Allocation
- **Default**: Top 10 holdings by value
- **Enhanced**: Button to show all stocks with their percentages
- **Dynamic Title**: Updates to show current view

### 4. CSV Download for Portfolio Value
- **Feature**: Download historical portfolio value data
- **Format**: Date, Portfolio Value, Timestamp
- **Location**: Portfolio Value chart header

---

## 🗂️ Component Structure
- **Total Components**: 6 main page components
- **Single Table**: Only 1 functional table (in PortfolioInsightsPage)
- **Clean Architecture**: No unused/dead code remaining
- **Modular Design**: Each page handles specific functionality

---

## 🔐 Authentication
- **Password**: `saguncapital321` (hardcoded in `/Users/adityaagarwal/Downloads/portfolio-insights/app/page.tsx:7`)
- **Storage**: Uses localStorage for persistence

---

## 🚀 Development Commands
- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Start**: `npm start`
- **Lint**: `npm run lint`

---

## 📁 Project Structure
```
portfolio-insights/
├── app/
│   ├── page.tsx              # Main application file
│   ├── globals.css           # Styling
│   ├── components/
│   │   └── Dashboard.tsx     # Dashboard component
│   └── api/                  # API endpoints
├── types.ts                  # TypeScript definitions
├── package.json              # Dependencies
└── CLAUDE.md                 # This documentation
```

---

*Documentation generated and maintained by Claude*