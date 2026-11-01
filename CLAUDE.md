# Portfolio Insights - Claude Documentation

## 🧹 Latest Changes
- **NEW**: Nothing firm-specific is hardcoded. Firm Settings (public: name, short name, logo, app icon, benchmark) and Operations Settings (admin-only, `/api/settings/operations`: F&O portfolio name, analyst visibility threshold) live in `app_settings` via `lib/firmSettings.ts`. Logo and app icon are stored as data URLs; `app/firm-icon/route.ts` renders the icon (`lib/appIcon.tsx`), linked with a version from `appIconUrl()` so favicon caches refresh. Old migrations still seed Sagun values — leave them as-is.
- **NEW**: Stop-loss and price alerts (push, via the 10-min `/api/cron/alerts` run). Stop loss = 20% below avg buy (`STOP_LOSS_PCT` in `lib/stockAlerts.ts`; holdings already past it alert once). Price alerts are set in the stock drawer's Alerts tab (`app/components/drawer/AlertsTab.tsx`, `/api/price-alerts`, `lib/priceAlerts.ts`); direction is fixed from the live price at creation, and each fires once.
- **NEW**: F&O dashboard (`app/components/fo/`, `lib/fo/`) per `design_handoff_portfolio_insights/FO_BRIEF.md`. Data: Nuvama's single-day P&L report (xlsx, parsed in the browser on the F&O Data page — client details never uploaded), margin/cash typed in, and the F&O account's holdings from the PF Data rows of the portfolio set in Admin → Operations settings (`fo_portfolio`; the upload sums per-portfolio rows per stock for the main holdings). Between uploads legs are re-priced from live spot (futures ∝ spot, options by delta). Lot sizes and VaR haircuts come from NSE files. Visible to all roles, analysts included; uploads/purpose edits are manager/admin only. F&O section also shows on the Dashboard, and F&O underlyings join its Technical Alerts (levels from `lib/fo/technicals.ts`).
- **NEW**: Migrated from Redis to PostgreSQL for all data storage
- **NEW**: Admin Panel for user management (accessible to users with the admin flag)
- **NEW**: Firm Settings in Admin Panel — firm name, logo, benchmark index (stored in `app_settings`, see `lib/firmSettings.ts`)
- **NEW**: Role-based access control with two roles: `portfolio` (full access) and `analyst` (restricted)
- **NEW**: Analyst role restrictions - cannot see: invested amounts, portfolio value, quantity, absolute gains
- **NEW**: Email + Password authentication with allowlist (replaced hardcoded password)
- **NEW**: All API endpoints are now protected with JWT authentication
- **NEW**: Added Dashboard page with comprehensive portfolio metrics and technical alerts
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

### 📱 7 Main Pages/Components

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

#### 6. **PF Data** (`GridKeyPage`; formerly "GridKey Data"). Screener, PF, Entry and F&O Data are sections of one manager-only **Data** page (page id `data`, `dataTab` state in `app/page.tsx`)
- **Purpose**: Upload GridKey CSV files for holdings data
- **Features**: Quantity and buy price processing
- **Updates**: Portfolio holdings, quantities, average buy prices

#### 7. **Entry Data** (`EntryDataPage`)
- **Purpose**: View and manage entry dates and prices for all holdings
- **Location**: `app/components/EntryDataPage.tsx`
- **Features**:
  - Table of all stocks with entry date/price
  - Filter by: All, Missing (no entry data), Recorded
  - Search by stock name or code
  - Inline editing of entry date and price
  - Highlights stocks with missing data in red
  - Pre-fills edit form with averageBuyPrice as default

---

## 🔄 Data Flow Architecture

### Data Sources
1. **Screener.in CSV**: Stock prices, returns, P/E ratios, growth metrics
2. **GridKey CSV**: Holdings quantities, average buy prices
3. **API Storage**: PostgreSQL backend for persistence

### Data Processing Pipeline
```
Screener Upload → Parse CSV → Store in PostgreSQL → Load on App Start
GridKey Upload → Parse CSV → Store in PostgreSQL → Combine with Screener Data
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
- **Total Components**: 7 main page components
- **Single Table**: Only 1 functional table (in PortfolioInsightsPage)
- **Clean Architecture**: No unused/dead code remaining
- **Modular Design**: Each page handles specific functionality

---

## 🔐 Authentication & Authorization

### System Overview
- **Type**: Email + Password with Allowlist
- **Sessions**: JWT tokens stored in httpOnly cookies
- **API Protection**: All endpoints require authentication
- **Database**: PostgreSQL (migrated from Redis)

### User Roles
| Role | Description |
|------|-------------|
| `portfolio` | Full access to all data including financial amounts |
| `analyst` | Restricted: Cannot see invested amounts, portfolio value, quantity, absolute gains |

### Admin Panel
- **URL**: Admin tab in navigation (only visible to admin)
- **Admin**: any user with `users.is_admin = TRUE` (separate from role; gets manager access, exempt from device lock). First user to register on a fresh deployment becomes admin. Admins can grant/revoke admin for others. Admins can also remove the device lock for specific users (`users.device_lock_exempt`, migration 030) — exempt users can log in from any device and keep multiple sessions.
- **Features**: View all users, change user roles, firm settings (name, logo, benchmark)

### Auth Flow
1. **Registration**: Only emails in the `allowed_emails` table (managed in the Admin panel) can register (defaults to `analyst` role). New firm: `node scripts/setup-db.js <DATABASE_URL> admin@firm.com` creates the tables (from `scripts/schema.sql`) and allows the first email; regenerate the schema with `node scripts/export-schema.js` after a migration.
2. **Login**: Returns JWT access token (15 min) + refresh token (7 days)
3. **Session**: Stored in PostgreSQL with 7-day expiry
4. **Logout**: Clears cookies and database session

### Configuration
Edit `.env.local`:
```env
JWT_SECRET="your-secret-key"
DATABASE_URL="postgres://user:password@host:port/database"
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/auth.ts` | Password hashing (bcrypt), JWT utilities |
| `lib/authMiddleware.ts` | `withAuth()` wrapper for API protection |
| `lib/queries.ts` | PostgreSQL queries (users, sessions, data) |
| `pages/api/auth/register.ts` | Registration (allowlist check) |
| `pages/api/auth/login.ts` | Login, issues JWT cookies |
| `pages/api/auth/verify.ts` | Validates current session |
| `pages/api/auth/logout.ts` | Clears session |
| `pages/api/auth/refresh.ts` | Refreshes access token |
| `pages/api/admin/users.ts` | Admin API for user management |
| `app/contexts/AuthContext.tsx` | React context for auth state |
| `app/components/LoginPage.tsx` | Login/Register UI |
| `app/components/AdminPanel.tsx` | Admin panel for user management |

### Database Tables (PostgreSQL)
- `users` - User data (email, passwordHash, name, role, timestamps)
- `sessions` - Session data with expiry

### Security Features
- Passwords hashed with bcrypt (cost factor 12)
- JWT in httpOnly cookies (XSS protection)
- Short-lived access tokens (15 min)
- Session invalidation on logout
- Email allowlist for registration
- Role-based data access restrictions

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
│   │   └── AuthContext.tsx   # Authentication context (with roles)
│   └── components/
│       ├── Dashboard.tsx     # Dashboard component
│       ├── AdminPanel.tsx    # Admin panel for user management
│       └── LoginPage.tsx     # Login/Register UI
├── pages/api/
│   ├── auth/                 # Auth endpoints (register, login, verify, logout, refresh)
│   ├── admin/
│   │   └── users.ts          # Admin API for user management
│   ├── portfolio.ts          # Portfolio data (protected)
│   ├── gridkey.ts            # Holdings data (protected)
│   └── ...                   # Other protected endpoints
├── lib/
│   ├── db.ts                 # PostgreSQL connection
│   ├── queries.ts            # All PostgreSQL queries
│   ├── auth.ts               # Auth utilities (JWT, bcrypt)
│   └── authMiddleware.ts     # withAuth() API wrapper
├── scripts/migrations/       # Database migrations
│   ├── 003_redis_to_postgres.sql  # Main data migration
│   └── 004_add_user_roles.sql     # Role-based access control
├── types/
│   └── auth.ts               # Auth TypeScript interfaces
├── types.ts                  # Main TypeScript definitions
├── package.json              # Dependencies
└── CLAUDE.md                 # This documentation
```

---

*Documentation generated and maintained by Claude*