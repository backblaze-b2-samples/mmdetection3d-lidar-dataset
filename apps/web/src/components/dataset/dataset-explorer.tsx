"use client";

import { useMemo } from "react";
import { Download, Database, HardDrive } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useFiles } from "@/lib/queries";
import { getDownloadUrl } from "@/lib/api-client";
import { startBrowserDownload } from "@/lib/browser-download";
import { SAMPLE_PREFIX } from "@/lib/sample-prefix";
import type { FileMetadata } from "@mmdetection3d-lidar-dataset/shared";

// Pipeline stages, in the order data flows through them.
const STAGES: { key: string; label: string; blurb: string }[] = [
  { key: "raw", label: "Raw scans", blurb: "Ingested LiDAR frames (.bin / .pcd)" },
  { key: "preprocessed", label: "Preprocessed", blurb: "Per-frame tensors (.npz)" },
  { key: "annotations", label: "Annotations", blurb: "Per-frame 3D boxes (.json)" },
  { key: "datasets", label: "Dataset manifests", blurb: "Frame → split (.jsonl)" },
  { key: "checkpoints", label: "Checkpoints", blurb: "Archived model weights" },
  { key: "runs", label: "Run manifests", blurb: "Detection Run records" },
];

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
    toast.error("Could not fetch a download URL for that object");
  }
}

function stageOf(key: string): string {
  const rest = key.startsWith(SAMPLE_PREFIX) ? key.slice(SAMPLE_PREFIX.length) : key;
  return rest.split("/")[0] ?? "";
}

export function DatasetExplorer() {
  const { data: files, isLoading, error, refetch } = useFiles(SAMPLE_PREFIX, 1000);

  const grouped = useMemo(() => {
    const map = new Map<string, FileMetadata[]>();
    for (const f of files ?? []) {
      const stage = stageOf(f.key);
      const list = map.get(stage) ?? [];
      list.push(f);
      map.set(stage, list);
    }
    return map;
  }, [files]);

  const totalBytes = (files ?? []).reduce((acc, f) => acc + f.size_bytes, 0);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No dataset objects yet"
        description="Seed a demo sensor log (`pnpm run seed --apply`) and run detection — raw frames, annotations, previews, checkpoints, and manifests all appear here under the sample prefix."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HardDrive className="h-4 w-4" />
        <span className="font-mono tabular-nums text-foreground">{files.length}</span>{" "}
        objects · <span className="font-mono tabular-nums text-foreground">{fmtBytes(totalBytes)}</span>{" "}
        under <code>{SAMPLE_PREFIX}</code>
      </div>
      <Accordion type="multiple" defaultValue={["raw", "annotations"]} className="space-y-3">
        {STAGES.filter((s) => (grouped.get(s.key) ?? []).length > 0).map((stage) => {
          const items = grouped.get(stage.key) ?? [];
          const bytes = items.reduce((acc, f) => acc + f.size_bytes, 0);
          return (
            <Card key={stage.key}>
              <AccordionItem value={stage.key} className="border-0">
                <CardHeader className="py-0 px-5">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center justify-between pr-3">
                      <div className="text-left">
                        <CardTitle className="card-title flex items-center gap-2 text-sm">
                          {stage.label}
                          <Badge variant="secondary" className="font-normal">
                            {items.length}
                          </Badge>
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">{stage.blurb}</p>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {fmtBytes(bytes)}
                      </span>
                    </div>
                  </AccordionTrigger>
                </CardHeader>
                <AccordionContent>
                  <CardContent className="space-y-1 px-5 pb-4 pt-0">
                    {items.slice(0, 200).map((f) => (
                      <div
                        key={f.key}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {f.key.slice(SAMPLE_PREFIX.length)}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {f.size_human}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => download(f.key)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {items.length > 200 && (
                      <p className="px-2 pt-1 text-xs text-muted-foreground">
                        Showing first 200 of {items.length}.
                      </p>
                    )}
                  </CardContent>
                </AccordionContent>
              </AccordionItem>
            </Card>
          );
        })}
      </Accordion>
    </div>
  );
}
