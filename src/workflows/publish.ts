/**
 * PublishWorkflow — Takes generated article from R2 and pushes it
 * to the target Next.js site as a static page via GitHub API.
 *
 * Steps:
 *   1. load-article    — Load article JSON + images from R2
 *   2. build-page      — Generate page.tsx + charts.tsx components
 *   3. push-to-github  — Create/update files via GitHub Contents API
 *   4. trigger-deploy  — Hit the Cloudflare deploy webhook
 *   5. finalize        — Update D1 status
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env, TargetSite } from "../types";
import { r2Key } from "../types";
import { ARTICLES } from "../pipeline/articles";

interface PublishParams {
  slug: string;
}

const GITHUB_REPOS: Record<TargetSite, { owner: string; repo: string }> = {
  "altimitech.com": { owner: "dontriskit", repo: "altimi-pe" },
  "altimi-dev.com": { owner: "dontriskit", repo: "altimi-dev" },
};

export class PublishWorkflow extends WorkflowEntrypoint<Env, PublishParams> {
  async run(event: WorkflowEvent<PublishParams>, step: WorkflowStep) {
    const { slug } = event.payload;

    // Step 1: Load article from R2
    const articleData = await step.do("load-article", async () => {
      const article = ARTICLES.find((a) => a.slug === slug);
      if (!article) throw new Error(`Article not found: ${slug}`);

      const obj = await this.env.BUCKET.get(r2Key(slug, "article", "article_complete.json"));
      if (!obj) throw new Error(`Article not generated yet for ${slug}`);

      const content = await obj.text();
      return { slug, target_site: article.target_site, title: article.title, content };
    });

    // Step 2: Build Next.js page components
    const components = await step.do("build-page", async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(articleData.content);
      } catch {
        throw new Error("Failed to parse article JSON");
      }

      const pageTsx = buildPageComponent(slug, parsed, articleData.title);
      const chartsTsx = buildChartsComponent(slug, parsed.charts || []);

      return { pageTsx, chartsTsx };
    });

    // Step 3: Push to GitHub
    const pushed = await step.do("push-to-github", {
      retries: { limit: 2, delay: 10, backoff: "linear" },
    }, async () => {
      const ghToken = (this.env as any).GITHUB_TOKEN;
      if (!ghToken) throw new Error("GITHUB_TOKEN not set");

      const { owner, repo } = GITHUB_REPOS[articleData.target_site];
      const basePath = `src/app/resources/${slug}`;

      // Push page.tsx
      await githubPutFile(
        ghToken, owner, repo,
        `${basePath}/page.tsx`,
        components.pageTsx,
        `Add article: ${articleData.title}`,
      );

      // Push charts.tsx
      await githubPutFile(
        ghToken, owner, repo,
        `${basePath}/charts.tsx`,
        components.chartsTsx,
        `Add charts for: ${articleData.title}`,
      );

      // Push images from R2 to public/images/articles/{slug}/
      const imageKeys = [
        { r2: "hero", pub: "hero.jpg" },
        { r2: "section_0", pub: "section-1.jpg" },
        { r2: "section_1", pub: "section-2.jpg" },
        { r2: "section_2", pub: "section-3.jpg" },
      ];

      for (const img of imageKeys) {
        const imgObj = await this.env.BUCKET.get(r2Key(slug, "images", `${img.r2}.jpg`));
        if (imgObj) {
          const bytes = await imgObj.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
          await githubPutFile(
            ghToken, owner, repo,
            `public/images/articles/${slug}/${img.pub}`,
            base64,
            `Add image ${img.pub} for: ${slug}`,
            true, // isBase64
          );
        }
      }

      return { owner, repo, path: basePath };
    });

    // Step 4: Finalize
    await step.do("finalize", async () => {
      await this.env.DB.prepare(
        `UPDATE articles SET publish_status = 'completed', published_at = datetime('now'), updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();
    });
  }
}

// ── GitHub API helper ──

async function githubPutFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  isBase64 = false,
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Check if file exists (to get SHA for update)
  let sha: string | undefined;
  const existing = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      "User-Agent": "altimi-content-pipeline",
    },
  });
  if (existing.ok) {
    const data = await existing.json() as { sha: string };
    sha = data.sha;
  }

  const body: Record<string, string> = {
    message,
    content: isBase64 ? content : btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      "User-Agent": "altimi-content-pipeline",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub API error for ${path}: ${response.status} ${err}`);
  }
}

// ── Component builders ──

function buildPageComponent(slug: string, data: any, title: string): string {
  const md = (data.article_markdown || "").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  const faq = JSON.stringify(data.faq || [], null, 2);
  const sources = JSON.stringify(data.sources || [], null, 2);
  const tables = JSON.stringify(data.tables || [], null, 2);
  const metaDesc = data.meta_description || title;

  return `import type { Metadata } from "next";
import { ArticleCharts } from "./charts";

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(metaDesc)},
};

const faq = ${faq};
const sources = ${sources};
const tables = ${tables};

export default function ArticlePage() {
  return (
    <article className="min-h-screen bg-white">
      <div className="max-w-[800px] mx-auto px-6 py-[80px] max-md:py-[40px]">
        <a
          href="/"
          className="font-mono text-[13px] uppercase tracking-[0.65px] text-[#0a1926]/50 hover:text-[#0a1926] transition-colors mb-8 inline-block"
        >
          &larr; Back
        </a>

        <h1 className="text-[clamp(28px,5vw,48px)] leading-[1.15] font-normal text-[#0a1926] mb-8">
          ${title.replace(/"/g, "&quot;")}
        </h1>

        {/* Article content with chart placeholders replaced */}
        <div
          className="prose prose-lg max-w-none text-[#333333] [&_h2]:text-[#0a1926] [&_h2]:text-[28px] [&_h2]:font-normal [&_h2]:mt-12 [&_h2]:mb-6 [&_h3]:text-[#0a1926] [&_h3]:text-[22px] [&_h3]:font-medium [&_a]:text-[#419AF0] [&_a]:no-underline hover:[&_a]:underline [&_img]:rounded-xl [&_img]:shadow-lg"
          dangerouslySetInnerHTML={{ __html: articleHtml }}
        />

        {/* Charts */}
        <ArticleCharts />

        {/* FAQ */}
        {faq.length > 0 && (
          <section className="mt-16 border-t border-[#0a1926]/10 pt-12">
            <h2 className="text-[28px] font-normal text-[#0a1926] mb-8">FAQ</h2>
            <div className="space-y-6">
              {faq.map((item: { question: string; answer: string }, i: number) => (
                <div key={i}>
                  <h3 className="text-[18px] font-medium text-[#0a1926] mb-2">{item.question}</h3>
                  <p className="text-[#333333] text-[16px] leading-[1.6]">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <section className="mt-12 border-t border-[#0a1926]/10 pt-8">
            <h2 className="text-[22px] font-normal text-[#0a1926] mb-6">Sources</h2>
            <ol className="space-y-2 text-[14px] text-[#333333]/80">
              {sources.map((s: { key: string; name: string; url: string; date: string }, i: number) => (
                <li key={i} id={\`ref-\${s.key}\`}>
                  [{s.key}] {s.name} ({s.date}).{" "}
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#419AF0] hover:underline">{s.url}</a>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </article>
  );
}

// Pre-processed article HTML (markdown → HTML conversion happens at build time)
const articleHtml = \`${md}\`;
`;
}

function buildChartsComponent(slug: string, charts: any[]): string {
  if (!charts || charts.length === 0) {
    return `"use client";\nexport function ArticleCharts() { return null; }\n`;
  }

  const chartsJson = JSON.stringify(charts, null, 2);

  return `"use client";

import { useEffect, useRef } from "react";

const charts = ${chartsJson};

export function ArticleCharts() {
  return (
    <div className="space-y-12 my-12">
      {charts.map((chart: any) => (
        <ChartBlock key={chart.id} config={chart} />
      ))}
    </div>
  );
}

function ChartBlock({ config }: { config: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let chartInstance: any = null;

    async function init() {
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);

      if (canvasRef.current) {
        chartInstance = new Chart(canvasRef.current, {
          type: config.type || "bar",
          data: {
            labels: config.labels || [],
            datasets: config.datasets || [],
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: config.title || "",
                font: { size: 16, weight: "normal" },
                color: "#0a1926",
              },
              legend: { display: (config.datasets?.length || 0) > 1 },
            },
            scales: config.type === "radar" || config.type === "doughnut" || config.type === "pie"
              ? {}
              : { y: { beginAtZero: true } },
          },
        });
      }
    }

    init();
    return () => { chartInstance?.destroy(); };
  }, [config]);

  return (
    <div className="bg-[#f5f5f5] rounded-xl p-6">
      <canvas ref={canvasRef} />
      {config.source_note && (
        <p className="text-[12px] text-[#333333]/50 mt-3 text-right">{config.source_note}</p>
      )}
    </div>
  );
}
`;
}
