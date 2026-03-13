import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, TrendingUp, TrendingDown, Minus, Moon, Sun, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/lib/theme";
import { formatChange, formatPercent, formatVolume, formatAmount, getChangeColor } from "@/lib/format";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import type { StockQuote } from "@shared/schema";

export default function Home() {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const { theme, toggleTheme } = useTheme();

  const { data: stocks, isLoading } = useQuery<StockQuote[]>({
    queryKey: ["/api/stocks"],
    refetchInterval: 30000,
  });

  const { data: industries } = useQuery<string[]>({
    queryKey: ["/api/industries"],
  });

  const { data: overview } = useQuery<{
    totalStocks: number;
    upCount: number;
    downCount: number;
    flatCount: number;
    avgChange: number;
  }>({
    queryKey: ["/api/market/overview"],
  });

  const filtered = stocks
    ?.filter((s) => {
      const q = search.toLowerCase();
      if (q && !s.code.includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (industry !== "all" && s.industry !== industry) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "change_desc": return b.changePercent - a.changePercent;
        case "change_asc": return a.changePercent - b.changePercent;
        case "volume": return b.volume - a.volume;
        case "marketCap": return b.marketCap - a.marketCap;
        case "pe": return a.pe - b.pe;
        default: return 0;
      }
    });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="A股分析">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 22L12 14L16 18L20 10L24 16" stroke="hsl(217 72% 50%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="14" r="2" fill="hsl(217 72% 50%)"/>
              <circle cx="20" cy="10" r="2" fill="hsl(0 72% 50%)"/>
            </svg>
            <h1 className="text-lg font-semibold tracking-tight">A股投资分析</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="theme-toggle"
            aria-label={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {/* Market Overview */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">全部股票</p>
              <p className="text-xl font-semibold tabular-nums" data-testid="text-total">{overview.totalStocks}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">上涨 / 平 / 下跌</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums text-stock-up" data-testid="text-up">{overview.upCount}</span>
                <span className="text-sm text-stock-flat">/</span>
                <span className="text-xl font-semibold tabular-nums text-stock-flat">{overview.flatCount}</span>
                <span className="text-sm text-stock-flat">/</span>
                <span className="text-xl font-semibold tabular-nums text-stock-down" data-testid="text-down">{overview.downCount}</span>
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">平均涨跌</p>
              <p className={`text-xl font-semibold tabular-nums ${getChangeColor(overview.avgChange)}`} data-testid="text-avg">
                {formatPercent(overview.avgChange)}
              </p>
            </Card>
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索股票代码或名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-industry">
              <SelectValue placeholder="行业筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部行业</SelectItem>
              {industries?.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-sort">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认排序</SelectItem>
              <SelectItem value="change_desc">涨幅排序</SelectItem>
              <SelectItem value="change_asc">跌幅排序</SelectItem>
              <SelectItem value="volume">成交量排序</SelectItem>
              <SelectItem value="marketCap">市值排序</SelectItem>
              <SelectItem value="pe">市盈率排序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stock List */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_100px_100px_80px_80px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border">
              <span>股票</span>
              <span className="text-right">最新价</span>
              <span className="text-right">涨跌幅</span>
              <span className="text-right">涨跌额</span>
              <span className="text-right">成交量</span>
              <span className="text-right">市值(亿)</span>
              <span className="text-right">PE</span>
              <span className="text-right">PB</span>
            </div>
            {/* Stock Rows */}
            {filtered?.map((stock) => (
              <Link key={stock.code} href={`/stock/${stock.code}`}>
                <div
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_100px_100px_100px_100px_80px_80px] gap-2 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-center"
                  data-testid={`row-stock-${stock.code}`}
                >
                  {/* Name & Code */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 text-primary shrink-0">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{stock.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground tabular-nums">{stock.market}{stock.code}</span>
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">{stock.industry}</Badge>
                      </div>
                    </div>
                  </div>
                  {/* Mobile: Price & Change */}
                  <div className="md:hidden text-right">
                    <p className={`font-medium tabular-nums ${getChangeColor(stock.changePercent)}`}>
                      {stock.price.toFixed(2)}
                    </p>
                    <p className={`text-xs tabular-nums ${getChangeColor(stock.changePercent)}`}>
                      {formatPercent(stock.changePercent)}
                    </p>
                  </div>
                  {/* Desktop columns */}
                  <p className={`hidden md:block text-right font-medium tabular-nums text-sm ${getChangeColor(stock.changePercent)}`}>
                    {stock.price.toFixed(2)}
                  </p>
                  <p className={`hidden md:block text-right tabular-nums text-sm ${getChangeColor(stock.changePercent)}`}>
                    {formatPercent(stock.changePercent)}
                  </p>
                  <p className={`hidden md:block text-right tabular-nums text-sm ${getChangeColor(stock.change)}`}>
                    {formatChange(stock.change)}
                  </p>
                  <p className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
                    {formatVolume(stock.volume)}
                  </p>
                  <p className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
                    {formatAmount(stock.marketCap)}
                  </p>
                  <p className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
                    {stock.pe.toFixed(1)}
                  </p>
                  <p className="hidden md:block text-right text-sm tabular-nums text-muted-foreground">
                    {stock.pb.toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
            {filtered?.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">未找到匹配的股票</p>
              </div>
            )}
          </div>
        )}

        <PerplexityAttribution />
      </main>
    </div>
  );
}
