"use client";

import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatasetExplorer } from "@/components/dataset/dataset-explorer";

export default function DatasetPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Dataset</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            A sample-scoped view of everything this app has written to B2,
            grouped by pipeline stage: raw scans, preprocessed tensors,
            annotations, checkpoints, and dataset manifests. The full-bucket{" "}
            <Link href="/files" className="underline underline-offset-2">
              Files
            </Link>{" "}
            explorer stays available alongside it.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link href="/files">
            <FolderOpen className="h-3.5 w-3.5" />
            Full-bucket Files
          </Link>
        </Button>
      </div>

      <div className="animate-fade-in-up stagger-1">
        <DatasetExplorer />
      </div>
    </div>
  );
}
