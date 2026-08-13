export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
  // LiDAR point-cloud frame (.bin / .pcd)
  point_count: number | null;
  point_dimensions: number | null;
  point_bounds: Record<string, number> | null;
  intensity_mean: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

/** A short-lived presigned PUT the browser uploads a file directly to B2 with.
 *  `headers` are signed into the URL, so the browser must send them verbatim. */
export interface PresignUploadResponse {
  key: string;
  url: string;
  method: string;
  content_type: string;
  headers: Record<string, string>;
  expires_in: number;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Detection Run domain (the sample's primary entity) ---

export type ModelName = "pointpillars" | "centerpoint" | "second";
export const MODEL_CHOICES: ModelName[] = ["pointpillars", "centerpoint", "second"];

export type TaskName = "detection" | "segmentation";
export const TASK_CHOICES: TaskName[] = ["detection", "segmentation"];

export type DeviceChoice = "auto" | "cpu" | "cuda" | "mps";
export const DEVICE_CHOICES: DeviceChoice[] = ["auto", "cpu", "cuda", "mps"];

export type RunStatus = "pending" | "running" | "done" | "error";

export interface FrameAnnotation {
  frame: string;
  raw_key: string;
  annotation_key: string;
  preview_key: string | null;
  point_count: number;
  num_boxes: number;
  label_histogram: Record<string, number>;
  split: "train" | "val";
}

export interface RunSummary {
  frame_count: number;
  total_boxes: number;
  train_frames: number;
  val_frames: number;
  per_class: Record<string, number>;
}

export interface RunRecord {
  run_id: string;
  label: string;
  sensor_id: string;
  model: ModelName;
  task: TaskName;
  score_threshold: number;
  val_split: number;
  device: DeviceChoice;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  resolved_device: string | null;
  error: string | null;
  checkpoint_key: string | null;
  manifest_key: string | null;
  source_bytes: number;
  derived_bytes: number;
  frames: FrameAnnotation[];
  summary: RunSummary | null;
}

export interface SensorLogInfo {
  sensor_id: string;
  dates: string[];
  frame_count: number;
}

export interface EngineStatus {
  available: boolean;
  device: string;
  torch_installed: boolean;
  detail: string;
}

export interface CreateRunRequest {
  label: string;
  sensor_id: string;
  model: ModelName;
  task: TaskName;
  score_threshold: number;
  val_split: number;
  device: DeviceChoice;
}

export interface UpdateRunRequest {
  label?: string;
  model?: ModelName;
  task?: TaskName;
  score_threshold?: number;
  val_split?: number;
  device?: DeviceChoice;
}
