import { z } from "zod";

// Stock basic info
export interface Stock {
  code: string;        // e.g. "600519", "000001"
  name: string;        // e.g. "贵州茅台", "平安银行"
  market: "SH" | "SZ"; // Shanghai or Shenzhen
  industry: string;    // e.g. "白酒", "银行"
  listDate: string;    // IPO date
}

// Real-time quote
export interface StockQuote {
  code: string;
  name: string;
  market: "SH" | "SZ";
  price: number;
  change: number;       // price change
  changePercent: number; // percentage
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;       // in lots (手)
  amount: number;       // turnover in yuan
  pe: number;           // P/E ratio
  pb: number;           // P/B ratio
  marketCap: number;    // in 亿
  turnoverRate: number; // %
  amplitude: number;    // %
  industry: string;
}

// K-line data point
export interface KlineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Fundamental data
export interface Fundamentals {
  code: string;
  name: string;
  // Income statement
  revenue: number;       // 营业收入 (亿)
  revenueYoy: number;    // 营收同比 %
  netProfit: number;     // 净利润 (亿)
  netProfitYoy: number;  // 净利润同比 %
  grossMargin: number;   // 毛利率 %
  netMargin: number;     // 净利率 %
  // Balance sheet
  totalAssets: number;   // 总资产 (亿)
  totalDebt: number;     // 总负债 (亿)
  debtRatio: number;     // 资产负债率 %
  roe: number;           // ROE %
  eps: number;           // 每股收益
  bvps: number;          // 每股净资产
  // Cash flow
  operatingCashFlow: number; // 经营现金流 (亿)
  freeCashFlow: number;      // 自由现金流 (亿)
  // Quarterly revenue/profit for charts (last 8 quarters)
  quarterlyRevenue: { quarter: string; value: number }[];
  quarterlyProfit: { quarter: string; value: number }[];
}

// Technical indicators
export interface TechnicalIndicators {
  code: string;
  // Moving averages
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  // MACD
  macdDIF: number;
  macdDEA: number;
  macdHistogram: number;
  // RSI
  rsi6: number;
  rsi12: number;
  rsi24: number;
  // KDJ
  kdjK: number;
  kdjD: number;
  kdjJ: number;
  // BOLL
  bollUpper: number;
  bollMiddle: number;
  bollLower: number;
  // Overall signal
  signalSummary: "强烈买入" | "买入" | "中性" | "卖出" | "强烈卖出";
  maSignal: "买入" | "中性" | "卖出";
  oscillatorSignal: "买入" | "中性" | "卖出";
}

// Market sentiment & analyst ratings
export interface SentimentData {
  code: string;
  // Analyst ratings
  buyCount: number;
  holdCount: number;
  sellCount: number;
  consensusRating: "买入" | "增持" | "中性" | "减持" | "卖出";
  targetPrice: number;
  targetUpside: number; // %
  // Sentiment indicators
  sentimentScore: number; // 0-100
  sentimentLabel: "极度贪婪" | "贪婪" | "中性" | "恐惧" | "极度恐惧";
  // Capital flow
  mainNetInflow: number;    // 主力净流入 (亿)
  retailNetInflow: number;  // 散户净流入 (亿)
  northboundFlow: number;   // 北向资金 (亿)
  // Recent news sentiment
  newsItems: { title: string; sentiment: "positive" | "neutral" | "negative"; date: string }[];
}

// Investment recommendation
export interface InvestmentRecommendation {
  code: string;
  name: string;
  overallScore: number;  // 0-100
  recommendation: "强烈推荐" | "推荐" | "中性" | "不推荐" | "强烈不推荐";
  reasons: string[];
  risks: string[];
  fundamentalScore: number;  // 0-100
  technicalScore: number;    // 0-100
  sentimentScore: number;    // 0-100
  valuationScore: number;    // 0-100
}

// Search query schema
export const searchQuerySchema = z.object({
  q: z.string().optional(),
  industry: z.string().optional(),
  sort: z.enum(["change", "volume", "marketCap", "pe"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
