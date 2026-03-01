# Portfolio Insights - Claude Documentation

## 🧹 Latest Changes
- **NEW**: Email + Password authentication with allowlist (replaced hardcoded password)
- **NEW**: All API endpoints are now protected with JWT authentication
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

### System Overview
- **Type**: Email + Password with Allowlist
- **Sessions**: JWT tokens stored in httpOnly cookies
- **API Protection**: All endpoints require authentication

### Auth Flow
1. **Registration**: Only emails in `ALLOWED_EMAILS` env var can register
2. **Login**: Returns JWT access token (15 min) + refresh token (7 days)
3. **Session**: Stored in Redis with 7-day expiry
4. **Logout**: Clears cookies and Redis session

### Configuration
Edit `.env.local`:
```env
JWT_SECRET="your-secret-key"
ALLOWED_EMAILS="user1@company.com,user2@company.com"
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/auth.ts` | Password hashing (bcrypt), JWT utilities |
| `lib/authMiddleware.ts` | `withAuth()` wrapper for API protection |
| `pages/api/auth/register.ts` | Registration (allowlist check) |
| `pages/api/auth/login.ts` | Login, issues JWT cookies |
| `pages/api/auth/verify.ts` | Validates current session |
| `pages/api/auth/logout.ts` | Clears session |
| `pages/api/auth/refresh.ts` | Refreshes access token |
| `app/contexts/AuthContext.tsx` | React context for auth state |
| `app/components/LoginPage.tsx` | Login/Register UI |

### Redis Keys
- `auth:users:{email}` - User data (email, passwordHash, name, timestamps)
- `auth:sessions:{sessionId}` - Session data (7-day TTL)

### Security Features
- Passwords hashed with bcrypt (cost factor 12)
- JWT in httpOnly cookies (XSS protection)
- Short-lived access tokens (15 min)
- Session invalidation on logout
- Email allowlist for registration

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
│   ├── layout.tsx            # Root layout with AuthProvider
│   ├── providers.tsx         # Client-side providers wrapper
│   ├── globals.css           # Styling
│   ├── contexts/
│   │   └── AuthContext.tsx   # Authentication context
│   └── components/
│       ├── Dashboard.tsx     # Dashboard component
│       └── LoginPage.tsx     # Login/Register UI
├── pages/api/
│   ├── auth/                 # Auth endpoints (register, login, verify, logout, refresh)
│   ├── portfolio.ts          # Portfolio data (protected)
│   ├── gridkey.ts            # Holdings data (protected)
│   └── ...                   # Other protected endpoints
├── lib/
│   ├── redis.ts              # Redis connection
│   ├── auth.ts               # Auth utilities (JWT, bcrypt)
│   └── authMiddleware.ts     # withAuth() API wrapper
├── types/
│   └── auth.ts               # Auth TypeScript interfaces
├── types.ts                  # Main TypeScript definitions
├── package.json              # Dependencies
└── CLAUDE.md                 # This documentation
```

---

*Documentation generated and maintained by Claude*