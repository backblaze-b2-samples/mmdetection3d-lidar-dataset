"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EngineStatusBadge } from "@/components/runs/engine-status-badge";
import { CreateRunForm } from "@/components/runs/run-form";
import { RunTable } from "@/components/runs/run-table";
import { useCreateRun } from "@/lib/queries";

export default function RunsPage() {
  const router = useRouter();
  const create = useCreateRun();

  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Detection Runs</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Each run passes a sensor log&apos;s LiDAR frames through the local
            MMDetection3D engine and writes per-frame 3D annotations, BEV
            previews, and a dataset manifest to B2 under <code>runs/</code>,{" "}
            <code>annotations/</code>, and <code>datasets/</code>.
          </p>
        </div>
        <EngineStatusBadge />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <Card className="animate-fade-in-up stagger-1 h-fit">
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">New run</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <CreateRunForm
              submitting={create.isPending}
              onSubmit={(body) =>
                create.mutate(body, {
                  onSuccess: (run) => {
                    toast.success("Run created — open it to run detection");
                    router.push(`/runs/${run.run_id}`);
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            />
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-2">
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Runs library</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RunTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
