import Link from "next/link";
import { Boxes, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LidarOverview } from "@/components/dashboard/lidar-overview";
import { ClassDistribution } from "@/components/dashboard/class-distribution";
import { RunTable } from "@/components/runs/run-table";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">LiDAR dataset overview</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">
            Ingest raw LiDAR frames, annotate them with the local MMDetection3D
            engine, and build 3D detection datasets — every scan, annotation,
            checkpoint, and manifest stored on Backblaze B2.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href="/upload">
              <Upload className="h-3.5 w-3.5" />
              Ingest frames
            </Link>
          </Button>
          <Button asChild size="sm" className="h-8">
            <Link href="/runs">
              <Boxes className="h-3.5 w-3.5" />
              New run
            </Link>
          </Button>
        </div>
      </div>

      <LidarOverview />

      <div className="grid gap-6 lg:grid-cols-2">
        <ClassDistribution />
        <Card className="animate-fade-in-up stagger-4">
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Recent detection runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RunTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
