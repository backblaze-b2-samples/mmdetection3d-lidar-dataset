"use client";

import { Boxes, Layers, Tag, HardDrive, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRuns, useSensorLogs, useFileStats } from "@/lib/queries";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  loading,
  i,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  loading: boolean;
  i: number;
}) {
  return (
    <Card className={`card-hover animate-fade-in-up stagger-${i + 1}`}>
      <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground">
          {title}
        </CardTitle>
        <div className="stat-icon-wrap">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="pb-5 px-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="stat-value">{value}</div>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

/**
 * LiDAR dataset overview. The headline story is WRITE AMPLIFICATION: every run
 * writes per-frame annotations, previews, preprocessed tensors, and a dataset
 * manifest back next to the raw scans, so derived bytes climb past source bytes
 * over time — all on S3-compatible B2.
 */
export function LidarOverview() {
  const runsQ = useRuns();
  const logsQ = useSensorLogs();
  const statsQ = useFileStats();

  const runs = runsQ.data ?? [];
  const logs = logsQ.data ?? [];

  const framesIngested = logs.reduce((acc, s) => acc + s.frame_count, 0);
  const runsDone = runs.filter((r) => r.status === "done").length;
  const annotations = runs.reduce((acc, r) => acc + (r.summary?.frame_count ?? 0), 0);
  const totalBoxes = runs.reduce((acc, r) => acc + (r.summary?.total_boxes ?? 0), 0);
  const sourceBytes = runs.reduce((acc, r) => acc + (r.source_bytes ?? 0), 0);
  const derivedBytes = runs.reduce((acc, r) => acc + (r.derived_bytes ?? 0), 0);
  const amp = sourceBytes > 0 ? (derivedBytes / sourceBytes).toFixed(2) : "—";

  const loading = runsQ.isLoading || logsQ.isLoading;

  const cards = [
    {
      title: "Frames ingested",
      value: String(framesIngested),
      icon: Layers,
      hint: `${logs.length} sensor log(s)`,
    },
    {
      title: "Runs completed",
      value: String(runsDone),
      icon: Boxes,
      hint: `${runs.length} total`,
    },
    {
      title: "3D boxes",
      value: String(totalBoxes),
      icon: Tag,
      hint: `${annotations} frame annotations`,
    },
    {
      title: "Write amplification",
      value: `${amp}×`,
      icon: Scale,
      hint: `${fmtBytes(derivedBytes)} derived / ${fmtBytes(sourceBytes)} source`,
    },
    {
      title: "Storage used",
      value: statsQ.data?.total_size_human ?? "—",
      icon: HardDrive,
      hint: `${statsQ.data?.total_files ?? 0} objects in bucket`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c, i) => (
        <StatCard
          key={c.title}
          i={i}
          loading={loading && c.title !== "Storage used"}
          title={c.title}
          value={c.value}
          icon={c.icon}
          hint={c.hint}
        />
      ))}
    </div>
  );
}
