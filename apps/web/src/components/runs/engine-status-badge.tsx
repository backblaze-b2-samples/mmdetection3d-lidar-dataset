"use client";

import { Cpu, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEngineStatus } from "@/lib/queries";

/**
 * Live badge for the local MMDetection3D engine. Green when the OpenMMLab 3D
 * stack is importable, muted when it isn't (a run then fails loudly with an
 * install hint — never a fake-green result). Also shows the resolved device.
 */
export function EngineStatusBadge() {
  const { data, isLoading } = useEngineStatus();

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 font-normal">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking engine…
      </Badge>
    );
  }

  const available = data?.available ?? false;
  const device = data?.device ?? "cpu";
  const detail =
    data?.detail ??
    "Engine status unknown. Install it with `pnpm run setup:mmdet3d-engine`.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={available ? "default" : "secondary"}
          className="gap-1.5 font-normal"
        >
          {available ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <CircleSlash className="h-3 w-3" />
          )}
          {available ? "MMDetection3D ready" : "Engine not installed"}
          <span className="mx-0.5 opacity-40">·</span>
          <Cpu className="h-3 w-3" />
          {device}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}
