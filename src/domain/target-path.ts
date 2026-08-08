import path from "node:path";
import { HexoSendError } from "./errors";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeFilename(title: string): string {
  const sanitized = title.replace(/[\\/:*?"<>|\r\n\t]/g, "_").replace(/^_+|_+$/g, "").trim().slice(0, 80);
  const base = sanitized || "untitled";
  return `${WINDOWS_RESERVED.test(base) ? `_${base}` : base}.md`;
}

export function targetForCategory(postsDir: string, seoPostsDir: string, categoryPath: readonly string[], title: string): string {
  const directory = categoryPath.includes("SEO教程") ? seoPostsDir : postsDir;
  return path.posix.join(directory.replaceAll("\\", "/"), sanitizeFilename(title));
}

export function assertSafeRelativePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized) || /^[a-z]:\//i.test(normalized)) {
    throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `不安全的目标路径：${relativePath}`);
  }
  for (const segment of normalized.split("/")) {
    if (WINDOWS_RESERVED.test(segment) || segment === "..") throw new HexoSendError("PATH_OUTSIDE_REPOSITORY", `不安全的目标路径：${relativePath}`);
  }
  return normalized;
}
