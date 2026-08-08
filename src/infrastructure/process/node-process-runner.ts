import { spawn } from "node:child_process";
import { HexoSendError, redact } from "../../domain/errors";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../ports/process-runner";

const MAX_CAPTURE = 1_000_000;

export class NodeProcessRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.signal?.aborted) throw new HexoSendError("CANCELLED", "操作已取消");
    const started = Date.now();
    return await new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env, ...request.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const append = (current: string, data: Buffer) => (current + data.toString("utf8")).slice(-MAX_CAPTURE);
      child.stdout.on("data", (data: Buffer) => { stdout = append(stdout, data); });
      child.stderr.on("data", (data: Buffer) => { stderr = append(stderr, data); });

      const finishError = (error: HexoSendError) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const terminate = () => {
        if (child.pid && process.platform === "win32") {
          const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          killer.unref();
        } else child.kill("SIGTERM");
      };
      const onAbort = () => { terminate(); finishError(new HexoSendError("CANCELLED", "操作已取消")); };
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = request.timeoutMs ? setTimeout(() => {
        terminate();
        finishError(new HexoSendError("PROCESS_TIMEOUT", `${request.executable} 执行超时`, { timeoutMs: request.timeoutMs }));
      }, request.timeoutMs) : undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
      };
      child.once("error", (cause) => finishError(new HexoSendError("PROCESS_FAILED", `无法启动 ${request.executable}`, {}, { cause })));
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const secrets = request.secrets ?? [];
        const result: ProcessResult = {
          executable: request.executable,
          args: request.args.map((arg) => redact(arg, secrets)),
          cwd: request.cwd,
          exitCode: code ?? -1,
          stdout: redact(stdout, secrets),
          stderr: redact(stderr, secrets),
          durationMs: Date.now() - started,
        };
        if (result.exitCode !== 0) {
          reject(new HexoSendError("PROCESS_FAILED", `${request.executable} 执行失败（${result.exitCode}）`, { result }));
        } else resolve(result);
      });
    });
  }
}
