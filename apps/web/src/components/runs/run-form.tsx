"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useSensorLogs } from "@/lib/queries";
import { readSensorIdFromUrl } from "@/lib/run-deep-link";
import type {
  CreateRunRequest,
  RunRecord,
  UpdateRunRequest,
} from "@mmdetection3d-lidar-dataset/shared";

// Finite fields (model, task, device, sensor log) are Selects, never free text.
// `label` is open-ended so it stays a text input. Create defaults
// (model=pointpillars, task=detection, threshold=0.3) are surfaced as
// FormDescription guidance, never an autofill button.
const MODEL_OPTIONS = ["pointpillars", "centerpoint", "second"] as const;
const TASK_OPTIONS = ["detection", "segmentation"] as const;
const DEVICE_OPTIONS = ["auto", "cpu", "cuda", "mps"] as const;

const createSchema = z.object({
  label: z.string().min(1, "Give the run a label").max(120),
  sensor_id: z.string().min(1, "Pick a sensor log"),
  model: z.enum(MODEL_OPTIONS),
  task: z.enum(TASK_OPTIONS),
  score_threshold: z.coerce.number().min(0).max(1),
  val_split: z.coerce.number().min(0).max(1),
  device: z.enum(DEVICE_OPTIONS),
});

const editSchema = createSchema.omit({ sensor_id: true });

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const MODEL_HINT: Record<string, string> = {
  pointpillars: "KITTI, CPU-friendly — the recommended default.",
  second: "KITTI. Uses sparse-conv (spconv) — generally needs CUDA/Linux.",
  centerpoint: "nuScenes. Uses sparse-conv (spconv) — generally needs CUDA/Linux.",
};

export function CreateRunForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (body: CreateRunRequest) => void;
}) {
  const { data: sensorLogs = [] } = useSensorLogs();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      label: "",
      sensor_id: "",
      model: "pointpillars",
      task: "detection",
      score_threshold: 0.3,
      val_split: 0.2,
      device: "auto",
    },
  });

  // Deep-link from a successful ingest: `/runs?sensor=<id>` preselects that
  // sensor log. Read the id after hydration (client-only) so it can't desync
  // SSR, but DON'T set it until the sensor-log list has actually loaded that id.
  //
  // `useSensorLogs()` is `[]` on mount, so setting `sensor_id` immediately put a
  // value into the Radix <Select> that had no matching <SelectItem> yet — Radix
  // then falls back to the placeholder and the value never "takes" (submit reads
  // empty, raising "Pick a sensor log"). Gating on the option existing means the
  // matching <SelectItem> is rendered when we set the value, so it both displays
  // and sticks; `shouldValidate` clears the pending "Pick a sensor log" error.
  //
  // The read is idempotent — it does NOT strip `?sensor=` (see run-deep-link.ts):
  // Next dev's StrictMode remounts this form, and each mount gets a fresh ref, so
  // the leftover param lets the surviving mount preselect. We apply exactly once
  // (clear the ref) so a leftover `?sensor=` never clobbers a later manual change.
  const preselectId = useRef<string | null>(null);
  useEffect(() => {
    preselectId.current = readSensorIdFromUrl();
  }, []);
  useEffect(() => {
    const id = preselectId.current;
    if (id && sensorLogs.some((s) => s.sensor_id === id)) {
      form.setValue("sensor_id", id, { shouldValidate: true, shouldTouch: true });
      preselectId.current = null;
    }
  }, [sensorLogs, form]);

  const handle = (values: CreateValues) => onSubmit(values);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="space-y-5">
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label</FormLabel>
              <FormControl>
                <Input placeholder="e.g. downtown loop — 3-class detection" {...field} />
              </FormControl>
              <FormDescription>
                A human name for this run. Try model <code>pointpillars</code>,
                task <code>detection</code>, threshold <code>0.3</code> on the
                seeded demo sensor log.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sensor_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sensor log</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an ingested sensor log" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sensorLogs.map((s) => (
                    <SelectItem key={s.sensor_id} value={s.sensor_id}>
                      {s.sensor_id} ({s.frame_count} frames)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Sensor logs come from frames in your bucket. Run{" "}
                <code>pnpm run seed --apply</code> to create the demo log, or
                ingest frames on the Ingest page.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{MODEL_HINT[field.value]}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="task"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Task</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TASK_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Detection (3D boxes) or point-wise segmentation.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="score_threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score threshold</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="font-mono tabular-nums"
                    {...field}
                  />
                </FormControl>
                <FormDescription>0–1. Default 0.3.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="val_split"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Val split</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="font-mono tabular-nums"
                    {...field}
                  />
                </FormControl>
                <FormDescription>0–1. Default 0.2.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="device"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Device</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DEVICE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>auto → CUDA else CPU.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create run"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function EditRunForm({
  run,
  submitting,
  onSubmit,
}: {
  run: RunRecord;
  submitting: boolean;
  onSubmit: (body: UpdateRunRequest) => void;
}) {
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    // Pre-filled with the run's real stored config.
    defaultValues: {
      label: run.label,
      model: run.model,
      task: run.task,
      score_threshold: run.score_threshold,
      val_split: run.val_split,
      device: run.device,
    },
  });

  const handle = (values: EditValues) => {
    if (!form.formState.isDirty) {
      toast.info("No changes to save");
      return;
    }
    onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="space-y-5">
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="task"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Task</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TASK_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="score_threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score threshold</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={1} step={0.05}
                    className="font-mono tabular-nums" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="val_split"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Val split</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={1} step={0.05}
                    className="font-mono tabular-nums" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="device"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Device</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DEVICE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormDescription>
          The sensor log is fixed at create time — a different log is a new run.
        </FormDescription>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save & re-run"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
