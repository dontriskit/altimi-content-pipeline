/**
 * ArticleGenWorkflow — Rewritten with split steps:
 *   1. load-research    — Load 3 reports from R2
 *   2. synthesize       — Merge streams + extract data points
 *   3. outline          — Structured outline (sections, charts, FAQ)
 *   4. article          — Full ~4000 word article body as markdown
 *   5. charts           — Chart.js configs from research data
 *   6. images           — Gemini image generation (hero + sections)
 *   7. assemble         — Deterministic HTML assembly
 *   8. qa               — Quality assurance checks
 *   9. finalize         — Update D1
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { GoogleGenAI } from "@google/genai";
import type { Env } from "../types";
import { r2Key } from "../types";
import { ARTICLES } from "../pipeline/articles";
import { SITE_CONFIGS } from "../pipeline/site-configs";
import { assembleAltimiHtml, type ArticleAssemblyInput } from "../pipeline/html-template";

interface ArticleGenParams {
  slug: string;
}

const MODEL = "gemini-3.1-pro-preview";
const FLASH = "gemini-3.1-pro-preview";
const RATE_LIMIT_MS = 5_000;

export class ArticleGenWorkflow extends WorkflowEntrypoint<Env, ArticleGenParams> {
  async run(event: WorkflowEvent<ArticleGenParams>, step: WorkflowStep) {
    const { slug } = event.payload;

    // ── Step 1: Load research ──
    const research = await step.do("load-research", async () => {
      const article = ARTICLES.find((a) => a.slug === slug);
      if (!article) throw new Error(`Article not found: ${slug}`);

      const streams: string[] = [];
      for (const n of [1, 2, 3]) {
        const obj = await this.env.BUCKET.get(r2Key(slug, "research", `stream_${n}_report.md`));
        if (!obj) throw new Error(`Stream ${n} not found. Run research first.`);
        streams.push(await obj.text());
      }

      return {
        slug: article.slug,
        title: article.title,
        target_site: article.target_site,
        primary_keyword: article.primary_keyword,
        streams,
      };
    });

    const site = SITE_CONFIGS[research.target_site];

    // ── Step 2: Synthesize ──
    const synthesis = await step.do("synthesize", {
      retries: { limit: 2, delay: 30, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const resp = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: `You are a senior research analyst. Synthesize these 3 research streams into a unified brief.

## Article: "${research.title}"
## Target: ${site.icp.split("\n")[0]}

## Stream 1 (${research.streams[0].length} chars)
${research.streams[0].slice(0, 20000)}

## Stream 2 (${research.streams[1].length} chars)
${research.streams[1].slice(0, 20000)}

## Stream 3 (${research.streams[2].length} chars)
${research.streams[2].slice(0, 20000)}

## Task
Return JSON:
- narrative: string (3000-4000 words synthesized research brief with all key findings)
- data_points: array of {label, value, unit, source, source_date, confidence, chart_hint} — EVERY number, percentage, comparison from the research. chart_hint = bar|line|radar|doughnut|comparison|table
- sources: array of {key, name, url, date} — all cited sources with sequential keys "1", "2", etc.
- conflicts: array of {claim, for, against}` }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 32768,
          thinkingConfig: { thinkingBudget: 4096 },
        },
      });

      return resp.text || "";
    });

    await step.do("save-synthesis", async () => {
      await this.env.BUCKET.put(r2Key(slug, "synthesis", "unified.json"), synthesis);
      await this.env.DB.prepare(`UPDATE articles SET synthesis_status = 'completed', updated_at = datetime('now') WHERE slug = ?`).bind(slug).run();
    });

    await step.sleep("cooldown-1", RATE_LIMIT_MS);

    // ── Step 3: Outline ──
    const outline = await step.do("generate-outline", {
      retries: { limit: 2, delay: 30, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const resp = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: `Plan the structure for a ~4000-word research-driven article.

## Article: "${research.title}"
## Keyword: ${research.primary_keyword}
## Audience: ${site.icp.split("\n")[0]}
## Voice: ${site.voice.split("\n")[0]}

## Research synthesis:
${synthesis.slice(0, 15000)}

## Requirements
- 5-6 H2 sections, each with 2-3 H3 subsections
- Each section: 600-800 words
- 4-6 charts distributed across sections (where data supports visualization)
- 1-2 data tables
- 5-7 FAQ questions that a reader would actually ask
- Image prompts for hero + 1 per H2 section

## Return JSON:
{
  "subtitle": "one-line article subtitle",
  "meta_description": "150-160 char SEO description",
  "sections": [
    {
      "h2": "Section title",
      "h3s": ["Subsection 1", "Subsection 2"],
      "word_target": 700,
      "key_points": ["point 1 with [N] citation", "point 2"],
      "chart": {"id": "unique_id", "type": "bar|line|doughnut|radar", "title": "Chart title", "description": "what data to show"} | null,
      "table": {"id": "unique_id", "title": "Table title", "description": "what to compare"} | null
    }
  ],
  "faq": [{"question": "...", "answer": "..."}],
  "hero_image_prompt": "detailed text-to-image prompt for Altimi brand style — floating macOS browser window on soft pink-to-blue gradient, navy #0a1926 title bar with 'altimi' wordmark, dashboard/data visualization inside. 4:3 aspect ratio, no people, premium SaaS marketing aesthetic",
  "section_image_prompts": [{"h2": "...", "prompt": "...", "alt": "..."}]
}` }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 4096 },
        },
      });

      return resp.text || "";
    });

    await step.do("save-outline", async () => {
      await this.env.BUCKET.put(r2Key(slug, "outline", "outline.json"), outline);
    });

    await step.sleep("cooldown-2", RATE_LIMIT_MS);

    // ── Step 4: Article body ──
    const articleMd = await step.do("generate-article", {
      retries: { limit: 2, delay: 60, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const resp = await client.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: `Write a ~4000-word research-driven article. You are writing for ${site.site}.

## Voice and style
${site.voice}

## Product context (weave naturally into conclusion, NOT as an ad)
${site.cta}

## Outline to follow:
${outline.slice(0, 10000)}

## Full research to draw from:
${synthesis.slice(0, 30000)}

## Original research reports (for citations):
### Stream 1
${research.streams[0].slice(0, 10000)}
### Stream 2
${research.streams[1].slice(0, 10000)}
### Stream 3
${research.streams[2].slice(0, 10000)}

## CRITICAL RULES:
1. Write ~4000 words. Each H2 section must be 600-800 words. DO NOT be shorter.
2. Use inline [N] citation markers for EVERY factual claim (numbers, percentages, quotes)
3. Where the outline specifies a chart, insert <!-- CHART:chart_id --> on its own line
4. Where the outline specifies a table, insert <!-- TABLE:table_id --> on its own line
5. Use markdown: ## for H2, ### for H3, **bold**, bullet lists, > blockquotes
6. Add id attributes to headings: ## Section Title {#section-slug}
7. Opening paragraph must hook with a striking data point
8. Conclusion naturally references the service CTA (not as a sales pitch)
9. Be specific — use named companies, dates, exact numbers. No vague claims.
10. Present conflicting evidence where it exists. This builds credibility.

Return ONLY the markdown article body. No JSON wrapper.` }] }],
        config: {
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 8192 },
        },
      });

      return resp.text || "";
    });

    await step.do("save-article", async () => {
      await this.env.BUCKET.put(r2Key(slug, "article", "article.md"), articleMd);
      await this.env.DB.prepare(`UPDATE articles SET article_status = 'completed', updated_at = datetime('now') WHERE slug = ?`).bind(slug).run();
    });

    await step.sleep("cooldown-3", RATE_LIMIT_MS);

    // ── Step 5: Chart configs ──
    const chartsJson = await step.do("generate-charts", {
      retries: { limit: 2, delay: 30, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const resp = await client.models.generateContent({
        model: FLASH,
        contents: [{ role: "user", parts: [{ text: `Generate Chart.js configurations from real research data.

## Outline (chart specs):
${outline.slice(0, 5000)}

## Research data points:
${synthesis.slice(0, 10000)}

## For each chart in the outline, create a Chart.js config:
Return JSON array:
[
  {
    "id": "chart_id_from_outline",
    "type": "bar|line|doughnut|radar",
    "title": "Chart title",
    "labels": ["Label 1", "Label 2", ...],
    "datasets": [{"label": "Dataset", "data": [N1, N2, ...], "backgroundColor": ["#0a1926", "#419AF0", "#D34489", "#333", "#f5f5f5"]}],
    "sourceNote": "Source: Name (Year)"
  }
]

RULES:
- Use ONLY real numbers from the research. Do NOT invent data.
- Use Altimi colors: navy #0a1926, blue #419AF0, magenta #D34489, gray #333333
- For doughnut/pie: use array of colors in backgroundColor
- For bar/line: use single color per dataset
- sourceNote must cite the actual source of the data` }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });

      return resp.text || "";
    });

    await step.do("save-charts", async () => {
      await this.env.BUCKET.put(r2Key(slug, "article", "charts.json"), chartsJson);
    });

    await step.sleep("cooldown-4", RATE_LIMIT_MS);

    // ── Step 6: Generate images ──
    const imageResults = await step.do("generate-images", {
      retries: { limit: 1, delay: 30, backoff: "linear" },
    }, async () => {
      let outlineData: any;
      try { outlineData = JSON.parse(outline); } catch { return { generated: 0, error: "Failed to parse outline" }; }

      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });
      const prompts: { key: string; prompt: string; alt: string }[] = [];

      if (outlineData.hero_image_prompt) {
        prompts.push({ key: "hero", prompt: outlineData.hero_image_prompt, alt: research.title });
      }
      for (const [i, img] of (outlineData.section_image_prompts || []).entries()) {
        prompts.push({ key: `section_${i}`, prompt: img.prompt, alt: img.alt || "" });
      }

      let generated = 0;
      for (const { key, prompt } of prompts) {
        try {
          const resp = await client.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "16:9", imageSize: "2K" } },
          });

          const candidates = resp.candidates || [];
          if (candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
              if (part.inlineData?.data) {
                const bytes = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
                await this.env.BUCKET.put(
                  r2Key(slug, "images", `${key}.jpg`),
                  bytes,
                  { httpMetadata: { contentType: part.inlineData.mimeType || "image/jpeg" } },
                );
                generated++;
                break;
              }
            }
          }
          await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
          console.error(`Image failed for ${key}:`, e);
        }
      }

      return { generated, total: prompts.length };
    });

    await step.do("save-image-status", async () => {
      await this.env.BUCKET.put(r2Key(slug, "images", "_status.json"), JSON.stringify(imageResults));
      await this.env.DB.prepare(`UPDATE articles SET images_status = 'completed', updated_at = datetime('now') WHERE slug = ?`).bind(slug).run();
    });

    // ── Step 7: HTML Assembly ──
    const htmlResult = await step.do("assemble-html", async () => {
      // Load all components
      let outlineData: any, chartsData: any[], synthesisData: any;
      try { outlineData = JSON.parse(outline); } catch { outlineData = {}; }
      try { chartsData = JSON.parse(chartsJson); } catch { chartsData = []; }
      try { synthesisData = JSON.parse(synthesis); } catch { synthesisData = { sources: [] }; }

      // Convert markdown to HTML (basic conversion)
      let articleHtml = articleMd
        .replace(/^### (.*?)(?:\s*\{#([\w-]+)\})?$/gm, (_, title, id) => `<h3 id="${id || slugify(title)}">${title}</h3>`)
        .replace(/^## (.*?)(?:\s*\{#([\w-]+)\})?$/gm, (_, title, id) => `<h2 id="${id || slugify(title)}">${title}</h2>`)
        .replace(/^\*\*(.+?)\*\*$/gm, "<p><strong>$1</strong></p>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/^\- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
        .replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>")
        .replace(/\[(\d+)\]/g, '<a href="#ref-$1" title="Source [$1]">[$1]</a>')
        .replace(/^(?!<[hublofdt]|<!--)(.+)$/gm, "<p>$1</p>")
        .replace(/<p><\/p>/g, "");

      // Build image URLs
      const imageBaseUrl = `/resources/${slug}/images`;
      const sectionImages = (outlineData.section_image_prompts || []).map((_: any, i: number) => ({
        url: `${imageBaseUrl}/section_${i}.jpg`,
        alt: outlineData.section_image_prompts[i]?.alt || "",
      }));

      // Compute reading time
      const wordCount = articleMd.split(/\s+/).length;
      const readingTime = Math.max(1, Math.round(wordCount / 220));

      const input: ArticleAssemblyInput = {
        slug,
        title: research.title,
        subtitle: outlineData.subtitle || "",
        metaDescription: outlineData.meta_description || research.title,
        targetSite: research.target_site,
        primaryKeyword: research.primary_keyword,
        articleHtml,
        charts: chartsData,
        tables: outlineData.tables || [],
        faq: outlineData.faq || [],
        sources: synthesisData.sources || [],
        heroImageUrl: `${imageBaseUrl}/hero.jpg`,
        sectionImageUrls: sectionImages,
        readingTime,
      };

      const html = assembleAltimiHtml(input);
      return { html, wordCount, chartCount: chartsData.length, readingTime };
    });

    await step.do("save-html", async () => {
      await this.env.BUCKET.put(
        r2Key(slug, "final", "article.html"),
        htmlResult.html,
        { httpMetadata: { contentType: "text/html; charset=utf-8" } },
      );
      await this.env.DB.prepare(`UPDATE articles SET assembly_status = 'completed', updated_at = datetime('now') WHERE slug = ?`).bind(slug).run();
    });

    // ── Step 8: QA ──
    const qa = await step.do("qa-check", async () => {
      const checks = {
        word_count: { value: htmlResult.wordCount, pass: htmlResult.wordCount >= 2500 },
        chart_count: { value: htmlResult.chartCount, pass: htmlResult.chartCount >= 3 },
        reading_time: { value: htmlResult.readingTime, pass: htmlResult.readingTime >= 8 },
        has_html: { value: htmlResult.html.length, pass: htmlResult.html.length > 10000 },
      };
      const allPass = Object.values(checks).every(c => c.pass);
      return { checks, allPass };
    });

    await step.do("save-qa", async () => {
      await this.env.BUCKET.put(r2Key(slug, "final", "qa.json"), JSON.stringify(qa, null, 2));
    });

    // ── Step 9: Finalize ──
    await step.do("finalize", async () => {
      await this.env.DB.prepare(`UPDATE articles SET assembly_status = 'completed', updated_at = datetime('now') WHERE slug = ?`).bind(slug).run();
      await this.env.BUCKET.put(r2Key(slug, "_complete.json"), JSON.stringify({
        slug, target_site: research.target_site, completed_at: new Date().toISOString(),
        qa,
      }));
    });
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
