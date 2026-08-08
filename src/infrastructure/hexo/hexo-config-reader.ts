import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { splitFrontmatter } from "../../domain/frontmatter";

export interface HexoConfigSnapshot {
  siteTitle: string;
  author: string;
  url: string;
  language: string;
  timezone: string;
  sourceDir: string;
  postsDir: string;
  seoPostsDir: string;
  imagesDir: string;
  permalink: string;
  postAssetFolder: boolean;
  categories: string[][];
  categoryMap: Record<string, string>;
  tags: string[];
  hexoVersion: string;
  abbrlinkInstalled: boolean;
  abbrlinkConfig: Record<string, unknown>;
}

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export async function readHexoConfig(repositoryPath: string, overrides: { postsDir?: string; seoPostsDir?: string; imagesDir?: string } = {}): Promise<HexoConfigSnapshot> {
  const configPath = path.join(repositoryPath, "_config.yml");
  const packagePath = path.join(repositoryPath, "package.json");
  const config = parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const sourceDir = text(config.source_dir) || "source";
  const postsDir = overrides.postsDir || path.posix.join(sourceDir.replaceAll("\\", "/"), "_posts");
  const seoPostsDir = overrides.seoPostsDir || path.posix.join(postsDir, "seo");
  const imagesDir = overrides.imagesDir || path.posix.join(sourceDir.replaceAll("\\", "/"), "images");
  const { categories, tags } = await scanTaxonomy(path.join(repositoryPath, ...postsDir.split("/")));
  const categoryMap = config.category_map && typeof config.category_map === "object" ? config.category_map as Record<string, unknown> : {};
  for (const category of Object.keys(categoryMap)) categories.push([category]);
  return {
    siteTitle: text(config.title), author: text(config.author), url: text(config.url), language: text(config.language), timezone: text(config.timezone),
    sourceDir, postsDir, seoPostsDir, imagesDir, permalink: text(config.permalink), postAssetFolder: Boolean(config.post_asset_folder),
    categories: uniquePaths(categories), categoryMap: Object.fromEntries(Object.entries(categoryMap).map(([key,value])=>[key,text(value)])), tags: [...new Set(tags)].sort((a,b) => a.localeCompare(b)),
    hexoVersion: packageJson.dependencies?.hexo ?? packageJson.devDependencies?.hexo ?? "",
    abbrlinkInstalled: Boolean(packageJson.dependencies?.["hexo-abbrlink"] ?? packageJson.devDependencies?.["hexo-abbrlink"]),
    abbrlinkConfig: config.abbrlink && typeof config.abbrlink === "object" ? config.abbrlink as Record<string, unknown> : {},
  };
}

async function scanTaxonomy(postsPath: string): Promise<{ categories: string[][]; tags: string[] }> {
  const categories: string[][] = [];
  const tags: string[] = [];
  for (const file of await markdownFiles(postsPath)) {
    try {
      const { frontmatter } = splitFrontmatter(await fs.readFile(file, "utf8"));
      const category = frontmatter.categories;
      if (typeof category === "string") categories.push([category]);
      else if (Array.isArray(category)) {
        if (category.some(Array.isArray)) {
          for (const item of category) if (Array.isArray(item)) categories.push(item.map(String));
        } else {
          for (const item of category) categories.push([String(item)]);
        }
      }
      const articleTags = frontmatter.tags;
      if (typeof articleTags === "string") tags.push(articleTags);
      else if (Array.isArray(articleTags)) tags.push(...articleTags.map(String));
    } catch { /* A malformed existing article is reported by Hexo generate, not taxonomy discovery. */ }
  }
  return { categories, tags };
}

async function markdownFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  let entries: import("node:fs").Dirent[];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) result.push(full);
  }
  return result;
}

function uniquePaths(paths: string[][]): string[][] {
  const seen = new Set<string>();
  return paths.filter((parts) => { const key = parts.join("\u0000"); if (!parts.length || seen.has(key)) return false; seen.add(key); return true; })
    .sort((a,b) => a.join("/").localeCompare(b.join("/")));
}
