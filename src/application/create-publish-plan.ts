import { randomUUID } from "node:crypto";
import { splitFrontmatter } from "../domain/frontmatter";
import type { HexoEnvironment, PublishPlan, ReviewedArticle, SourceArticle } from "../domain/publish-types";
import { targetForCategory } from "../domain/target-path";
import { SafeFileSystem } from "../infrastructure/files/safe-file-system";

export async function toReviewedArticles(sources: readonly SourceArticle[], environment: HexoEnvironment): Promise<ReviewedArticle[]> {
  const result: ReviewedArticle[] = [];
  const safeFs = new SafeFileSystem(environment.repositoryPath);
  for (const source of sources) {
    const category = source.metadata.categories[0] ?? environment.categories[0] ?? ["生活"];
    source.metadata.categories = [category];
    const targetRelativePath = targetForCategory(environment.postsDir, environment.seoPostsDir, category, source.metadata.title);
    const exists = await safeFs.exists(targetRelativePath);
    result.push({ ...source, action: exists ? "skip" : "create", targetRelativePath, selected: true, warnings: exists ? ["目标文章已存在，请选择更新、修改标题后另存，或跳过"] : [] });
  }
  return result;
}

export async function createPublishPlan(articles: readonly ReviewedArticle[], environment: HexoEnvironment, baselineHead: string, customMessage?: string): Promise<PublishPlan> {
  const selected: ReviewedArticle[] = [];
  const safeFs = new SafeFileSystem(environment.repositoryPath);
  for (const article of articles.filter((item) => item.selected && item.action !== "skip")) {
    const category = article.metadata.categories[0] ?? [];
    const targetRelativePath = targetForCategory(environment.postsDir, environment.seoPostsDir, category, article.metadata.title);
    const exists = await safeFs.exists(targetRelativePath);
    if (article.action === "create" && exists) throw new Error(`${targetRelativePath} 已存在，请解决冲突`);
    if (article.action === "save-as-new" && exists) throw new Error(`${targetRelativePath} 已存在；另存为新文章前请修改标题`);
    if (article.action === "update") {
      if (!exists) throw new Error(`${targetRelativePath} 不存在，无法更新`);
      const existing = splitFrontmatter(await safeFs.read(targetRelativePath)).frontmatter;
      if (existing.abbrlink !== undefined && existing.abbrlink !== null) article.metadata.abbrlink = String(existing.abbrlink);
      if (existing.date) article.metadata.date = String(existing.date);
    }
    selected.push({ ...article, targetRelativePath });
  }
  if (!selected.length) throw new Error("没有选择可预发布的文章");
  const defaultMessage = selected.length === 1 ? `post: ${selected[0]?.metadata.title}` : `post: ${selected[0]?.metadata.title} 等 ${selected.length} 篇`;
  const commitMessage = (customMessage || defaultMessage).trim().slice(0, 72);
  if (!commitMessage) throw new Error("commit message 不能为空");
  return Object.freeze({ id: randomUUID(), repositoryPath: environment.repositoryPath, createdAt: new Date().toISOString(), articles: Object.freeze(selected), allowedPaths: Object.freeze(selected.map((item) => item.targetRelativePath)), commitMessage, baselineHead });
}
