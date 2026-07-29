-- Per-stock pledge tracking. We pledge listed holdings for LAS (Loan Against
-- Securities) and F&O (Futures & Options) margin. Stores the pledged quantity
-- and where it is pledged for each stock code.

CREATE TABLE IF NOT EXISTS stock_pledges (
  stock_code    VARCHAR(50) PRIMARY KEY,
  pledged_qty   NUMERIC,
  pledged_where VARCHAR(10) CHECK (pledged_where IN ('LAS', 'F&O')),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
