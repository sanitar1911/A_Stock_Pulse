import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { searchQuerySchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check endpoint for Railway (responds immediately, no data fetching)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // GET /api/stocks - list stocks with optional search (returns max 50 results)
  app.get("/api/stocks", async (req, res) => {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      const query = parsed.success ? parsed.data : {};

      // If no search query, return empty — use /api/stocks/hot for default view
      if (!query.q || query.q.trim().length === 0) {
        res.json([]);
        return;
      }

      let stocks = await storage.searchStocks(query.q);

      // Filter by industry
      if (query.industry) {
        stocks = stocks.filter((s) => s.industry === query.industry);
      }

      // Sort
      if (query.sort) {
        const order = query.order === "asc" ? 1 : -1;
        stocks.sort((a, b) => {
          switch (query.sort) {
            case "change": return (a.changePercent - b.changePercent) * order;
            case "volume": return (a.volume - b.volume) * order;
            case "marketCap": return (a.marketCap - b.marketCap) * order;
            case "pe": return (a.pe - b.pe) * order;
            default: return 0;
          }
        });
      }

      // Limit results to 50 max
      res.json(stocks.slice(0, 50));
    } catch (err) {
      console.error("Error fetching stocks:", err);
      res.json([]);
    }
  });

  // GET /api/stocks/hot - get today's hot stocks (top gainers, losers, most active)
  app.get("/api/stocks/hot", async (_req, res) => {
    try {
      const allStocks = await storage.getAllStocks();

      // Top 10 gainers (涨幅榜)
      const topGainers = [...allStocks]
        .filter(s => s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 10);

      // Top 10 losers (跌幅榜)
      const topLosers = [...allStocks]
        .filter(s => s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 10);

      // Top 10 most active by volume (成交量榜)
      const mostActive = [...allStocks]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);

      // Top 10 by turnover rate (换手率榜)
      const highTurnover = [...allStocks]
        .sort((a, b) => b.turnoverRate - a.turnoverRate)
        .slice(0, 10);

      // Top 10 by amplitude (振幅榜)
      const highAmplitude = [...allStocks]
        .sort((a, b) => b.amplitude - a.amplitude)
        .slice(0, 10);

      res.json({
        topGainers,
        topLosers,
        mostActive,
        highTurnover,
        highAmplitude,
      });
    } catch (err) {
      console.error("Error fetching hot stocks:", err);
      res.json({ topGainers: [], topLosers: [], mostActive: [], highTurnover: [], highAmplitude: [] });
    }
  });

  // GET /api/stocks/:code - get single stock quote
  app.get("/api/stocks/:code", async (req, res) => {
    const stock = await storage.getStockByCode(req.params.code);
    if (!stock) {
      return res.status(404).json({ message: "Stock not found" });
    }
    res.json(stock);
  });

  // GET /api/stocks/:code/kline - get K-line data
  app.get("/api/stocks/:code/kline", async (req, res) => {
    const stock = await storage.getStockByCode(req.params.code);
    if (!stock) {
      return res.status(404).json({ message: "Stock not found" });
    }
    const period = req.query.period as string | undefined;
    const klines = await storage.getKlineData(req.params.code, period);
    res.json(klines);
  });

  // GET /api/stocks/:code/fundamentals - get fundamental data
  app.get("/api/stocks/:code/fundamentals", async (req, res) => {
    const data = await storage.getFundamentals(req.params.code);
    if (!data) {
      return res.status(404).json({ message: "Stock not found" });
    }
    res.json(data);
  });

  // GET /api/stocks/:code/technicals - get technical indicators
  app.get("/api/stocks/:code/technicals", async (req, res) => {
    const data = await storage.getTechnicalIndicators(req.params.code);
    if (!data) {
      return res.status(404).json({ message: "Stock not found" });
    }
    res.json(data);
  });

  // GET /api/stocks/:code/sentiment - get sentiment data
  app.get("/api/stocks/:code/sentiment", async (req, res) => {
    const data = await storage.getSentiment(req.params.code);
    if (!data) {
      return res.status(404).json({ message: "Stock not found" });
    }
    res.json(data);
  });

  // GET /api/stocks/:code/recommendation - get investment recommendation
  app.get("/api/stocks/:code/recommendation", async (req, res) => {
    const data = await storage.getRecommendation(req.params.code);
    if (!data) {
      return res.status(404).json({ message: "Stock not found" });
    }
    res.json(data);
  });

  // GET /api/market/overview - get market overview stats
  app.get("/api/market/overview", async (_req, res) => {
    const overview = await storage.getMarketOverview();
    res.json(overview);
  });

  // GET /api/industries - get list of all industries
  app.get("/api/industries", async (_req, res) => {
    const stocks = await storage.getAllStocks();
    const industrySet = new Set(stocks.map((s) => s.industry));
    const industries = Array.from(industrySet).sort();
    res.json(industries);
  });

  return httpServer;
}
