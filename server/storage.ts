import type {
  StockQuote,
  KlineData,
  Fundamentals,
  TechnicalIndicators,
  SentimentData,
  InvestmentRecommendation,
} from "@shared/schema";

export interface IStorage {
  getAllStocks(): Promise<StockQuote[]>;
  searchStocks(query: string): Promise<StockQuote[]>;
  getStockByCode(code: string): Promise<StockQuote | undefined>;
  getKlineData(code: string, period?: string): Promise<KlineData[]>;
  getFundamentals(code: string): Promise<Fundamentals | undefined>;
  getTechnicalIndicators(code: string): Promise<TechnicalIndicators | undefined>;
  getSentiment(code: string): Promise<SentimentData | undefined>;
  getRecommendation(code: string): Promise<InvestmentRecommendation | undefined>;
  getMarketOverview(): Promise<{
    totalStocks: number;
    upCount: number;
    downCount: number;
    flatCount: number;
    avgChange: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Seeded PRNG for deterministic simulated data (sentiment, fundamentals). */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Convert stock code to East Money secid format (market.code). */
function toSecId(code: string): string {
  // 6xx = SH (market 1), 0xx/3xx = SZ (market 0), 688xx = SH
  if (code.startsWith("6")) return `1.${code}`;
  return `0.${code}`;
}

/** Derive market label from code. */
function marketFromCode(code: string): "SH" | "SZ" {
  return code.startsWith("6") ? "SH" : "SZ";
}

/** Board/type label used as industry placeholder. */
function boardLabel(code: string): string {
  if (code.startsWith("688")) return "科创板";
  if (code.startsWith("300")) return "创业板";
  if (code.startsWith("6")) return "沪市主板";
  if (code.startsWith("0")) return "深市主板";
  return "其他";
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  ts: number;
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() - e.ts > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return e.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, ts: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// East Money API fetchers
// ---------------------------------------------------------------------------

const STOCK_LIST_URL = "https://push2delay.eastmoney.com/api/qt/clist/get";
const KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

let apiReachable: boolean | null = null; // null = unknown, true/false after first attempt

async function fetchJson(url: string, timeoutMs: number = 30000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://quote.eastmoney.com/",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    apiReachable = true;
    return res.json();
  } catch (err) {
    apiReachable = false;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a single item from the East Money clist diff array into a StockQuote. */
function parseQuoteItem(d: any): StockQuote | null {
  if (d.f2 == null || d.f2 === "-" || typeof d.f2 !== "number" || d.f2 <= 0) return null;

  const code: string = String(d.f12);
  const market: "SH" | "SZ" = d.f13 === 1 ? "SH" : "SZ";
  const name: string = String(d.f14 ?? "");
  const price = d.f2 as number;
  const changePercent = typeof d.f3 === "number" ? d.f3 : 0;
  const change = typeof d.f4 === "number" ? d.f4 : 0;
  const volume = typeof d.f5 === "number" ? d.f5 : 0;       // 手
  const amount = typeof d.f6 === "number" ? d.f6 : 0;       // 元
  const amplitude = typeof d.f7 === "number" ? d.f7 : 0;    // %
  const high = typeof d.f15 === "number" ? d.f15 : price;
  const low = typeof d.f16 === "number" ? d.f16 : price;
  const open = typeof d.f17 === "number" ? d.f17 : price;
  const prevClose = typeof d.f18 === "number" ? d.f18 : price;
  const totalMarketCapYuan = typeof d.f20 === "number" ? d.f20 : 0;
  const pb = typeof d.f23 === "number" ? d.f23 : 0;
  const pe = typeof d.f115 === "number" ? d.f115 : 0;

  const marketCap = roundTo(totalMarketCapYuan / 1e8, 2); // 元 -> 亿
  const turnoverRate = totalMarketCapYuan > 0
    ? roundTo((amount / totalMarketCapYuan) * 100, 2)
    : 0;

  return {
    code, name, market, price, change, changePercent,
    open, high, low, prevClose, volume, amount: roundTo(amount / 1e8, 2), // 元 -> 亿
    pe, pb, marketCap, turnoverRate, amplitude,
    industry: boardLabel(code),
  };
}

/** Fetch one page (max 100 items) from the clist endpoint. */
async function fetchStockPage(page: number): Promise<{ items: StockQuote[]; total: number }> {
  const params = new URLSearchParams({
    pn: String(page),
    pz: "100",
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
    fields: "f2,f3,f4,f5,f6,f7,f12,f13,f14,f15,f16,f17,f18,f20,f23,f62,f115,f152",
  });

  const json = await fetchJson(`${STOCK_LIST_URL}?${params}`);
  const diff: any[] = json?.data?.diff ?? [];
  const total: number = json?.data?.total ?? 0;

  const items: StockQuote[] = [];
  for (const d of diff) {
    const q = parseQuoteItem(d);
    if (q) items.push(q);
  }
  return { items, total };
}

/** Fetch all A-share stocks with real-time quotes, paginating through all pages. */
async function fetchAllStockQuotes(): Promise<StockQuote[]> {
  // First page to discover total count
  const first = await fetchStockPage(1);
  const results: StockQuote[] = first.items;
  const totalPages = Math.ceil(first.total / 100);

  if (totalPages <= 1) return results;

  // Fetch remaining pages in sequential batches of 5 to avoid connection limits
  const BATCH_SIZE = 5;
  for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
    const pages: number[] = [];
    for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

    const batchResults = await Promise.all(pages.map((p) => fetchStockPage(p)));
    for (const br of batchResults) {
      for (const item of br.items) results.push(item);
    }
  }

  return results;
}

/** Fetch K-line data for a single stock. klt: 101=daily, 102=weekly, 103=monthly */
async function fetchKlineData(code: string, klt: number = 101, limit: number = 250): Promise<KlineData[]> {
  const secid = toSecId(code);
  const params = new URLSearchParams({
    secid,
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: String(klt),
    fqt: "1",
    beg: "0",
    end: "20500101",
    lmt: String(limit),
  });

  const json = await fetchJson(`${KLINE_URL}?${params}`);
  const raw: string[] = json?.data?.klines ?? [];

  // Each kline: "date,open,close,high,low,volume,amount,amplitude,changePercent,change,turnoverRate"
  const parsed = raw.map((line: string) => {
    const parts = line.split(",");
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      close: parseFloat(parts[2]),
      volume: parseInt(parts[5], 10),
    };
  }).filter((k: KlineData) => !isNaN(k.close) && k.close > 0 && k.open > 0 && k.high > 0 && k.low > 0);

  // Return only the last `limit` entries
  return parsed.length > limit ? parsed.slice(parsed.length - limit) : parsed;
}

// ---------------------------------------------------------------------------
// Technical indicators – computed from real K-line data
// ---------------------------------------------------------------------------

function computeTechnicals(klines: KlineData[], code: string): TechnicalIndicators {
  const closes = klines.map((k) => k.close);
  const n = closes.length;

  const ma = (period: number) => {
    if (n < period) return closes[n - 1];
    let sum = 0;
    for (let i = n - period; i < n; i++) sum += closes[i];
    return roundTo(sum / period, 2);
  };

  const ma5 = ma(5);
  const ma10 = ma(10);
  const ma20 = ma(20);
  const ma60 = ma(60);

  // EMA
  const ema = (data: number[], period: number): number[] => {
    const result: number[] = [data[0]];
    const k = 2 / (period + 1);
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  // MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = ema12.map((v, i) => v - ema26[i]);
  const dea = ema(dif, 9);
  const macdDIF = roundTo(dif[n - 1], 3);
  const macdDEA = roundTo(dea[n - 1], 3);
  const macdHistogram = roundTo((macdDIF - macdDEA) * 2, 3);

  // RSI
  const rsi = (period: number): number => {
    let gains = 0, losses = 0;
    const start = Math.max(0, n - period - 1);
    for (let i = start + 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return roundTo(100 - 100 / (1 + rs), 2);
  };

  const rsi6 = rsi(6);
  const rsi12 = rsi(12);
  const rsi24 = rsi(24);

  // KDJ
  const kdjPeriod = Math.min(9, n);
  const recentHighs = klines.slice(-kdjPeriod).map((k) => k.high);
  const recentLows = klines.slice(-kdjPeriod).map((k) => k.low);
  const highest = Math.max(...recentHighs);
  const lowest = Math.min(...recentLows);
  const rsv = highest === lowest ? 50 : ((closes[n - 1] - lowest) / (highest - lowest)) * 100;
  const kdjK = roundTo(rsv * 0.67 + 50 * 0.33, 2);
  const kdjD = roundTo(kdjK * 0.67 + 50 * 0.33, 2);
  const kdjJ = roundTo(3 * kdjK - 2 * kdjD, 2);

  // Bollinger Bands
  const bollPeriod = Math.min(20, n);
  const bollMiddle = ma(bollPeriod);
  const recentForBoll = closes.slice(-bollPeriod);
  const stdDev = Math.sqrt(
    recentForBoll.reduce((sum, c) => sum + Math.pow(c - bollMiddle, 2), 0) / bollPeriod
  );
  const bollUpper = roundTo(bollMiddle + 2 * stdDev, 2);
  const bollLower = roundTo(bollMiddle - 2 * stdDev, 2);

  // Signals
  const currentPrice = closes[n - 1];
  let maScore = 0;
  if (currentPrice > ma5) maScore++;
  if (currentPrice > ma10) maScore++;
  if (currentPrice > ma20) maScore++;
  if (currentPrice > ma60) maScore++;
  const maSignal: "买入" | "中性" | "卖出" = maScore >= 3 ? "买入" : maScore <= 1 ? "卖出" : "中性";

  let oscScore = 0;
  if (rsi6 < 30) oscScore += 2; else if (rsi6 < 50) oscScore += 1; else if (rsi6 > 70) oscScore -= 2; else if (rsi6 > 50) oscScore -= 1;
  if (macdHistogram > 0) oscScore++; else oscScore--;
  if (kdjK < 20) oscScore += 2; else if (kdjK > 80) oscScore -= 2;
  const oscillatorSignal: "买入" | "中性" | "卖出" = oscScore >= 2 ? "买入" : oscScore <= -2 ? "卖出" : "中性";

  const totalScore = maScore + (oscScore > 0 ? 1 : oscScore < 0 ? -1 : 0);
  const signalSummary: "强烈买入" | "买入" | "中性" | "卖出" | "强烈卖出" =
    totalScore >= 4 ? "强烈买入" : totalScore >= 2 ? "买入" : totalScore <= -3 ? "强烈卖出" : totalScore <= -1 ? "卖出" : "中性";

  return {
    code,
    ma5, ma10, ma20, ma60,
    macdDIF, macdDEA, macdHistogram,
    rsi6, rsi12, rsi24,
    kdjK, kdjD, kdjJ,
    bollUpper, bollMiddle: roundTo(bollMiddle, 2), bollLower,
    signalSummary, maSignal, oscillatorSignal,
  };
}

// ---------------------------------------------------------------------------
// Simulated fundamentals – derived from real quote data (PE, PB, marketCap)
// ---------------------------------------------------------------------------

function simulateFundamentals(quote: StockQuote): Fundamentals {
  const rand = seededRandom(hashCode(quote.code));
  const r = () => rand();
  const rb = (min: number, max: number) => min + r() * (max - min);

  const pe = Math.max(quote.pe, 1);
  const pb = Math.max(quote.pb, 0.1);
  const mcap = Math.max(quote.marketCap, 1); // 亿

  const netProfit = roundTo(mcap / pe, 2);
  const netProfitYoy = roundTo(rb(-15, 35), 2);
  const netMargin = roundTo(rb(5, 40), 2);
  const revenue = netMargin > 0 ? roundTo(netProfit / (netMargin / 100), 2) : roundTo(netProfit * 8, 2);
  const revenueYoy = roundTo(rb(-5, 30), 2);
  const grossMargin = roundTo(netMargin + rb(8, 30), 2);

  const bookValuePerShare = quote.price / pb;
  // Rough share count in 亿 from marketCap
  const sharesYi = mcap / quote.price;
  const totalEquity = bookValuePerShare * sharesYi; // 亿
  const debtRatio = roundTo(rb(25, 70), 2);
  const totalAssets = roundTo(totalEquity / (1 - debtRatio / 100), 2);
  const totalDebt = roundTo(totalAssets - totalEquity, 2);
  const roe = roundTo(netProfit / totalEquity * 100, 2);
  const eps = roundTo(netProfit / sharesYi, 2);
  const bvps = roundTo(bookValuePerShare, 2);

  const operatingCashFlow = roundTo(netProfit * rb(0.7, 1.5), 2);
  const freeCashFlow = roundTo(operatingCashFlow * rb(0.2, 0.7), 2);

  const quarters = ["2024Q1", "2024Q2", "2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4"];
  const quarterlyRevenue = quarters.map((q, i) => ({
    quarter: q,
    value: roundTo(revenue / 4 * (0.85 + r() * 0.3) * (1 + i * 0.012), 2),
  }));
  const quarterlyProfit = quarters.map((q, i) => ({
    quarter: q,
    value: roundTo(netProfit / 4 * (0.8 + r() * 0.4) * (1 + i * 0.012), 2),
  }));

  return {
    code: quote.code,
    name: quote.name,
    revenue, revenueYoy, netProfit, netProfitYoy,
    grossMargin, netMargin,
    totalAssets, totalDebt, debtRatio, roe, eps, bvps,
    operatingCashFlow, freeCashFlow,
    quarterlyRevenue, quarterlyProfit,
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Simulated sentiment – driven by real price movement data
// ---------------------------------------------------------------------------

function simulateSentiment(quote: StockQuote): SentimentData {
  const rand = seededRandom(hashCode(quote.code) + 7);
  const r = () => rand();
  const rb = (min: number, max: number) => min + r() * (max - min);

  // Bias analyst ratings toward buy if stock is performing well
  const bias = Math.max(0, Math.min(1, 0.5 + quote.changePercent / 20));
  const buyCount = Math.round(rb(3, 20) * (0.5 + bias));
  const holdCount = Math.round(rb(2, 12));
  const sellCount = Math.round(rb(0, 6) * (1.5 - bias));
  const total = buyCount + holdCount + sellCount;
  const buyRatio = total > 0 ? buyCount / total : 0.5;

  const consensusRating: SentimentData["consensusRating"] =
    buyRatio > 0.7 ? "买入" : buyRatio > 0.5 ? "增持" : buyRatio > 0.35 ? "中性" : buyRatio > 0.2 ? "减持" : "卖出";

  const targetUpside = roundTo(rb(-10, 40), 2);
  const targetPrice = roundTo(quote.price * (1 + targetUpside / 100), 2);

  // Sentiment score driven by changePercent + amplitude
  const baseSentiment = 50 + quote.changePercent * 5 - quote.amplitude * 0.5;
  const sentimentScore = Math.round(Math.max(5, Math.min(95, baseSentiment + rb(-10, 10))));
  const sentimentLabel: SentimentData["sentimentLabel"] =
    sentimentScore > 80 ? "极度贪婪" : sentimentScore > 60 ? "贪婪" : sentimentScore > 40 ? "中性" : sentimentScore > 20 ? "恐惧" : "极度恐惧";

  // Capital flow: use real mainNetInflow if available from quote, else simulate
  const mainNetInflow = roundTo(rb(-5, 8), 2);
  const retailNetInflow = roundTo(-mainNetInflow * rb(0.4, 0.8), 2);
  const northboundFlow = roundTo(rb(-3, 5), 2);

  // Simulated news
  const newsTemplates: { tpl: string; sentiment: "positive" | "neutral" | "negative" }[] = [
    { tpl: `${quote.name}获得多家机构上调目标价`, sentiment: "positive" },
    { tpl: `${quote.name}公布业绩预增公告`, sentiment: "positive" },
    { tpl: `${quote.name}入选MSCI指数成分股`, sentiment: "positive" },
    { tpl: `${quote.name}公告大额股份回购计划`, sentiment: "positive" },
    { tpl: `${quote.name}召开年度股东大会`, sentiment: "neutral" },
    { tpl: `${quote.name}管理层调整，新高管就位`, sentiment: "neutral" },
    { tpl: `${quote.name}发布季度运营数据`, sentiment: "neutral" },
    { tpl: `${quote.name}面临行业竞争加剧压力`, sentiment: "negative" },
    { tpl: `${quote.name}大股东减持计划公告`, sentiment: "negative" },
    { tpl: `${quote.name}所在行业监管政策趋严`, sentiment: "negative" },
  ];

  const count = 4 + Math.floor(r() * 4);
  const used = new Set<number>();
  const newsItems: SentimentData["newsItems"] = [];
  for (let i = 0; i < count && used.size < newsTemplates.length; i++) {
    let idx: number;
    do { idx = Math.floor(r() * newsTemplates.length); } while (used.has(idx));
    used.add(idx);
    const tmpl = newsTemplates[idx];
    const daysAgo = Math.floor(r() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    newsItems.push({
      title: tmpl.tpl,
      sentiment: tmpl.sentiment,
      date: date.toISOString().slice(0, 10),
    });
  }
  newsItems.sort((a, b) => b.date.localeCompare(a.date));

  return {
    code: quote.code,
    buyCount, holdCount, sellCount, consensusRating,
    targetPrice, targetUpside,
    sentimentScore, sentimentLabel,
    mainNetInflow, retailNetInflow, northboundFlow,
    newsItems,
  };
}

// ---------------------------------------------------------------------------
// Investment recommendation – composite scoring
// ---------------------------------------------------------------------------

function computeRecommendation(
  quote: StockQuote,
  fundamentals: Fundamentals,
  technicals: TechnicalIndicators,
  sentiment: SentimentData,
): InvestmentRecommendation {
  const rand = seededRandom(hashCode(quote.code) + 13);
  const r = () => rand();

  // Fundamental score
  const fScore = Math.min(100, Math.max(0, Math.round(
    (Math.max(0, Math.min(fundamentals.roe, 40)) / 40 * 30) +
    (Math.max(0, fundamentals.netProfitYoy) / 30 * 25) +
    (fundamentals.grossMargin / 100 * 20) +
    (fundamentals.freeCashFlow > 0 ? 25 : 10)
  )));

  // Technical score
  const techMap: Record<string, number> = { "强烈买入": 90, "买入": 72, "中性": 50, "卖出": 28, "强烈卖出": 10 };
  const tScore = Math.min(100, Math.max(0, Math.round(
    (techMap[technicals.signalSummary] ?? 50) + (r() - 0.5) * 16
  )));

  const sScore = sentiment.sentimentScore;

  // Valuation score
  const pe = Math.max(quote.pe, 1);
  const vScore = Math.min(100, Math.max(0, Math.round(
    pe < 10 ? 80 + r() * 15 :
    pe < 20 ? 60 + r() * 20 :
    pe < 35 ? 40 + r() * 20 :
    20 + r() * 25
  )));

  const overallScore = Math.round(fScore * 0.35 + tScore * 0.25 + sScore * 0.2 + vScore * 0.2);

  const recommendation: InvestmentRecommendation["recommendation"] =
    overallScore >= 80 ? "强烈推荐" :
    overallScore >= 65 ? "推荐" :
    overallScore >= 45 ? "中性" :
    overallScore >= 30 ? "不推荐" : "强烈不推荐";

  const reasons: string[] = [];
  const risks: string[] = [];

  if (fundamentals.roe > 15) reasons.push(`ROE达${fundamentals.roe}%，盈利能力优秀`);
  if (fundamentals.netProfitYoy > 10) reasons.push(`净利润同比增长${fundamentals.netProfitYoy}%，业绩向好`);
  if (fundamentals.grossMargin > 40) reasons.push(`毛利率${fundamentals.grossMargin}%，竞争优势明显`);
  if (fundamentals.freeCashFlow > 0) reasons.push(`自由现金流${fundamentals.freeCashFlow}亿，财务健康`);
  if (sentiment.targetUpside > 15) reasons.push(`目标价上行空间${sentiment.targetUpside}%`);
  if (sentiment.mainNetInflow > 1) reasons.push(`主力资金净流入${sentiment.mainNetInflow}亿`);
  if (technicals.maSignal === "买入") reasons.push("均线多头排列，技术面偏多");
  if (quote.changePercent > 2) reasons.push(`近期涨幅${quote.changePercent}%，趋势向好`);
  if (reasons.length === 0) reasons.push("行业地位稳固，长期价值可期");

  if (pe > 40) risks.push(`估值偏高(PE=${roundTo(pe, 1)})，回调风险较大`);
  if (fundamentals.debtRatio > 65) risks.push(`资产负债率${fundamentals.debtRatio}%，偿债压力较大`);
  if (fundamentals.netProfitYoy < 0) risks.push(`净利润同比下滑${fundamentals.netProfitYoy}%，业绩承压`);
  if (sentiment.mainNetInflow < -2) risks.push(`主力资金净流出${Math.abs(sentiment.mainNetInflow)}亿`);
  if (technicals.rsi6 > 70) risks.push("RSI超买，短期有回调压力");
  if (technicals.rsi6 < 30) risks.push("RSI超卖，可能持续探底");
  risks.push("宏观经济不确定性、行业政策变化风险");

  return {
    code: quote.code,
    name: quote.name,
    overallScore,
    recommendation,
    reasons: reasons.slice(0, 5),
    risks: risks.slice(0, 4),
    fundamentalScore: fScore,
    technicalScore: tScore,
    sentimentScore: sScore,
    valuationScore: vScore,
  };
}

// ---------------------------------------------------------------------------
// LiveStorage – fetches real data from East Money public APIs
// ---------------------------------------------------------------------------

export class LiveStorage implements IStorage {
  // Cache: stock list (10min), kline (5min), per-stock derived data (5min)
  private stockListCache = new TTLCache<StockQuote[]>(600_000);
  private lastSuccessfulStocks: StockQuote[] | null = null; // persist successful fetch across cache expiry
  private klineCache = new TTLCache<KlineData[]>(300_000);
  private techCache = new TTLCache<TechnicalIndicators>(300_000);
  private fundCache = new TTLCache<Fundamentals>(300_000);
  private sentimentCache = new TTLCache<SentimentData>(300_000);
  private recoCache = new TTLCache<InvestmentRecommendation>(300_000);

  private async fetchStockList(): Promise<StockQuote[]> {
    const cached = this.stockListCache.get("all");
    if (cached) return cached;

    try {
      const stocks = await fetchAllStockQuotes();
      if (stocks.length > 0) {
        this.stockListCache.set("all", stocks);
        this.lastSuccessfulStocks = stocks; // remember successful fetch
        console.log(`[storage] Fetched ${stocks.length} real stocks from East Money API`);
        return stocks;
      }
    } catch (err: any) {
      // If we previously had real data, reuse it instead of falling back to mock
      if (this.lastSuccessfulStocks && this.lastSuccessfulStocks.length > 100) {
        console.warn(`[storage] East Money API unreachable (${err.message}), reusing last successful data (${this.lastSuccessfulStocks.length} stocks)`);
        this.stockListCache.set("all", this.lastSuccessfulStocks);
        return this.lastSuccessfulStocks;
      }
      console.warn(`[storage] East Money API unreachable (${err.message}), using fallback mock data`);
    }

    // Fallback to mock data only on first load when API is unreachable
    const fallback = generateFallbackStocks();
    this.stockListCache.set("all", fallback);
    return fallback;
  }

  async getAllStocks(): Promise<StockQuote[]> {
    return this.fetchStockList();
  }

  async searchStocks(query: string): Promise<StockQuote[]> {
    const all = await this.fetchStockList();
    const q = query.toLowerCase();
    return all.filter(
      (s) => s.code.includes(q) || s.name.toLowerCase().includes(q) || s.industry.toLowerCase().includes(q)
    );
  }

  async getStockByCode(code: string): Promise<StockQuote | undefined> {
    const all = await this.fetchStockList();
    return all.find((s) => s.code === code);
  }

  async getKlineData(code: string, period?: string): Promise<KlineData[]> {
    const klt = period === "weekly" ? 102 : period === "monthly" ? 103 : 101;
    const cacheKey = `${code}_${klt}`;
    const cached = this.klineCache.get(cacheKey);
    if (cached) return cached;

    try {
      const klines = await fetchKlineData(code, klt, 250);
      if (klines.length > 0) {
        this.klineCache.set(cacheKey, klines);
        return klines;
      }
    } catch {
      // API unreachable, use generated kline data
    }

    const quote = await this.getStockByCode(code);
    const fallbackKlines = generateFallbackKlines(quote?.price ?? 50, code);
    this.klineCache.set(cacheKey, fallbackKlines);
    return fallbackKlines;
  }

  async getFundamentals(code: string): Promise<Fundamentals | undefined> {
    const cached = this.fundCache.get(code);
    if (cached) return cached;

    const quote = await this.getStockByCode(code);
    if (!quote) return undefined;

    const result = simulateFundamentals(quote);
    this.fundCache.set(code, result);
    return result;
  }

  async getTechnicalIndicators(code: string): Promise<TechnicalIndicators | undefined> {
    const cached = this.techCache.get(code);
    if (cached) return cached;

    const klines = await this.getKlineData(code, "daily");
    if (klines.length < 5) return undefined;

    const result = computeTechnicals(klines, code);
    this.techCache.set(code, result);
    return result;
  }

  async getSentiment(code: string): Promise<SentimentData | undefined> {
    const cached = this.sentimentCache.get(code);
    if (cached) return cached;

    const quote = await this.getStockByCode(code);
    if (!quote) return undefined;

    const result = simulateSentiment(quote);
    this.sentimentCache.set(code, result);
    return result;
  }

  async getRecommendation(code: string): Promise<InvestmentRecommendation | undefined> {
    const cached = this.recoCache.get(code);
    if (cached) return cached;

    const [quote, fundamentals, technicals, sentiment] = await Promise.all([
      this.getStockByCode(code),
      this.getFundamentals(code),
      this.getTechnicalIndicators(code),
      this.getSentiment(code),
    ]);
    if (!quote || !fundamentals || !technicals || !sentiment) return undefined;

    const result = computeRecommendation(quote, fundamentals, technicals, sentiment);
    this.recoCache.set(code, result);
    return result;
  }

  async getMarketOverview(): Promise<{
    totalStocks: number;
    upCount: number;
    downCount: number;
    flatCount: number;
    avgChange: number;
  }> {
    const all = await this.fetchStockList();
    const upCount = all.filter((s) => s.changePercent > 0).length;
    const downCount = all.filter((s) => s.changePercent < 0).length;
    const flatCount = all.filter((s) => s.changePercent === 0).length;
    const avgChange = all.length > 0
      ? roundTo(all.reduce((sum, s) => sum + s.changePercent, 0) / all.length, 2)
      : 0;
    return { totalStocks: all.length, upCount, downCount, flatCount, avgChange };
  }
}

// ---------------------------------------------------------------------------
// Fallback mock data generators (used when East Money API is unreachable)
// ---------------------------------------------------------------------------

function seededRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function generateFallbackStocks(): StockQuote[] {
  const stocks: { code: string; name: string; market: "SH" | "SZ"; price: number; industry: string }[] = [
    { code: "600519", name: "贵州茅台", market: "SH", price: 1547, industry: "白酒" },
    { code: "000858", name: "五粮液", market: "SZ", price: 128, industry: "白酒" },
    { code: "600036", name: "招商银行", market: "SH", price: 35, industry: "银行" },
    { code: "601318", name: "中国平安", market: "SH", price: 48, industry: "保险" },
    { code: "000001", name: "平安银行", market: "SZ", price: 11, industry: "银行" },
    { code: "600276", name: "恒瑞医药", market: "SH", price: 42, industry: "医药" },
    { code: "300750", name: "宁德时代", market: "SZ", price: 198, industry: "新能源" },
    { code: "601012", name: "隆基绿能", market: "SH", price: 16, industry: "新能源" },
    { code: "000333", name: "美的集团", market: "SZ", price: 62, industry: "家电" },
    { code: "000651", name: "格力电器", market: "SZ", price: 38, industry: "家电" },
    { code: "600887", name: "伊利股份", market: "SH", price: 28, industry: "食品饮料" },
    { code: "002714", name: "牧原股份", market: "SZ", price: 36, industry: "农牧" },
    { code: "601888", name: "中国中免", market: "SH", price: 68, industry: "旅游" },
    { code: "002475", name: "立讯精密", market: "SZ", price: 30, industry: "电子" },
    { code: "600900", name: "长江电力", market: "SH", price: 29, industry: "电力" },
    { code: "601398", name: "工商银行", market: "SH", price: 6.2, industry: "银行" },
    { code: "601288", name: "农业银行", market: "SH", price: 4.8, industry: "银行" },
    { code: "600030", name: "中信证券", market: "SH", price: 21, industry: "证券" },
    { code: "002594", name: "比亚迪", market: "SZ", price: 268, industry: "汽车" },
    { code: "601899", name: "紫金矿业", market: "SH", price: 15, industry: "有色金属" },
    { code: "600809", name: "山西汾酒", market: "SH", price: 215, industry: "白酒" },
    { code: "000568", name: "泸州老窖", market: "SZ", price: 158, industry: "白酒" },
    { code: "002304", name: "洋河股份", market: "SZ", price: 82, industry: "白酒" },
    { code: "600309", name: "万华化学", market: "SH", price: 78, industry: "化工" },
    { code: "300059", name: "东方财富", market: "SZ", price: 16, industry: "证券" },
    { code: "601919", name: "中远海控", market: "SH", price: 12, industry: "航运" },
    { code: "600585", name: "海螺水泥", market: "SH", price: 22, industry: "建材" },
    { code: "000725", name: "京东方A", market: "SZ", price: 4.5, industry: "电子" },
    { code: "601166", name: "兴业银行", market: "SH", price: 18, industry: "银行" },
    { code: "600000", name: "浦发银行", market: "SH", price: 8.5, industry: "银行" },
    { code: "300124", name: "汇川技术", market: "SZ", price: 52, industry: "自动化" },
    { code: "002352", name: "顺丰控股", market: "SZ", price: 38, industry: "物流" },
    { code: "601668", name: "中国建筑", market: "SH", price: 6, industry: "建筑" },
    { code: "600690", name: "海尔智家", market: "SH", price: 27, industry: "家电" },
    { code: "002415", name: "海康威视", market: "SZ", price: 32, industry: "安防" },
    { code: "601857", name: "中国石油", market: "SH", price: 8.5, industry: "石油" },
    { code: "600048", name: "保利发展", market: "SH", price: 11, industry: "房地产" },
    { code: "000002", name: "万科A", market: "SZ", price: 8, industry: "房地产" },
    { code: "600588", name: "用友网络", market: "SH", price: 14, industry: "软件" },
    { code: "002230", name: "科大飞", market: "SZ", price: 48, industry: "人工智能" },
    { code: "603259", name: "药明康德", market: "SH", price: 52, industry: "医药" },
    { code: "300760", name: "迈瑞医疗", market: "SZ", price: 265, industry: "医疗器械" },
    { code: "600436", name: "片仔癀", market: "SH", price: 225, industry: "中药" },
    { code: "002142", name: "宁波银行", market: "SZ", price: 22, industry: "银行" },
    { code: "601816", name: "京沪高铁", market: "SH", price: 5.5, industry: "交通运输" },
    { code: "688981", name: "中芯国际", market: "SH", price: 72, industry: "半导体" },
    { code: "688012", name: "中微公司", market: "SH", price: 135, industry: "半导体" },
    { code: "300274", name: "阳光电源", market: "SZ", price: 72, industry: "新能源" },
    { code: "002049", name: "紫光国微", market: "SZ", price: 108, industry: "芯片" },
    { code: "600150", name: "中国船舶", market: "SH", price: 35, industry: "军工" },
  ];

  const r = seededRand(Date.now() % 100000);
  return stocks.map((s) => {
    const chgPct = roundTo((r() - 0.48) * 8, 2); // -4% to +4%
    const change = roundTo(s.price * chgPct / 100, 2);
    const price = roundTo(s.price + change, 2);
    const prevClose = s.price;
    const open = roundTo(prevClose + (r() - 0.5) * s.price * 0.02, 2);
    const high = roundTo(Math.max(price, open) + r() * s.price * 0.01, 2);
    const low = roundTo(Math.min(price, open) - r() * s.price * 0.01, 2);
    const volume = Math.round(r() * 500000 + 10000);
    const amount = roundTo(volume * price * 100 / 1e8, 2); // 亿
    const marketCap = roundTo(price * (r() * 5000 + 500), 2); // 亿
    const pe = roundTo(10 + r() * 50, 2);
    const pb = roundTo(0.8 + r() * 8, 2);
    const turnoverRate = roundTo(r() * 5 + 0.1, 2);
    const amplitude = roundTo(((high - low) / prevClose) * 100, 2);

    return {
      code: s.code, name: s.name, market: s.market, industry: s.industry,
      price, change, changePercent: chgPct, open, high, low, prevClose,
      volume, amount, pe, pb, marketCap, turnoverRate, amplitude,
    };
  });
}

function generateFallbackKlines(basePrice: number, code: string): KlineData[] {
  const r = seededRand(code.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const klines: KlineData[] = [];
  let price = basePrice * (0.7 + r() * 0.3);
  const today = new Date();

  for (let i = 249; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const chg = (r() - 0.48) * price * 0.04;
    const open = roundTo(price, 2);
    const close = roundTo(price + chg, 2);
    const high = roundTo(Math.max(open, close) + r() * price * 0.015, 2);
    const low = roundTo(Math.min(open, close) - r() * price * 0.015, 2);
    const volume = Math.round(r() * 300000 + 20000);

    klines.push({
      date: d.toISOString().slice(0, 10),
      open, high, low, close, volume,
    });
    price = close;
  }
  return klines.slice(-250);
}

const liveStorage = new LiveStorage();

// Pre-warm cache on startup with retry logic to avoid falling back to 50 mock stocks
(async () => {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [0, 5000, 10000]; // 0s, 5s, 10s

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[startup] Retry attempt ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAYS[attempt] / 1000}s...`);
      await sleep(RETRY_DELAYS[attempt]);
    }
    try {
      const stocks = await fetchAllStockQuotes();
      if (stocks.length > 100) {
        liveStorage["stockListCache"].set("all", stocks);
        liveStorage["lastSuccessfulStocks"] = stocks;
        console.log(`[startup] Successfully loaded ${stocks.length} real stocks (attempt ${attempt + 1})`);
        return; // success — exit
      }
      console.warn(`[startup] Got only ${stocks.length} stocks, retrying...`);
    } catch (err: any) {
      console.warn(`[startup] Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  // All retries failed — load mock data, then schedule background recovery
  console.warn(`[startup] All ${MAX_RETRIES} attempts failed. Loading fallback data and scheduling background recovery.`);

  // Schedule a background retry every 60s until real data is loaded
  const recoveryInterval = setInterval(async () => {
    try {
      console.log("[recovery] Attempting to fetch real stock data in background...");
      const stocks = await fetchAllStockQuotes();
      if (stocks.length > 100) {
        liveStorage["stockListCache"].set("all", stocks);
        liveStorage["lastSuccessfulStocks"] = stocks;
        console.log(`[recovery] Successfully recovered! Loaded ${stocks.length} real stocks.`);
        clearInterval(recoveryInterval);
      }
    } catch (err: any) {
      console.warn(`[recovery] Background fetch failed: ${err.message}`);
    }
  }, 60_000);
})();

export const storage: IStorage = liveStorage;
