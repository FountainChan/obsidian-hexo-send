type UnknownRecord = Record<string, unknown>;

export async function chooseSystemDirectory(): Promise<string | null> {
  const electron = electronModule();
  if (!isRecord(electron) || !isRecord(electron.remote) || !isRecord(electron.remote.dialog)) throw new Error("Electron dialog 不可用");
  const showOpenDialog = electron.remote.dialog.showOpenDialog;
  if (typeof showOpenDialog !== "function") throw new Error("Electron dialog 不可用");
  const pending: unknown = Reflect.apply(showOpenDialog, electron.remote.dialog, [{ properties: ["openDirectory"] }]);
  if (!isPromiseLike(pending)) throw new Error("Electron dialog 返回值无效");
  const result: unknown = await pending;
  if (!isRecord(result) || typeof result.canceled !== "boolean" || !Array.isArray(result.filePaths) || !result.filePaths.every((item) => typeof item === "string")) throw new Error("Electron dialog 返回值无效");
  return result.canceled ? null : result.filePaths[0] ?? null;
}

export async function openSystemPath(target: string): Promise<void> {
  const electron = electronModule();
  if (!isRecord(electron) || !isRecord(electron.shell)) throw new Error("Electron shell 不可用");
  const openPath = electron.shell.openPath;
  if (typeof openPath !== "function") throw new Error("Electron shell 不可用");
  const pending: unknown = Reflect.apply(openPath, electron.shell, [target]);
  if (!isPromiseLike(pending)) throw new Error("Electron shell 返回值无效");
  const result: unknown = await pending;
  if (typeof result !== "string") throw new Error("Electron shell 返回值无效");
  if (result) throw new Error(result);
}

function electronModule(): unknown {
  const host = window as unknown as UnknownRecord;
  const requireFunction = host.require;
  if (typeof requireFunction !== "function") return null;
  const result: unknown = Reflect.apply(requireFunction, window, ["electron"]);
  return result;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}
