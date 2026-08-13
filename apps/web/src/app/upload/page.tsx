import { FrameLogForm } from "@/components/upload/frame-log-form";
import { UploadForm } from "@/components/upload/upload-form";

export default function IngestPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest LiDAR frames</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Upload raw LiDAR point-cloud frames (KITTI <code>.bin</code> /{" "}
          <code>.pcd</code>) straight to Backblaze B2 as a named sensor log, then
          create a Detection Run to annotate them with MMDetection3D. Up
          to&nbsp;100&nbsp;MB per file.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-1">
        <FrameLogForm />
      </div>
      <div className="animate-fade-in-up stagger-2 space-y-2">
        <p className="max-w-prose text-sm text-muted-foreground text-pretty">
          Or drop individual files into the full-bucket uploader below (any
          supported type). Files here land in a flat <code>uploads/</code>{" "}
          prefix — use the sensor-log form above to feed the detection flow.
        </p>
        <UploadForm />
      </div>
    </div>
  );
}
