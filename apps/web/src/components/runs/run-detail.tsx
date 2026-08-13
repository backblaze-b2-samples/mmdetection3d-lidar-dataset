"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  RefreshCw,
  Pencil,
  Trash2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EngineStatusBadge } from "./engine-status-badge";
import { EditRunForm } from "./run-form";
import { FrameVisualizer } from "./frame-visualizer";
import {
  useRun,
  useExecuteRun,
  useUpdateRun,
  useDeleteRun,
  useSensorLogs,
  useRunProgress,
} from "@/lib/queries";
import { getDownloadUrl } from "@/lib/api-client";
import { startBrowserDownload } from "@/lib/browser-download";
import {
  frameProgressLabel,
  frameProgressPercent,
  runProgressLabel,
} from "@/lib/run-progress-label";
import type { RunRecord } from "@mmdetection3d-lidar-dataset/shared";

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function download(key: string) {
  try {
    const { url } = await getDownloadUrl(key);
    startBrowserDownload(url, key.split("/").pop());
  } catch {
    toast.error("Could not fetch a download URL for that artifact");
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="stat-value mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function Actions({ run }: { run: RunRecord }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const execute = useExecuteRun(run.run_id);
  const update = useUpdateRun(run.run_id);
  const del = useDeleteRun();

  const hasRun = run.status === "done" || run.status === "error";
  const busy = execute.isPending || run.status === "running";

  const onExecute = () =>
    execute.mutate(undefined, {
      onSuccess: (r) =>
        r.status === "done"
          ? toast.success("Run complete")
          : toast.warning(r.error ?? "Run finished with errors"),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onExecute} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : hasRun ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {busy ? "Running…" : hasRun ? "Re-run" : "Run detection"}
      </Button>

      <Button variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>

      <Button
        variant="outline"
        className="text-[var(--destructive)]"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit run</DialogTitle>
            <DialogDescription>
              Change the model, task, thresholds, or label, then re-run.
            </DialogDescription>
          </DialogHeader>
          <EditRunForm
            run={run}
            submitting={update.isPending || execute.isPending}
            onSubmit={(body) =>
              update.mutate(body, {
                onSuccess: () => {
                  setEditOpen(false);
                  toast.success("Run updated — re-running");
                  onExecute();
                },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this run?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes only this run&apos;s derived artifacts in
              B2 (manifest under <code>runs/{run.run_id}/</code>, plus{" "}
              <code>annotations/</code>, <code>preprocessed/</code>, and the
              dataset <code>manifest.jsonl</code>). Raw source frames, archived
              checkpoints, and other runs are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                del.mutate(run.run_id, {
                  onSuccess: (res) => {
                    toast.success(`Deleted ${res.objects} object(s)`);
                    router.push("/runs");
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RunProgress({
  runId,
  sensorId,
  device,
}: {
  runId: string;
  sensorId: string;
  device: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  // Cheap, cached read (already fetched by the runs list + create form). Gives
  // the determinate denominator (total frames) — no per-frame B2 write, so
  // write-amplification is untouched.
  const { data: sensorLogs } = useSensorLogs();
  const total = sensorLogs?.find((s) => s.sensor_id === sensorId)?.frame_count;
  // Advancing numerator: the annotation objects already written for this run.
  // This card only mounts while status === "running", so the poll is on here
  // and stops the moment the run settles and the card unmounts.
  const { data: processed } = useRunProgress(runId, true);
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const frameLabel = frameProgressLabel(processed, total);
  const pct = frameProgressPercent(processed, total);
  return (
    <Card aria-live="polite">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {runProgressLabel(total, device)}
          </p>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {elapsed}s elapsed
          </span>
        </div>
        {/* Determinate bar (width = frames done / total) once the first frame's
            annotation lands; an indeterminate pulse until then. */}
        {pct === null ? (
          <div className="h-1.5 w-full animate-pulse rounded-full bg-primary/40" />
        ) : (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Loading the model then annotating each frame. This page updates
            automatically when the run finishes.
          </p>
          {frameLabel && (
            <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
              {frameLabel}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const { data: run, isLoading, error, refetch } = useRun(runId);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !run) return <Skeleton className="h-64 w-full" />;

  const amp =
    run.source_bytes > 0 ? (run.derived_bytes / run.source_bytes).toFixed(2) : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="page-title">{run.label}</h1>
            <Badge variant="secondary" className="capitalize font-normal">
              {run.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            log <code>{run.sensor_id}</code> · model <code>{run.model}</code> ·
            task <code>{run.task}</code> · threshold {run.score_threshold} ·
            device <code>{run.resolved_device ?? run.device}</code>
          </p>
        </div>
        <EngineStatusBadge />
      </div>

      <Actions run={run} />

      {run.status === "running" && (
        <RunProgress
          runId={run.run_id}
          sensorId={run.sensor_id}
          device={run.resolved_device ?? run.device}
        />
      )}

      {run.status === "error" && run.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}

      {run.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Frames" value={String(run.summary.frame_count)} />
          <StatCard label="3D boxes" value={String(run.summary.total_boxes)} />
          <StatCard
            label="Train / Val"
            value={`${run.summary.train_frames} / ${run.summary.val_frames}`}
          />
          <StatCard
            label="Write amplification"
            value={`${amp}× (${fmtBytes(run.derived_bytes)} derived)`}
          />
        </div>
      )}

      {(run.manifest_key || run.checkpoint_key) && (
        <div className="flex flex-wrap gap-2">
          {run.manifest_key && (
            <Button variant="outline" size="sm" onClick={() => download(run.manifest_key!)}>
              <Download className="h-3.5 w-3.5" />
              Dataset manifest (JSONL)
            </Button>
          )}
          {run.checkpoint_key && (
            <Button variant="outline" size="sm" onClick={() => download(run.checkpoint_key!)}>
              <Download className="h-3.5 w-3.5" />
              Checkpoint record
            </Button>
          )}
        </div>
      )}

      {run.frames.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No results yet"
          description="Run detection to generate per-frame 3D annotations, BEV previews, and a dataset manifest — written back to B2 alongside the raw frames."
        />
      ) : (
        <div className="space-y-4">
          {run.frames.map((frame) => (
            <Card key={frame.frame}>
              <CardHeader className="border-b border-border py-3 px-5">
                <CardTitle className="card-title font-mono text-sm">
                  {frame.frame}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <FrameVisualizer frame={frame} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
