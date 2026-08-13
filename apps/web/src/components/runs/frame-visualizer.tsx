"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePreviewUrl } from "@/lib/queries";
import type { FrameAnnotation } from "@mmdetection3d-lidar-dataset/shared";

function BevPreview({ objectKey }: { objectKey: string }) {
  // Reuse the bucket explorer's inline-preview presign endpoint for the BEV PNG.
  const { data, isLoading } = usePreviewUrl(objectKey, true);
  return (
    <div className="aspect-square w-full overflow-hidden rounded-md border border-border bg-black">
      {isLoading || !data?.url ? (
        <Skeleton className="h-full w-full" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.url}
          alt="Bird's-eye-view point cloud preview"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/**
 * One frame's annotation: the bird's-eye-view preview (height-coloured) plus a
 * summary of the 3D boxes the detector wrote. The authoritative per-frame
 * annotation JSON lives alongside these in B2 and is linked from the detail.
 */
export function FrameVisualizer({ frame }: { frame: FrameAnnotation }) {
  const labels = Object.entries(frame.label_histogram);
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
      {frame.preview_key ? (
        <BevPreview objectKey={frame.preview_key} />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
          No preview
        </div>
      )}
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-4 text-muted-foreground">
          <span>
            <span className="font-mono tabular-nums text-foreground">
              {frame.point_count.toLocaleString()}
            </span>{" "}
            points
          </span>
          <span>
            <span className="font-mono tabular-nums text-foreground">
              {frame.num_boxes}
            </span>{" "}
            3D boxes
          </span>
          <Badge variant="outline" className="font-normal capitalize">
            {frame.split}
          </Badge>
        </div>
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {labels.map(([label, count]) => (
              <Badge key={label} variant="secondary" className="font-normal">
                class {label}: {count}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No boxes above the score threshold on this frame — the annotation
            still records the geometry stats + split. (KITTI-trained models often
            find nothing on synthetic demo frames.)
          </p>
        )}
      </div>
    </div>
  );
}
