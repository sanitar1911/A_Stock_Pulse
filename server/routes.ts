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

  // GET /api/stocks - list all stocks with optional filtering and sorting
  app.get("/api/stocks", async (req, res) => {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      const query = parsed.success ? parsed.data : {};

      let stocks = query.q
        ? await storage.searchStocks(query.q)
        : await storage.getAllStocks();

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

      res.json(stocks);
    } catch (err) {
      console.error("Error fetching stocks:", err);
      res.json([]); // Return empty array instead of 500 while data loads
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
