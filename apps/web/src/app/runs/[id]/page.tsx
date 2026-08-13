"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunDetail } from "@/components/runs/run-detail";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params?.id;

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost" className="-ml-2">
        <Link href="/runs">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to runs
        </Link>
      </Button>
      {runId && <RunDetail runId={runId} />}
    </div>
  );
}
