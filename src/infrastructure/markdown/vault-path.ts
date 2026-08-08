import path from "node:path";

export function resolveVaultAssetPath(sourcePath: string, target: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(target.trim()); } catch { decoded = target.trim(); }
  if (decoded.startsWith("<") && decoded.endsWith(">")) decoded = decoded.slice(1, -1);
  decoded = decoded.replaceAll("\\", "/").split("#", 1)[0]?.split("?", 1)[0] ?? "";
  if (!decoded) return null;
  const normalized = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath.replaceAll("\\", "/")), decoded));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}
