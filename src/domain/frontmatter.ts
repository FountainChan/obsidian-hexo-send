import { parseDocument, stringify } from "yaml";
import { HexoSendError } from "./errors";
import type { ArticleMetadata } from "./publish-types";

export function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: normalized };
  const document = parseDocument(match[1] ?? "");
  if (document.errors.length) {
    throw new HexoSendError("METADATA_INVALID", `源 frontmatter 无法解析：${document.errors[0]?.message ?? "未知错误"}`);
  }
  return { frontmatter: (document.toJS() as Record<string, unknown>) ?? {}, body: normalized.slice(match[0].length) };
}

function asString(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  const text = asString(value);
  return text ? text.split(/[,，]/).map((item) => item.trim()).filter(Boolean) : [];
}
function asCategories(value: unknown): string[][] {
  if (!Array.isArray(value)) return asString(value) ? [[asString(value)]] : [];
  if (value.some(Array.isArray)) return value.map((item) => Array.isArray(item) ? asStrings(item) : [asString(item)]).filter((path) => path.some(Boolean));
  return asStrings(value).map((item) => [item]);
}

export function metadataFromFrontmatter(frontmatter: Record<string, unknown>, fallbackTitle: string, now = new Date()): ArticleMetadata {
  const date = asString(frontmatter.date) || formatLocalDate(now);
  return {
    title: asString(frontmatter.title) || fallbackTitle,
    date,
    comments: typeof frontmatter.comments === "boolean" ? frontmatter.comments : true,
    categories: asCategories(frontmatter.categories),
    tags: asStrings(frontmatter.tags),
    keywords: asStrings(frontmatter.keywords),
    abbrlink: asString(frontmatter.abbrlink),
    topImg: asString(frontmatter.top_img) || false,
    cover: asString(frontmatter.cover) || false,
    description: asString(frontmatter.description),
  };
}

export function validateMetadata(metadata: ArticleMetadata): string[] {
  const errors: string[] = [];
  if (!metadata.title.trim()) errors.push("标题不能为空");
  if (!metadata.date.trim()) errors.push("日期不能为空");
  if (!metadata.categories.length || metadata.categories.some((path) => !path.length)) errors.push("必须确认分类");
  if (metadata.tags.length < 3 || metadata.tags.length > 5) errors.push("标签数量必须为 3–5 个");
  if (!metadata.keywords.length) errors.push("keywords 不能为空");
  const chineseLength = [...metadata.description].length;
  if (!metadata.description.trim()) errors.push("description 不能为空");
  else if ((chineseLength < 80 || chineseLength > 160) && !metadata.descriptionExceptionConfirmed) errors.push("description 应为 80–160 字，或明确确认例外");
  return errors;
}

export function serializeArticle(metadata: ArticleMetadata, body: string): string {
  const object: Record<string, unknown> = {
    title: metadata.title.trim(),
    date: metadata.date,
    comments: metadata.comments,
    categories: metadata.categories.length === 1 && metadata.categories[0]?.length === 1 ? metadata.categories[0][0] : metadata.categories,
    tags: metadata.tags,
    keywords: metadata.keywords,
    abbrlink: metadata.abbrlink || null,
    top_img: metadata.topImg,
    cover: metadata.cover,
    description: metadata.description.trim(),
  };
  const yaml = stringify(object, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\s+/, "").trimEnd()}\n`;
}

export function formatLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
