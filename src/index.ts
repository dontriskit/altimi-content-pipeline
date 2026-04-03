/**
 * Altimi Content Pipeline — Cloudflare Worker
 *
 * Routes:
 *   POST /research/:slug         — Start deep research for an article
 *   GET  /research/:slug/status  — Check research status
 *   GET  /articles                — List all articles and their status
 *   POST /articles/seed          — Seed D1 with article configs
 *   GET  /health                  — Health check
 */

import type { Env, Article } from "./types";
import { r2Key } from "./types";
import { ARTICLES } from "./pipeline/articles";

// Re-export workflow classes for wrangler
export { DeepResearchWorkflow } from "./workflows/deep-research";
export { ArticleGenWorkflow } from "./workflows/article-gen";
export { PublishWorkflow } from "./workflows/publish";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === "/health") {
        return json({ status: "ok", articles: ARTICLES.length });
      }

      // Seed articles into D1
      if (path === "/articles/seed" && request.method === "POST") {
        return handleSeed(env);
      }

      // List all articles
      if (path === "/articles" && request.method === "GET") {
        return handleListArticles(env);
      }

      // Start research for a specific article
      const researchMatch = path.match(/^\/research\/([a-z0-9-]+)$/);
      if (researchMatch && request.method === "POST") {
        return handleStartResearch(env, researchMatch[1]);
      }

      // Check research status
      const statusMatch = path.match(/^\/research\/([a-z0-9-]+)\/status$/);
      if (statusMatch && request.method === "GET") {
        return handleResearchStatus(env, statusMatch[1]);
      }

      // Start article generation for a specific article
      const genMatch = path.match(/^\/generate\/([a-z0-9-]+)$/);
      if (genMatch && request.method === "POST") {
        return handleStartGeneration(env, genMatch[1]);
      }

      // Get article content from R2
      const contentMatch = path.match(/^\/content\/([a-z0-9-]+)$/);
      if (contentMatch && request.method === "GET") {
        return handleGetContent(env, contentMatch[1]);
      }

      // Publish article to target site
      const pubMatch = path.match(/^\/publish\/([a-z0-9-]+)$/);
      if (pubMatch && request.method === "POST") {
        return handlePublish(env, pubMatch[1]);
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return json({ error: message }, 500);
    }
  },
};

// ── Handlers ──

async function handleSeed(env: Env): Promise<Response> {
  // Create table if not exists
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      target_site TEXT NOT NULL,
      primary_keyword TEXT,
      sequence_position INTEGER,
      stream_1_status TEXT DEFAULT 'pending',
      stream_1_interaction_id TEXT,
      stream_2_status TEXT DEFAULT 'pending',
      stream_2_interaction_id TEXT,
      stream_3_status TEXT DEFAULT 'pending',
      stream_3_interaction_id TEXT,
      research_status TEXT DEFAULT 'pending',
      synthesis_status TEXT DEFAULT 'pending',
      article_status TEXT DEFAULT 'pending',
      images_status TEXT DEFAULT 'pending',
      assembly_status TEXT DEFAULT 'pending',
      publish_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      published_at TEXT,
      github_issue TEXT
    )
  `).run();

  let seeded = 0;
  for (const article of ARTICLES) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO articles (slug, title, target_site, primary_keyword, sequence_position, github_issue)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        article.slug,
        article.title,
        article.target_site,
        article.primary_keyword,
        article.sequence_position,
        article.github_issue,
      ).run();
      seeded++;
    } catch {
      // Already exists — skip
    }
  }

  return json({ seeded, total: ARTICLES.length });
}

async function handleListArticles(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT slug, title, target_site, sequence_position,
            stream_1_status, stream_2_status, stream_3_status,
            research_status, synthesis_status, article_status,
            images_status, assembly_status, publish_status,
            updated_at
     FROM articles ORDER BY target_site, sequence_position`
  ).all<Article>();

  return json({
    articles: result.results,
    summary: {
      total: result.results.length,
      research_complete: result.results.filter((a) => a.research_status === "completed").length,
      published: result.results.filter((a) => a.publish_status === "completed").length,
    },
  });
}

async function handleStartResearch(env: Env, slug: string): Promise<Response> {
  // Verify article exists in D1
  const article = await env.DB.prepare(
    `SELECT * FROM articles WHERE slug = ?`
  ).bind(slug).first<Article>();

  if (!article) {
    return json({ error: `Article not found: ${slug}. Run POST /articles/seed first.` }, 404);
  }

  if (article.research_status === "completed") {
    return json({ message: "Research already completed", slug });
  }

  // Start the workflow
  const instance = await env.DEEP_RESEARCH_WORKFLOW.create({
    id: `research-${slug}`,
    params: { slug },
  });

  // Update status
  await env.DB.prepare(
    `UPDATE articles SET research_status = 'in_progress', updated_at = datetime('now') WHERE slug = ?`
  ).bind(slug).run();

  return json({
    message: "Research workflow started",
    slug,
    workflowId: instance.id,
    note: "3 research streams will run sequentially with 65s cooldown between each. Total time: ~90-135 minutes.",
  });
}

async function handleResearchStatus(env: Env, slug: string): Promise<Response> {
  const article = await env.DB.prepare(
    `SELECT slug, title, target_site,
            stream_1_status, stream_1_interaction_id,
            stream_2_status, stream_2_interaction_id,
            stream_3_status, stream_3_interaction_id,
            research_status, updated_at
     FROM articles WHERE slug = ?`
  ).bind(slug).first();

  if (!article) {
    return json({ error: "Article not found" }, 404);
  }

  // Check R2 for saved reports
  const reports: Record<string, boolean> = {};
  for (const num of [1, 2, 3]) {
    const key = `articles/${slug}/research/stream_${num}_report.md`;
    const obj = await env.BUCKET.head(key);
    reports[`stream_${num}_saved`] = obj !== null;
  }

  return json({ article, reports });
}

async function handleStartGeneration(env: Env, slug: string): Promise<Response> {
  const article = await env.DB.prepare(
    `SELECT * FROM articles WHERE slug = ?`
  ).bind(slug).first<Article>();

  if (!article) return json({ error: `Article not found: ${slug}` }, 404);
  if (article.research_status !== "completed") {
    return json({ error: "Research not completed yet. Wait for research to finish." }, 400);
  }
  if (article.assembly_status === "completed") {
    return json({ message: "Article already generated", slug });
  }

  const instance = await env.ARTICLE_GEN_WORKFLOW.create({
    id: `article-${slug}`,
    params: { slug },
  });

  await env.DB.prepare(
    `UPDATE articles SET synthesis_status = 'in_progress', updated_at = datetime('now') WHERE slug = ?`
  ).bind(slug).run();

  return json({
    message: "Article generation workflow started",
    slug,
    workflowId: instance.id,
    note: "Synthesize research → generate article with charts/FAQ/sources → generate images. ~30-45 minutes.",
  });
}

async function handleGetContent(env: Env, slug: string): Promise<Response> {
  const articleJson = await env.BUCKET.get(r2Key(slug, "article", "article_complete.json"));
  if (!articleJson) return json({ error: "Article not generated yet" }, 404);

  const content = await articleJson.text();
  return new Response(content, {
    headers: { "Content-Type": "application/json" },
  });
}

async function handlePublish(env: Env, slug: string): Promise<Response> {
  const article = await env.DB.prepare(
    `SELECT * FROM articles WHERE slug = ?`
  ).bind(slug).first<Article>();

  if (!article) return json({ error: `Article not found: ${slug}` }, 404);
  if (article.assembly_status !== "completed") {
    return json({ error: "Article not generated yet. Run /generate/:slug first." }, 400);
  }

  const instance = await env.PUBLISH_WORKFLOW.create({
    id: `publish-${slug}`,
    params: { slug },
  });

  return json({
    message: "Publish workflow started",
    slug,
    target_site: article.target_site,
    workflowId: instance.id,
  });
}

// ── Helpers ──

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
