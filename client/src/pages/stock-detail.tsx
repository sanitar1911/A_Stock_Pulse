import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Moon, Sun, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { formatChange, formatPercent, formatAmount, formatVolume, getChangeColor, getScoreColor } from "@/lib/format";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import type { StockQuote, KlineData, Fundamentals, TechnicalIndicators, SentimentData, InvestmentRecommendation } from "@shared/schema";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Cell, PieChart, Pie, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Area, AreaChart, ComposedChart
} from "recharts";

export default function StockDetail() {
  const { code } = useParams<{ code: string }>();
  const { theme, toggleTheme } = useTheme();
  const klineRef = useRef<HTMLDivElement>(null);

  const { data: stock, isLoading: stockLoading } = useQuery<StockQuote>({
    queryKey: ["/api/stocks", code],
  });

  const { data: klineData } = useQuery<KlineData[]>({
    queryKey: ["/api/stocks", code, "kline"],
  });

  const { data: fundamentals } = useQuery<Fundamentals>({
    queryKey: ["/api/stocks", code, "fundamentals"],
  });

  const { data: technicals } = useQuery<TechnicalIndicators>({
    queryKey: ["/api/stocks", code, "technicals"],
  });

  const { data: sentiment } = useQuery<SentimentData>({
    queryKey: ["/api/stocks", code, "sentiment"],
  });

  const { data: recommendation } = useQuery<InvestmentRecommendation>({
    queryKey: ["/api/stocks", code, "recommendation"],
  });

  // Render TradingView-style K-line using canvas
  useEffect(() => {
    if (!klineData || !klineRef.current) return;
    const canvas = document.createElement("canvas");
    const container = klineRef.current;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 320 * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = "320px";
    container.innerHTML = "";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 320;
    const data = klineData.slice(-120); // Show last 120 days
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allPrices = data.flatMap((d) => [d.high, d.low]);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const priceRange = maxP - minP || 1;

    const isDark = theme === "dark";
    const upColor = isDark ? "hsl(0, 75%, 58%)" : "hsl(0, 80%, 50%)";
    const downColor = isDark ? "hsl(140, 55%, 50%)" : "hsl(140, 60%, 40%)";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)";
    const bgColor = isDark ? "hsl(225, 20%, 7%)" : "hsl(220, 16%, 96%)";

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Price labels
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      const price = maxP - (priceRange / 4) * i;
      ctx.fillText(price.toFixed(2), w - 4, y + 4);
    }

    // Date labels
    ctx.textAlign = "center";
    const step = Math.floor(data.length / 5);
    for (let i = 0; i < data.length; i += step) {
      const x = padding.left + (chartW / data.length) * (i + 0.5);
      ctx.fillText(data[i].date.slice(5), x, h - 6);
    }

    // Candlesticks
    const candleW = Math.max(1, (chartW / data.length) * 0.7);
    data.forEach((d, i) => {
      const x = padding.left + (chartW / data.length) * (i + 0.5);
      const isUp = d.close >= d.open;
      const color = isUp ? upColor : downColor;

      const openY = padding.top + ((maxP - d.open) / priceRange) * chartH;
      const closeY = padding.top + ((maxP - d.close) / priceRange) * chartH;
      const highY = padding.top + ((maxP - d.high) / priceRange) * chartH;
      const lowY = padding.top + ((maxP - d.low) / priceRange) * chartH;

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(1, Math.abs(closeY - openY));
      if (isUp) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      }
    });

    // MA lines
    const drawMA = (period: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      data.forEach((_, i) => {
        if (i < period - 1) return;
        const slice = data.slice(i - period + 1, i + 1);
        const avg = slice.reduce((s, d) => s + d.close, 0) / period;
        const x = padding.left + (chartW / data.length) * (i + 0.5);
        const y = padding.top + ((maxP - avg) / priceRange) * chartH;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawMA(5, isDark ? "rgba(255,180,50,0.7)" : "rgba(200,130,0,0.7)");
    drawMA(10, isDark ? "rgba(100,180,255,0.7)" : "rgba(50,120,200,0.7)");
    drawMA(20, isDark ? "rgba(200,100,255,0.7)" : "rgba(150,50,200,0.7)");

    // MA Legend
    ctx.font = "10px 'Inter', sans-serif";
    const legends = [
      { label: "MA5", color: isDark ? "rgba(255,180,50,0.9)" : "rgba(200,130,0,0.9)" },
      { label: "MA10", color: isDark ? "rgba(100,180,255,0.9)" : "rgba(50,120,200,0.9)" },
      { label: "MA20", color: isDark ? "rgba(200,100,255,0.9)" : "rgba(150,50,200,0.9)" },
    ];
    let legendX = padding.left + 8;
    legends.forEach(({ label, color }) => {
      ctx.fillStyle = color;
      ctx.fillRect(legendX, 6, 12, 3);
      ctx.fillText(label, legendX + 16, 12);
      legendX += 52;
    });
  }, [klineData, theme]);

  if (stockLoading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[320px] w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">未找到该股票</p>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>
    );
  }

  const ratingData = sentiment
    ? [
        { name: "买入", value: sentiment.buyCount, fill: "hsl(140, 60%, 45%)" },
        { name: "持有", value: sentiment.holdCount, fill: "hsl(35, 80%, 55%)" },
        { name: "卖出", value: sentiment.sellCount, fill: "hsl(0, 72%, 50%)" },
      ]
    : [];

  const radarData = recommendation
    ? [
        { subject: "基本面", score: recommendation.fundamentalScore },
        { subject: "技术面", score: recommendation.technicalScore },
        { subject: "市场情绪", score: recommendation.sentimentScore },
        { subject: "估值", score: recommendation.valuationScore },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{stock.name}</h1>
                <Badge variant="secondary" className="text-xs">{stock.industry}</Badge>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">{stock.market}{stock.code}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-detail">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {/* Price Banner */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <p className={`text-3xl font-bold tabular-nums ${getChangeColor(stock.changePercent)}`} data-testid="text-price">
              {stock.price.toFixed(2)}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-sm font-medium tabular-nums ${getChangeColor(stock.change)}`}>
                {formatChange(stock.change)}
              </span>
              <span className={`text-sm font-medium tabular-nums ${getChangeColor(stock.changePercent)}`}>
                {formatPercent(stock.changePercent)}
              </span>
              {stock.changePercent > 0 ? (
                <TrendingUp className="h-4 w-4 text-stock-up" />
              ) : stock.changePercent < 0 ? (
                <TrendingDown className="h-4 w-4 text-stock-down" />
              ) : (
                <Minus className="h-4 w-4 text-stock-flat" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <div className="flex justify-between sm:flex-col">
              <span className="text-muted-foreground text-xs">开盘</span>
              <span className="tabular-nums">{stock.open.toFixed(2)}</span>
            </div>
            <div className="flex justify-between sm:flex-col">
              <span className="text-muted-foreground text-xs">最高</span>
              <span className="tabular-nums text-stock-up">{stock.high.toFixed(2)}</span>
            </div>
            <div className="flex justify-between sm:flex-col">
              <span className="text-muted-foreground text-xs">最低</span>
              <span className="tabular-nums text-stock-down">{stock.low.toFixed(2)}</span>
            </div>
            <div className="flex justify-between sm:flex-col">
              <span className="text-muted-foreground text-xs">昨收</span>
              <span className="tabular-nums">{stock.prevClose.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "成交量", value: formatVolume(stock.volume) },
            { label: "成交额", value: formatAmount(stock.amount) },
            { label: "总市值", value: formatAmount(stock.marketCap) },
            { label: "换手率", value: `${stock.turnoverRate.toFixed(2)}%` },
            { label: "市盈率", value: stock.pe.toFixed(1) },
            { label: "市净率", value: stock.pb.toFixed(2) },
          ].map((item) => (
            <Card key={item.label} className="p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
              <p className="text-sm font-medium tabular-nums" data-testid={`text-${item.label}`}>{item.value}</p>
            </Card>
          ))}
        </div>

        {/* K-line Chart */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">K线图 (近120个交易日)</h2>
          <div ref={klineRef} className="w-full" data-testid="chart-kline" />
        </Card>

        {/* Tabs for Analysis */}
        <Tabs defaultValue="fundamental" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="fundamental" data-testid="tab-fundamental">基本面分析</TabsTrigger>
            <TabsTrigger value="technical" data-testid="tab-technical">技术指标</TabsTrigger>
            <TabsTrigger value="sentiment" data-testid="tab-sentiment">市场情绪</TabsTrigger>
            <TabsTrigger value="recommendation" data-testid="tab-recommendation">投资评级</TabsTrigger>
          </TabsList>

          {/* Fundamental Analysis */}
          <TabsContent value="fundamental" className="space-y-4 mt-4">
            {fundamentals && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "营业收入", value: `${fundamentals.revenue.toFixed(2)}亿`, sub: `同比 ${formatPercent(fundamentals.revenueYoy)}`, color: getChangeColor(fundamentals.revenueYoy) },
                    { label: "净利润", value: `${fundamentals.netProfit.toFixed(2)}亿`, sub: `同比 ${formatPercent(fundamentals.netProfitYoy)}`, color: getChangeColor(fundamentals.netProfitYoy) },
                    { label: "毛利率", value: `${fundamentals.grossMargin.toFixed(1)}%`, sub: `净利率 ${fundamentals.netMargin.toFixed(1)}%`, color: "" },
                    { label: "ROE", value: `${fundamentals.roe.toFixed(1)}%`, sub: `EPS ${fundamentals.eps.toFixed(2)}`, color: "" },
                  ].map((item) => (
                    <Card key={item.label} className="p-4">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-semibold tabular-nums mt-1">{item.value}</p>
                      <p className={`text-xs tabular-nums mt-0.5 ${item.color || "text-muted-foreground"}`}>{item.sub}</p>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: "总资产", value: `${fundamentals.totalAssets.toFixed(1)}亿` },
                    { label: "资产负债率", value: `${fundamentals.debtRatio.toFixed(1)}%` },
                    { label: "每股净资产", value: `${fundamentals.bvps.toFixed(2)}` },
                    { label: "经营现金流", value: `${fundamentals.operatingCashFlow.toFixed(2)}亿` },
                    { label: "自由现金流", value: `${fundamentals.freeCashFlow.toFixed(2)}亿` },
                    { label: "总负债", value: `${fundamentals.totalDebt.toFixed(1)}亿` },
                  ].map((item) => (
                    <Card key={item.label} className="p-3 flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-medium tabular-nums">{item.value}</span>
                    </Card>
                  ))}
                </div>

                {/* Revenue & Profit Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">季度营收趋势 (亿元)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={fundamentals.quarterlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">季度净利润趋势 (亿元)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={fundamentals.quarterlyProfit}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                          {fundamentals.quarterlyProfit.map((entry, index) => (
                            <Cell key={index} fill={entry.value >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Technical Indicators */}
          <TabsContent value="technical" className="space-y-4 mt-4">
            {technicals && (
              <>
                {/* Signal Summary */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">综合信号</h3>
                    <Badge
                      variant={technicals.signalSummary.includes("买入") ? "default" : technicals.signalSummary.includes("卖出") ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {technicals.signalSummary}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">均线信号</span>
                      <Badge variant="outline">{technicals.maSignal}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">震荡指标</span>
                      <Badge variant="outline">{technicals.oscillatorSignal}</Badge>
                    </div>
                  </div>
                </Card>

                {/* Moving Averages */}
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-3">均线系统</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "MA5", value: technicals.ma5, period: 5 },
                      { label: "MA10", value: technicals.ma10, period: 10 },
                      { label: "MA20", value: technicals.ma20, period: 20 },
                      { label: "MA60", value: technicals.ma60, period: 60 },
                    ].map((ma) => {
                      const diff = stock ? ((stock.price - ma.value) / ma.value) * 100 : 0;
                      return (
                        <div key={ma.label} className="p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-muted-foreground">{ma.label}</span>
                            {diff > 0 ? (
                              <TrendingUp className="h-3 w-3 text-stock-up" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-stock-down" />
                            )}
                          </div>
                          <p className="text-sm font-medium tabular-nums">{ma.value.toFixed(2)}</p>
                          <p className={`text-xs tabular-nums ${getChangeColor(diff)}`}>
                            {diff > 0 ? "+" : ""}{diff.toFixed(2)}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* MACD, RSI, KDJ, BOLL */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">MACD</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">DIF</span>
                        <span className={`tabular-nums ${getChangeColor(technicals.macdDIF)}`}>{technicals.macdDIF.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">DEA</span>
                        <span className={`tabular-nums ${getChangeColor(technicals.macdDEA)}`}>{technicals.macdDEA.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">MACD柱</span>
                        <span className={`tabular-nums font-medium ${getChangeColor(technicals.macdHistogram)}`}>{technicals.macdHistogram.toFixed(3)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {technicals.macdDIF > technicals.macdDEA ? "DIF在DEA上方，金叉信号" : "DIF在DEA下方，死叉信号"}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">RSI 相对强弱指标</h3>
                    <div className="space-y-3">
                      {[
                        { label: "RSI(6)", value: technicals.rsi6 },
                        { label: "RSI(12)", value: technicals.rsi12 },
                        { label: "RSI(24)", value: technicals.rsi24 },
                      ].map((rsi) => (
                        <div key={rsi.label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">{rsi.label}</span>
                            <span className={`tabular-nums ${rsi.value > 70 ? "text-stock-up" : rsi.value < 30 ? "text-stock-down" : ""}`}>
                              {rsi.value.toFixed(1)}
                            </span>
                          </div>
                          <Progress value={rsi.value} className="h-1.5" />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        {technicals.rsi6 > 80 ? "超买区间，注意回调风险" : technicals.rsi6 < 20 ? "超卖区间，可能存在反弹机会" : "正常区间"}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">KDJ 随机指标</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">K值</span>
                        <span className="tabular-nums">{technicals.kdjK.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">D值</span>
                        <span className="tabular-nums">{technicals.kdjD.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">J值</span>
                        <span className={`tabular-nums font-medium ${technicals.kdjJ > 100 ? "text-stock-up" : technicals.kdjJ < 0 ? "text-stock-down" : ""}`}>
                          {technicals.kdjJ.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {technicals.kdjK > technicals.kdjD ? "K线在D线上方，短期看多" : "K线在D线下方，短期看空"}
                      </p>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">布林带 (BOLL)</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">上轨</span>
                        <span className="tabular-nums">{technicals.bollUpper.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">中轨</span>
                        <span className="tabular-nums font-medium">{technicals.bollMiddle.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">下轨</span>
                        <span className="tabular-nums">{technicals.bollLower.toFixed(2)}</span>
                      </div>
                      {stock && (
                        <p className="text-xs text-muted-foreground mt-2">
                          当前价位于布林带{stock.price > technicals.bollUpper ? "上方 (超买)" : stock.price < technicals.bollLower ? "下方 (超卖)" : stock.price > technicals.bollMiddle ? "中上区间" : "中下区间"}
                        </p>
                      )}
                    </div>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Sentiment */}
          <TabsContent value="sentiment" className="space-y-4 mt-4">
            {sentiment && (
              <>
                {/* Sentiment Score */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-4">市场情绪指数</h3>
                    <div className="flex items-center gap-6">
                      <div className="relative w-28 h-28">
                        <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                          <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                          <circle
                            cx="60" cy="60" r="52" fill="none"
                            stroke={sentiment.sentimentScore >= 60 ? "hsl(var(--chart-2))" : sentiment.sentimentScore >= 40 ? "hsl(var(--chart-3))" : "hsl(var(--chart-5))"}
                            strokeWidth="8"
                            strokeDasharray={`${(sentiment.sentimentScore / 100) * 326.73} 326.73`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold tabular-nums">{sentiment.sentimentScore}</span>
                        </div>
                      </div>
                      <div>
                        <Badge variant={
                          sentiment.sentimentLabel.includes("贪婪") ? "default" :
                          sentiment.sentimentLabel.includes("恐惧") ? "destructive" : "secondary"
                        } className="mb-2">
                          {sentiment.sentimentLabel}
                        </Badge>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {sentiment.sentimentScore >= 60 ? "市场情绪偏乐观，需注意追高风险。" :
                           sentiment.sentimentScore >= 40 ? "市场情绪中性，可根据基本面决策。" :
                           "市场情绪偏悲观，可能存在逆向投资机会。"}
                        </p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-4">分析师评级</h3>
                    <div className="flex items-center gap-6">
                      <div className="w-28 h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={ratingData} cx="50%" cy="50%" innerRadius={28} outerRadius={48} dataKey="value" stroke="none">
                              {ratingData.map((entry, index) => (
                                <Cell key={index} fill={entry.fill} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        <Badge variant="outline" className="mb-1">
                          一致评级: {sentiment.consensusRating}
                        </Badge>
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(140,60%,45%)" }} />
                            <span>买入 {sentiment.buyCount}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(35,80%,55%)" }} />
                            <span>持有 {sentiment.holdCount}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(0,72%,50%)" }} />
                            <span>卖出 {sentiment.sellCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 p-2 rounded bg-muted/30 flex justify-between text-sm">
                      <span className="text-muted-foreground">目标价</span>
                      <span className="tabular-nums font-medium">
                        {sentiment.targetPrice.toFixed(2)} ({formatPercent(sentiment.targetUpside)})
                      </span>
                    </div>
                  </Card>
                </div>

                {/* Capital Flow */}
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-3">资金流向 (亿元)</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">主力净流入</p>
                      <p className={`text-lg font-semibold tabular-nums ${getChangeColor(sentiment.mainNetInflow)}`}>
                        {sentiment.mainNetInflow > 0 ? "+" : ""}{sentiment.mainNetInflow.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">散户净流入</p>
                      <p className={`text-lg font-semibold tabular-nums ${getChangeColor(sentiment.retailNetInflow)}`}>
                        {sentiment.retailNetInflow > 0 ? "+" : ""}{sentiment.retailNetInflow.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">北向资金</p>
                      <p className={`text-lg font-semibold tabular-nums ${getChangeColor(sentiment.northboundFlow)}`}>
                        {sentiment.northboundFlow > 0 ? "+" : ""}{sentiment.northboundFlow.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Recent News */}
                <Card className="p-4">
                  <h3 className="text-sm font-semibold mb-3">相关资讯</h3>
                  <div className="space-y-2">
                    {sentiment.newsItems.map((news, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30">
                        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          news.sentiment === "positive" ? "bg-stock-up" :
                          news.sentiment === "negative" ? "bg-stock-down" : "bg-muted-foreground"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed">{news.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{news.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Recommendation */}
          <TabsContent value="recommendation" className="space-y-4 mt-4">
            {recommendation && (
              <>
                {/* Overall Score */}
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative w-36 h-36">
                      <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
                        <circle
                          cx="60" cy="60" r="52" fill="none"
                          stroke={recommendation.overallScore >= 70 ? "hsl(140,60%,45%)" : recommendation.overallScore >= 40 ? "hsl(35,80%,55%)" : "hsl(0,72%,50%)"}
                          strokeWidth="10"
                          strokeDasharray={`${(recommendation.overallScore / 100) * 326.73} 326.73`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold tabular-nums ${getScoreColor(recommendation.overallScore)}`}>
                          {recommendation.overallScore}
                        </span>
                        <span className="text-xs text-muted-foreground">综合评分</span>
                      </div>
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <Badge
                        className="text-base px-4 py-1.5 mb-3"
                        variant={recommendation.recommendation.includes("推荐") && !recommendation.recommendation.includes("不") ? "default" : recommendation.recommendation.includes("不推荐") ? "destructive" : "secondary"}
                      >
                        {recommendation.recommendation}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        基于基本面、技术面、市场情绪和估值等多维度综合分析
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Dimension Scores */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-4">多维度评分</h3>
                    <div className="space-y-4">
                      {[
                        { label: "基本面", score: recommendation.fundamentalScore },
                        { label: "技术面", score: recommendation.technicalScore },
                        { label: "市场情绪", score: recommendation.sentimentScore },
                        { label: "估值水平", score: recommendation.valuationScore },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className={`font-medium tabular-nums ${getScoreColor(item.score)}`}>{item.score}/100</span>
                          </div>
                          <Progress value={item.score} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-4">评分雷达图</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Radar name="评分" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                {/* Reasons & Risks */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-stock-down" />
                      投资亮点
                    </h3>
                    <ul className="space-y-2">
                      {recommendation.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-stock-down mt-1.5 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-stock-up" />
                      风险提示
                    </h3>
                    <ul className="space-y-2">
                      {recommendation.risks.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-stock-up mt-1.5 shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>

                {/* Disclaimer */}
                <Card className="p-3 bg-muted/30">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      以上分析仅供参考，不构成投资建议。投资有风险，入市需谨慎。所有数据为模拟数据，不代表实际市场行情。
                    </p>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        <PerplexityAttribution />
      </main>
    </div>
  );
}
