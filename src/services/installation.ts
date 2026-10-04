export interface Progress {
  stage: string;
  status: "running" | "success" | "failure";
  file: string;
  completed: number;
  total: number;
  downloaded: number;
  bytes_total: number;
  percent: number;
}
export interface InstallError {
  stage: string;
  message: string;
  path?: string;
  url?: string;
  expected_hash?: string;
  actual_hash?: string;
  os_error?: number;
  causes?: string[];
}
export function diagnostics(error: unknown, stage: string): string {
  if (typeof error === "object" && error !== null)
    return JSON.stringify(error, null, 2);
  return JSON.stringify({ stage, message: String(error) }, null, 2);
}
