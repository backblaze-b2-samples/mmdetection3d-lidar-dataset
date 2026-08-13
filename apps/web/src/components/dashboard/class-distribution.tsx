"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Tag } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns } from "@/lib/queries";

const chartConfig = {
  boxes: {
    label: "3D boxes",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

/**
 * Aggregate per-class 3D-box histogram across every completed run. This is the
 * dataset-balance view a labelling team cares about: which object classes the
 * detector is writing, and how the dataset skews.
 */
export function ClassDistribution() {
  const { data: runs, isLoading, error, refetch } = useRuns();

  const data = useMemo(() => {
    const totals = new Map<string, number>();
    for (const run of runs ?? []) {
      for (const [label, count] of Object.entries(run.summary?.per_class ?? {})) {
        totals.set(label, (totals.get(label) ?? 0) + count);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([label, boxes]) => ({ label: `class ${label}`, boxes }));
  }, [runs]);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Class distribution</CardTitle>
        <CardDescription className="text-xs">
          3D boxes by class, across all runs
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No annotations yet"
            description="Run detection on a sensor log to populate the per-class box histogram."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={28} />
              <ChartTooltip cursor={{ fill: "var(--accent-subtle)" }} content={<ChartTooltipContent />} />
              <Bar dataKey="boxes" fill="var(--color-boxes)" radius={[4, 4, 0, 0]} animationDuration={500} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
