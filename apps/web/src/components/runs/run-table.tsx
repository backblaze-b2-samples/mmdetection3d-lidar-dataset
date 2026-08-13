"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useRuns } from "@/lib/queries";
import type { RunRecord, RunStatus } from "@mmdetection3d-lidar-dataset/shared";

function StatusBadge({ status }: { status: RunStatus }) {
  const variant =
    status === "done"
      ? "default"
      : status === "error"
        ? "destructive"
        : status === "running"
          ? "outline"
          : "secondary";
  return (
    <Badge variant={variant} className="font-normal capitalize">
      {status}
    </Badge>
  );
}

export function RunTable() {
  const { data: runs, isLoading, error, refetch } = useRuns();

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No detection runs yet"
        description="Create a run above to detect 3D objects across a sensor log's LiDAR frames. Its manifest, per-frame annotations, and dataset manifest are stored in B2."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Sensor log</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="hidden md:table-cell">Task</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Frames</TableHead>
          <TableHead className="text-right">3D boxes</TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run: RunRecord) => (
          <TableRow key={run.run_id}>
            <TableCell className="font-medium">{run.label}</TableCell>
            <TableCell className="font-mono text-xs">{run.sensor_id}</TableCell>
            <TableCell className="font-mono text-xs">{run.model}</TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
              {run.task}
            </TableCell>
            <TableCell>
              <StatusBadge status={run.status} />
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {run.summary ? run.summary.frame_count : "—"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {run.summary ? run.summary.total_boxes : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button asChild size="sm" variant="ghost">
                <Link href={`/runs/${run.run_id}`}>Open</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
