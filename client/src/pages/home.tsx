import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, TrendingUp, TrendingDown, Flame, ArrowUpDown, Activity, Moon, Sun, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/lib/theme";
import { formatChange, formatPercent, formatVolume, formatAmount, getChangeColor } from "@/lib/format";

import type { StockQuote } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface HotStocks {
  topGainers: StockQuote[];
  topLosers: StockQuote[];
  mostActive: StockQuote[];
  highTurnover: StockQuote[];
  highAmplitude: StockQuote[];
}

function useDebounce(fn: (val: string) => void, delay: number) {
  const timerRef = useState<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((val: string) => {
    if (timerRef[0]) clearTimeout(timerRef[0]);
    const t = setTimeout(() => fn(val), delay);
    timerRef[1](t);
  }, [fn, delay]);
}

/** A compact stock row used in both search results and hot lists */
function StockRow({ stock, showExtra }: { stock: StockQuote; showExtra?: "volume" | "turnover" | "amplitude" }) {
  return (
    <Link href={`/stock/${stock.code}`}>
      <div
        className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_90px_90px_100px] gap-2 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-center"
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
          {showExtra === "turnover"
            ? `${stock.turnoverRate.toFixed(2)}%`
            : showExtra === "amplitude"
            ? `${stock.amplitude.toFixed(2)}%`
            : formatVolume(stock.volume)}
        </p>
      </div>
    </Link>
  );
}

function StockTable({ stocks, extraLabel, extraField }: {
  stocks: StockQuote[];
  extraLabel?: string;
  extraField?: "volume" | "turnover" | "amplitude";
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="hidden md:grid grid-cols-[1fr_90px_90px_90px_100px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border">
        <span>股票</span>
        <span className="text-right">最新价</span>
        <span className="text-right">涨跌幅</span>
        <span className="text-right">涨跌额</span>
        <span className="text-right">{extraLabel || "成交量"}</span>
      </div>
      {stocks.map((stock) => (
        <StockRow key={stock.code} stock={stock} showExtra={extraField} />
      ))}
      {stocks.length === 0 && (
        <div className="p-8 text-center text-muted-foreground text-sm">暂无数据</div>
      )}
    </div>
  );
}

export default function Home() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { theme, toggleTheme } = useTheme();

  const debouncedSetQuery = useDebounce(setSearchQuery, 300);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    debouncedSetQuery(val);
  };

  // Fetch hot stocks for default view
  const { data: hotStocks, isLoading: hotLoading } = useQuery<HotStocks>({
    queryKey: ["/api/stocks/hot"],
    refetchInterval: 60000, // refresh every minute
  });

  // Fetch search results only when user types
  const { data: searchResults, isLoading: searchLoading } = useQuery<StockQuote[]>({
    queryKey: ["/api/stocks/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await apiRequest("GET", `/api/stocks?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.trim().length > 0,
    staleTime: 30000, // search results stale after 30s
  });

  const { data: overview } = useQuery<{
    totalStocks: number;
    upCount: number;
    downCount: number;
    flatCount: number;
    avgChange: number;
  }>({
    queryKey: ["/api/market/overview"],
    refetchInterval: 60000,
  });

  const isSearching = searchQuery.trim().length > 0;

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
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">全部股票</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="text-total">{overview.totalStocks}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">上涨 / 平 / 下跌</p>
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="text-lg font-semibold tabular-nums text-stock-up" data-testid="text-up">{overview.upCount}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-lg font-semibold tabular-nums text-stock-flat">{overview.flatCount}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-lg font-semibold tabular-nums text-stock-down" data-testid="text-down">{overview.downCount}</span>
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-1">平均涨跌</p>
              <p className={`text-lg font-semibold tabular-nums ${getChangeColor(overview.avgChange)}`} data-testid="text-avg">
                {formatPercent(overview.avgChange)}
              </p>
            </Card>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="输入股票代码或名称搜索（如：000001、平安银行）..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-11 text-base"
            data-testid="input-search"
          />
        </div>

        {/* Search Results */}
        {isSearching ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">
                搜索结果："{searchQuery}"
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs ml-auto"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              >
                清除搜索
              </Button>
            </div>
            {searchLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="hidden md:grid grid-cols-[1fr_90px_90px_90px_100px] gap-2 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border">
                  <span>股票</span>
                  <span className="text-right">最新价</span>
                  <span className="text-right">涨跌幅</span>
                  <span className="text-right">涨跌额</span>
                  <span className="text-right">成交量</span>
                </div>
                {searchResults?.map((stock) => (
                  <StockRow key={stock.code} stock={stock} />
                ))}
                {searchResults?.length === 0 && (
                  <div className="p-12 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">未找到匹配的股票</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Hot Stocks - Default View */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <h2 className="text-base font-semibold">今日热门</h2>
            </div>

            {hotLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="gainers" className="w-full">
                <TabsList className="w-full flex overflow-x-auto">
                  <TabsTrigger value="gainers" className="flex items-center gap-1.5 flex-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    涨幅榜
                  </TabsTrigger>
                  <TabsTrigger value="losers" className="flex items-center gap-1.5 flex-1">
                    <TrendingDown className="h-3.5 w-3.5" />
                    跌幅榜
                  </TabsTrigger>
                  <TabsTrigger value="active" className="flex items-center gap-1.5 flex-1">
                    <Activity className="h-3.5 w-3.5" />
                    成交量榜
                  </TabsTrigger>
                  <TabsTrigger value="turnover" className="flex items-center gap-1.5 flex-1">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    换手率榜
                  </TabsTrigger>
                  <TabsTrigger value="amplitude" className="flex items-center gap-1.5 flex-1">
                    <Flame className="h-3.5 w-3.5" />
                    振幅榜
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="gainers" className="mt-4">
                  <StockTable stocks={hotStocks?.topGainers || []} />
                </TabsContent>
                <TabsContent value="losers" className="mt-4">
                  <StockTable stocks={hotStocks?.topLosers || []} />
                </TabsContent>
                <TabsContent value="active" className="mt-4">
                  <StockTable stocks={hotStocks?.mostActive || []} extraLabel="成交量" extraField="volume" />
                </TabsContent>
                <TabsContent value="turnover" className="mt-4">
                  <StockTable stocks={hotStocks?.highTurnover || []} extraLabel="换手率" extraField="turnover" />
                </TabsContent>
                <TabsContent value="amplitude" className="mt-4">
                  <StockTable stocks={hotStocks?.highAmplitude || []} extraLabel="振幅" extraField="amplitude" />
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
