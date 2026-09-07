"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart3, PieChart } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardApi, amountIn, type MonthlyCashFlowPoint, type CompanyComparisonPoint, type CategoryAnalysisPoint } from "@/features/dashboard/api";
import { formatMoney, useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";

// ─── helpers ────────────────────────────────────────────────────────────────

function monthLabel(iso: string, locale: "fr" | "en" | "ar") {
  const [year, month] = iso.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB",
    { month: "short" },
  ).format(date);
}

function compactAmount(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function ChartTooltip({ label, items }: { label: string; items: { color: string; name: string; value: string }[] }) {
  return (
    <div className="pointer-events-none absolute z-50 min-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-border/60 bg-popover px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{label}</p>
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: it.color }} />
          <span className="text-muted-foreground">{it.name}</span>
          <span className="ms-auto font-semibold text-foreground">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── MonthlyCashFlowChart ───────────────────────────────────────────────────

function MonthlyCashFlowChart({ data }: { data: MonthlyCashFlowPoint[] }) {
  const { locale } = useExperience();
  const incomes = data.map((d) => amountIn(d.income) ?? 0);
  const expenses = data.map((d) => amountIn(d.expense) ?? 0);
  const maxVal = Math.max(...incomes, ...expenses, 1);

  const W = 560;
  const H = 180;
  const PAD = { top: 12, right: 12, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const groupW = n > 0 ? chartW / n : chartW;
  const barW = Math.min(groupW * 0.35, 18);
  const gap = barW * 0.4;

  // Y-axis ticks (4 lines)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD.top + chartH * (1 - f),
    label: compactAmount(maxVal * f),
  }));

  const incomeColor = "hsl(197 100% 41%)";
  const expenseColor = "hsl(30 88% 51%)";

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full text-[10px]" aria-label={sourceText("Monthly cash flow chart")}>
        {/* Y-axis grid + labels */}
        {yTicks.map((t) => (
          <g key={t.y}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
            <text x={PAD.left - 6} y={t.y + 3} textAnchor="end" fill="currentColor" opacity={0.45} fontSize={9}>{t.label}</text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = PAD.left + i * groupW + groupW / 2;
          const incomeH = chartH * ((amountIn(d.income) ?? 0) / maxVal);
          const expenseH = chartH * ((amountIn(d.expense) ?? 0) / maxVal);
          const incomeX = cx - gap / 2 - barW;
          const expenseX = cx + gap / 2;
          return (
            <g key={d.month}>
              {/* income bar */}
              <motion.rect
                x={incomeX} y={PAD.top + chartH - incomeH} width={barW} height={incomeH}
                rx={3} fill={incomeColor}
                initial={{ scaleY: 0, originY: 1 }} animate={{ scaleY: 1 }}
                style={{ transformOrigin: `0 ${PAD.top + chartH}px` }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 280, damping: 26 }}
              />
              {/* expense bar */}
              <motion.rect
                x={expenseX} y={PAD.top + chartH - expenseH} width={barW} height={expenseH}
                rx={3} fill={expenseColor}
                initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                style={{ transformOrigin: `0 ${PAD.top + chartH}px` }}
                transition={{ delay: i * 0.04 + 0.02, type: "spring", stiffness: 280, damping: 26 }}
              />
              {/* X label */}
              <text x={cx} y={H - 6} textAnchor="middle" fill="currentColor" opacity={0.5} fontSize={9}>
                {monthLabel(d.month, locale)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: incomeColor }} />
          {sourceText("Revenue")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: expenseColor }} />
          {sourceText("Expenses")}
        </span>
      </div>
    </div>
  );
}

// ─── NetPositionLine ────────────────────────────────────────────────────────

function NetPositionLine({ data }: { data: MonthlyCashFlowPoint[] }) {
  const { locale } = useExperience();
  const nets = data.map((d) => (amountIn(d.income) ?? 0) - (amountIn(d.expense) ?? 0));
  const minVal = Math.min(...nets, 0);
  const maxVal = Math.max(...nets, 0);
  const range = maxVal - minVal || 1;

  const W = 560;
  const H = 120;
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / (data.length - 1 || 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;
  const zeroY = toY(0);

  const pts = nets.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaPath = `M${toX(0)},${zeroY} ` + nets.map((v, i) => `L${toX(i)},${toY(v)}`).join(" ") + ` L${toX(nets.length - 1)},${zeroY} Z`;

  const positiveColor = "hsl(142 71% 45%)";
  const negativeColor = "hsl(0 84% 60%)";
  const lineColor = "hsl(226 41% 58%)";

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label={sourceText("Net financial position chart")}>
        <defs>
          <linearGradient id="net-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={positiveColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={positiveColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        {/* Zero line */}
        {minVal < 0 && <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} strokeDasharray="4 3" />}
        {/* Area */}
        <motion.path d={areaPath} fill="url(#net-grad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} />
        {/* Line */}
        <motion.polyline points={pts} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        {/* Dots */}
        {nets.map((v, i) => (
          <motion.circle key={i} cx={toX(i)} cy={toY(v)} r={3}
            fill={v >= 0 ? positiveColor : negativeColor}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.6 + i * 0.03 }}
          />
        ))}
        {/* X labels */}
        {data.map((d, i) => (
          <text key={d.month} x={toX(i)} y={H - 4} textAnchor="middle" fill="currentColor" opacity={0.45} fontSize={9}>
            {monthLabel(d.month, locale)}
          </text>
        ))}
        {/* Y axis left labels */}
        {[minVal, (minVal + maxVal) / 2, maxVal].map((v, idx) => (
          <text key={idx} x={PAD.left - 6} y={toY(v) + 3} textAnchor="end" fill="currentColor" opacity={0.45} fontSize={9}>
            {compactAmount(v)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── CategoryDonut ──────────────────────────────────────────────────────────

function CategoryDonut({ data }: { data: CategoryAnalysisPoint[] }) {
  const { locale } = useExperience();
  const values = data.map((d) => Math.abs(amountIn(d.total) ?? 0));
  const total = values.reduce((s, v) => s + v, 0) || 1;

  const COLORS = [
    "hsl(226 41% 48%)",
    "hsl(197 100% 41%)",
    "hsl(30 88% 51%)",
    "hsl(142 71% 45%)",
    "hsl(280 60% 55%)",
    "hsl(0 84% 60%)",
  ];

  const R = 48;
  const CX = 60;
  const CY = 60;
  const strokeW = 18;

  let cumAngle = -90;
  const slices = values.map((v, i) => {
    const angle = (v / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    return { start, angle, color: COLORS[i % COLORS.length], label: data[i].category_name };
  });

  function arcPath(startDeg: number, angleDeg: number) {
    if (angleDeg >= 359.9) angleDeg = 359.9;
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = ((startDeg + angleDeg) * Math.PI) / 180;
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const large = angleDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  }

  const circumference = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-6">
      <svg width={120} height={120} viewBox="0 0 120 120">
        {slices.map((s, i) => {
          const dashLen = (s.angle / 360) * circumference;
          const dashOff = -(s.start + 90) / 360 * circumference;
          return (
            <motion.circle
              key={i}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeW}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={dashOff}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${dashLen} ${circumference - dashLen}` }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            />
          );
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={11} fill="currentColor" fontWeight={700}>
          {compactAmount(total)}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.5}>
          MAD
        </text>
      </svg>

      <ul className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d, i) => {
          const pct = (values[i] / total) * 100;
          return (
            <li key={d.category ?? i} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="flex-1 truncate text-muted-foreground">{d.category_name || sourceText("Uncategorized")}</span>
              <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function ChartSkeleton({ h = 200 }: { h?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="rounded" style={{ height: h / 4 }} />
      ))}
      <Skeleton className="rounded" style={{ height: h / 2 }} />
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function DashboardCharts({ company }: { company?: string }) {
  const { locale } = useExperience();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "charts", company],
    queryFn: () => dashboardApi.charts({ company, months: 8 }),
    staleTime: 5 * 60 * 1000,
  });

  if (isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {sourceText("Could not load chart data.")}
        </CardContent>
      </Card>
    );
  }

  const monthly = data?.monthly_cash_flow ?? [];
  const categories = data?.category_analysis ?? [];

  const lastMonth = monthly[monthly.length - 1];
  const lastIncome = lastMonth ? (amountIn(lastMonth.income) ?? 0) : 0;
  const lastExpense = lastMonth ? (amountIn(lastMonth.expense) ?? 0) : 0;
  const lastNet = lastIncome - lastExpense;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Monthly cash flow — spans 2 cols */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {sourceText("Monthly Cash Flow")}
              </CardTitle>
              <CardDescription className="mt-0.5 text-[11px]">
                {sourceText("Revenue vs Expenses — last 8 months")}
              </CardDescription>
            </div>
            {!isLoading && (
              <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-[11px]">
                {lastNet >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={lastNet >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
                  {lastNet >= 0 ? "+" : ""}{compactAmount(lastNet)} MAD
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton h={200} />
          ) : monthly.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{sourceText("No data yet")}</p>
          ) : (
            <MonthlyCashFlowChart data={monthly} />
          )}
        </CardContent>
      </Card>

      {/* Category analysis donut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            {sourceText("By Category")}
          </CardTitle>
          <CardDescription className="text-[11px]">{sourceText("Expenses breakdown")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton h={140} />
          ) : categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{sourceText("No data yet")}</p>
          ) : (
            <CategoryDonut data={categories} />
          )}
        </CardContent>
      </Card>

      {/* Net position line — full width */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {sourceText("Net Financial Position")}
          </CardTitle>
          <CardDescription className="text-[11px]">
            {sourceText("Revenue minus expenses per month")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton h={140} />
          ) : monthly.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{sourceText("Not enough data")}</p>
          ) : (
            <NetPositionLine data={monthly} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
