"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Boxes } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIngestFrames } from "@/lib/queries";
import { createRunHref } from "@/lib/run-deep-link";

const FRAME_ACCEPT = ".bin,.pcd";
const SENSOR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isFrame(file: File): boolean {
  return /\.(bin|pcd)$/i.test(file.name);
}

/**
 * Ingest a batch of raw LiDAR frames (KITTI .bin / .pcd) as a named sensor log.
 * Each frame lands under `raw/<sensor_id>/<date>/`, the layout the detection
 * flow reads — so the sensor log becomes selectable in the create-run form.
 */
export function FrameLogForm() {
  const router = useRouter();
  const ingest = useIngestFrames();
  const [sensorId, setSensorId] = useState("");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const sensorOk = SENSOR_RE.test(sensorId);
  const filesOk = files.length > 0 && files.every(isFrame);
  const canSubmit = sensorOk && !!date && filesOk && !ingest.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!filesOk) {
      toast.error("Pick one or more KITTI .bin / .pcd frames");
      return;
    }
    ingest.mutate(
      { sensorId, date, files },
      {
        onSuccess: (res) =>
          toast.success(`Ingested ${res.frames} frame(s) into "${res.sensorId}"`, {
            // One-click hand-off: jump straight to the create-run form with this
            // sensor log preselected, so the user never has to re-find it.
            action: {
              label: "Create run →",
              onClick: () => router.push(createRunHref(res.sensorId)),
            },
          }),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          Ingest a LiDAR sensor log
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <p className="mb-4 max-w-prose text-sm text-muted-foreground text-pretty">
          Upload raw KITTI-format <code>.bin</code> (or <code>.pcd</code>) frames
          as a named sensor log. They land under{" "}
          <code>raw/&lt;sensor_id&gt;/&lt;date&gt;/</code> and become selectable on
          the{" "}
          <Link href="/runs" className="underline underline-offset-2">
            Runs
          </Link>{" "}
          create form.
        </p>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fl-sensor">Sensor id</Label>
              <Input
                id="fl-sensor"
                placeholder="e.g. demo-sensor"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                aria-invalid={sensorId.length > 0 && !sensorOk}
              />
              {sensorId.length > 0 && !sensorOk && (
                <p className="text-xs text-[var(--destructive)]">
                  1–64 chars: letters, digits, dot, dash or underscore.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fl-date">Acquisition date</Label>
              <Input
                id="fl-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fl-files">Frames (.bin / .pcd)</Label>
            <Input
              id="fl-files"
              type="file"
              multiple
              accept={FRAME_ACCEPT}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="text-xs text-muted-foreground">
              KITTI <code>.bin</code> is a flat float32 buffer (x, y, z,
              intensity). Up to 100&nbsp;MB each.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {ingest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {ingest.isPending ? "Ingesting…" : "Ingest frames"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
