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
      const responseJsons: string[] = [];
      for (const n of [1, 2, 3]) {
        const obj = await this.env.BUCKET.get(r2Key(slug, "research", `stream_${n}_report.md`));
        if (!obj) throw new Error(`Stream ${n} not found. Run research first.`);
        streams.push(await obj.text());

        // Also load response JSON for grounding URLs
        const respObj = await this.env.BUCKET.get(r2Key(slug, "research", `stream_${n}_response.json`));
        if (respObj) responseJsons.push(await respObj.text());
      }

      // Extract real URLs from research responses + report text
      const allUrls = new Set<string>();
      const vertexUrls: string[] = [];
      const urlRegex = /https?:\/\/[^\s)\]>,"'<]{4,}/g;
      for (const text of [...streams, ...responseJsons]) {
        for (const rawUrl of text.match(urlRegex) || []) {
          const url = rawUrl.replace(/[.,;:!?\])+}]+$/, "");
          try {
            const parsed = new URL(url);
            if (parsed.hostname.includes("vertexaisearch.cloud.google.com") || parsed.hostname.includes("grounding-api-redirect")) {
              vertexUrls.push(url);
            } else {
              allUrls.add(url);
            }
          } catch {}
        }
      }

      // Resolve Vertex redirect URLs to real destinations
      for (const vUrl of vertexUrls.slice(0, 30)) {
        try {
          const resp = await fetch(vUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
          const finalUrl = resp.url;
          if (finalUrl && !finalUrl.includes("vertexaisearch") && !finalUrl.includes("grounding-api-redirect")) {
            allUrls.add(finalUrl);
          }
        } catch {}
      }

      return {
        slug: article.slug,
        title: article.title,
        target_site: article.target_site,
        primary_keyword: article.primary_keyword,
        streams,
        extractedUrls: [...allUrls].slice(0, 50),
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

## REAL source URLs extracted from research reports (USE THESE EXACT URLs):
${research.extractedUrls.map((u: string, i: number) => `${i+1}. ${u}`).join("\n")}

CRITICAL INSTRUCTION FOR SOURCES:
- For each source in your output, find the MATCHING full URL from the list above
- Use the EXACT URL, not a homepage or shortened version
- If a source's specific URL is not in the list, use the most specific URL you can find from the research text
- NEVER use vertexaisearch.cloud.google.com URLs
- NEVER use example.com URLs
- NEVER use just a bare domain like "www.mckinsey.com" - use the full article/report URL

## Task
Return JSON:
- narrative: string (3000-4000 words synthesized research brief with all key findings)
- data_points: array of {label, value, unit, source, source_date, confidence, chart_hint} - EVERY number, percentage, comparison from the research. chart_hint = bar|line|radar|doughnut|comparison|table
- sources: array of {key, name, url, date} - all cited sources with sequential keys "1", "2", etc. CRITICAL: use the REAL full URLs listed above. Match each source name to its actual URL from the research. NEVER use example.com or placeholder URLs. If you cannot find the real URL, use the organization's homepage.
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
  "hero_image_prompt": "detailed text-to-image prompt - floating macOS-style browser window on soft pink-to-blue gradient background, dark navy title bar, professional data visualization or dashboard inside. 16:9 aspect ratio, no people, no text overlays, no logos, no brand names, no watermarks, premium SaaS marketing aesthetic",
  "section_image_prompts": [{"h2": "...", "prompt": "same style as hero - NO brand names, NO logos, NO text overlays in the prompt", "alt": "..."}]
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
8. Conclusion naturally references the service CTA. Use a proper markdown link: [Book a call](https://meetings.hubspot.com/jacek-podoba)
9. Be specific - use named companies, dates, exact numbers. No vague claims.
10. Present conflicting evidence where it exists. This builds credibility.
11. DO NOT include a FAQ section in the article body. FAQ is handled separately. End with the conclusion/CTA paragraph.
12. NEVER use em-dashes (—) or en-dashes (–). Use regular hyphens (-), commas, or rewrite the sentence. Write like a human typing on a keyboard. This is extremely important - NO EM-DASHES ANYWHERE.
13. NEVER use em-dashes. Seriously. Not even once. Use commas, periods, or hyphens instead.

Return ONLY the markdown article body. No JSON wrapper. No FAQ section.` }] }],
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
- Use these colors: navy #0a1926, blue #419AF0, magenta #D34489, gray #6B7280, green #10b981
- For doughnut/pie: use array of colors AND every dataset MUST have a "label" field matching each slice
- For bar/line: each dataset MUST have a descriptive "label" field
- ALL charts must have readable labels array with human-friendly names (not IDs)
- sourceNote must cite the actual source name and year of the data
- IMPORTANT: labels must be short enough to render without overlapping (max 25 chars each)` }] }],
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
          // Use REST API directly - SDK has issues with image response parsing in Workers
          const apiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${this.env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
              }),
            },
          );

          if (!apiResp.ok) {
            console.error(`Image API error for ${key}: ${apiResp.status}`);
            continue;
          }

          const data = await apiResp.json() as any;
          const parts = data?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              const bytes = Buffer.from(part.inlineData.data, "base64");
              await this.env.BUCKET.put(
                r2Key(slug, "images", `${key}.jpg`),
                bytes,
                { httpMetadata: { contentType: part.inlineData.mimeType || "image/jpeg" } },
              );
              generated++;
              break;
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
      // Strip any FAQ section the LLM might have added to the article body
      let cleanMd = articleMd.replace(/^#{1,2}\s*(FAQ|Frequently Asked Questions)[\s\S]*$/mi, "");

      // Convert markdown to HTML
      let articleHtml = cleanMd
        // Headings with optional {#id}
        .replace(/^### (.*?)(?:\s*\{#([\w-]+)\})?$/gm, (_, title, id) => `<h3 id="${id || slugify(title)}">${title}</h3>`)
        .replace(/^## (.*?)(?:\s*\{#([\w-]+)\})?$/gm, (_, title, id) => `<h2 id="${id || slugify(title)}">${title}</h2>`)
        .replace(/^# (.+)$/gm, "") // Strip H1 (we have it in the template)
        // Markdown links BEFORE other inline formatting
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Inline formatting
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Lists
        .replace(/^\- (.+)$/gm, "<li>$1</li>")
        .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
        .replace(/((?:<li>.*<\/li>\n?)+)/g, (match) => `<ul>${match}</ul>`)
        // Blockquotes
        .replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>")
        // Citation markers [N]
        .replace(/\[(\d+)\]/g, '<a href="#ref-$1" class="citation" title="Source [$1]">[$1]</a>')
        // Paragraphs (lines that aren't already HTML elements or chart/table markers)
        .replace(/^(?!<[hublofdt]|<!--|$)(.+)$/gm, "<p>$1</p>")
        .replace(/<p><\/p>/g, "")
        // Clean up em-dashes that might have slipped through
        .replace(/\u2014/g, " - ")
        .replace(/\u2013/g, "-");

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
