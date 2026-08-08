export interface ProcessRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  secrets?: readonly string[];
}

export interface ProcessResult {
  executable: string;
  args: readonly string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ProcessRunner { run(request: ProcessRequest): Promise<ProcessResult>; }
