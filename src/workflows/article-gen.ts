/**
 * ArticleGenWorkflow — Durable workflow that takes completed research
 * and produces the full article with charts, FAQ, images, and sources.
 *
 * Steps:
 *   1. load-research     — Load 3 research reports from R2
 *   2. synthesize         — Merge 3 streams into unified research + extract data points
 *   3. cooldown-1         — Rate limit (65s)
 *   4. generate-article   — Full article with charts, FAQ, image prompts, sources, CTA
 *   5. cooldown-2         — Rate limit (65s)
 *   6. generate-images    — Gemini image generation (hero + sections)
 *   7. save-article       — Save everything to R2
 *   8. finalize           — Update D1 status
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

interface ArticleGenParams {
  slug: string;
}

const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
const RATE_LIMIT_MS = 65_000;

export class ArticleGenWorkflow extends WorkflowEntrypoint<Env, ArticleGenParams> {
  async run(event: WorkflowEvent<ArticleGenParams>, step: WorkflowStep) {
    const { slug } = event.payload;

    // Step 1: Load research from R2
    const research = await step.do("load-research", async () => {
      const article = ARTICLES.find((a) => a.slug === slug);
      if (!article) throw new Error(`Article not found: ${slug}`);

      const streams: string[] = [];
      for (const n of [1, 2, 3]) {
        const obj = await this.env.BUCKET.get(r2Key(slug, "research", `stream_${n}_report.md`));
        if (!obj) throw new Error(`Stream ${n} research not found for ${slug}. Run research first.`);
        streams.push(await obj.text());
      }

      return {
        slug: article.slug,
        title: article.title,
        target_site: article.target_site,
        primary_keyword: article.primary_keyword,
        stream1: streams[0],
        stream2: streams[1],
        stream3: streams[2],
      };
    });

    const siteConfig = SITE_CONFIGS[research.target_site];

    // Step 2: Synthesize research + extract data points
    const synthesis = await step.do("synthesize", {
      retries: { limit: 2, delay: 45, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const prompt = `You are a senior research analyst. Synthesize these 3 research streams into a unified brief for an article writer.

## Article
Title: "${research.title}"
Target audience: ${siteConfig.icp.split("\n")[0]}
Primary keyword: ${research.primary_keyword}

## Research Stream 1
${research.stream1.slice(0, 15000)}

## Research Stream 2
${research.stream2.slice(0, 15000)}

## Research Stream 3
${research.stream3.slice(0, 15000)}

## Your task
1. Synthesize the key findings into a coherent narrative arc
2. Identify the 15-25 strongest data points with their sources
3. Flag any conflicting evidence
4. Extract ALL chartable data: numbers, percentages, comparisons, trends — anything that could become a Chart.js visualization
5. Note which claims are well-sourced (HIGH confidence) vs weakly sourced

## Output format
Return a JSON object with:
- unified_narrative: string (2000-3000 words, the synthesized research brief)
- data_points: array of {label, value, unit, source, source_date, confidence, chart_hint} where chart_hint is one of: bar, line, radar, pie, comparison, table
- conflicts: array of {claim, evidence_for, evidence_against}
- source_quality: {high_confidence: number, medium: number, low: number}`;

      const response = await client.models.generateContent({
        model: GEMINI_PRO_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
          thinkingConfig: { thinkingBudget: 4096 },
        },
      });

      const text = response.text || "";
      return text;
    });

    // Save synthesis to R2
    await step.do("save-synthesis", async () => {
      await this.env.BUCKET.put(r2Key(slug, "synthesis", "unified.json"), synthesis);
      await this.env.DB.prepare(
        `UPDATE articles SET synthesis_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();
    });

    await step.sleep("cooldown-1", RATE_LIMIT_MS);

    // Step 3: Generate full article with charts, FAQ, images, sources
    const article = await step.do("generate-article", {
      retries: { limit: 2, delay: 60, backoff: "linear" },
    }, async () => {
      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });

      const prompt = `You are a senior content writer producing a research-driven article for ${siteConfig.site}.

## Article metadata
Title: "${research.title}"
Primary keyword: ${research.primary_keyword}
Target audience: ${siteConfig.icp}
Voice: ${siteConfig.voice}

## Product context
${siteConfig.product}
${siteConfig.brandContext}

## Research synthesis (use this as your source material)
${synthesis.slice(0, 30000)}

## Full research reports (reference for citations)
### Stream 1
${research.stream1.slice(0, 8000)}
### Stream 2
${research.stream2.slice(0, 8000)}
### Stream 3
${research.stream3.slice(0, 8000)}

## Article requirements

### Structure (~4000 words)
- Opening hook with a striking data point
- 4-6 H2 sections, each 500-800 words
- Inline [N] citation markers for every factual claim
- Conclusion that naturally leads to the service CTA

### Charts (4-6 total)
Generate Chart.js configurations from the REAL data in the research.
Each chart must have: id, type (bar|line|radar|doughnut|horizontalBar), title, labels, datasets with real numbers, and a source_note citing where the data came from.
Insert chart markers in the article: <!-- CHART:chart_id -->

### Tables (1-2)
Data comparison tables with real numbers from research. Each with headers, rows, and source_note.
Insert markers: <!-- TABLE:table_id -->

### FAQ (5-7 questions)
Questions a reader would actually ask after reading. Answers should reference specific findings from the research.

### Images (1 hero + 3 section images)
Generate detailed text-to-image prompts for Altimi brand-style images:
- Floating macOS browser window mockups on soft pink-to-blue gradient backgrounds
- Data visualizations, dashboards, dependency graphs inside the mockups
- Navy #0a1926 title bars with "altimi" wordmark
- Premium SaaS aesthetic (think Linear, Vercel marketing)
- Each prompt ends with: "4:3 aspect ratio, no people, no stock photos, premium SaaS marketing aesthetic"
- Alt text for accessibility

### Sources (15-25)
Every cited source with: citation_key [N], name, url, date, how it was used.

### Service CTA
Weave this naturally into the conclusion (NOT as an ad):
${siteConfig.cta}

## Output format
Return a JSON object with:
- article_markdown: string (the full article, ~4000 words, with <!-- CHART:id --> and <!-- TABLE:id --> markers and [N] citations)
- charts: array of {id, type, title, labels, datasets, source_note}
- tables: array of {id, title, headers, rows, source_note}
- faq: array of {question, answer}
- hero_image: {prompt, alt_text}
- section_images: array of {h2, prompt, alt_text}
- sources: array of {key, name, url, date, context}
- meta_description: string (150-160 chars)`;

      const response = await client.models.generateContent({
        model: GEMINI_PRO_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 8192 },
        },
      });

      return response.text || "";
    });

    // Save article to R2
    await step.do("save-article", async () => {
      await this.env.BUCKET.put(r2Key(slug, "article", "article_complete.json"), article);
      await this.env.DB.prepare(
        `UPDATE articles SET article_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();
    });

    await step.sleep("cooldown-2", RATE_LIMIT_MS);

    // Step 4: Generate images
    const imageResults = await step.do("generate-images", {
      retries: { limit: 2, delay: 30, backoff: "linear" },
    }, async () => {
      let articleData: { hero_image?: { prompt: string }; section_images?: { h2: string; prompt: string }[] };
      try {
        articleData = JSON.parse(article);
      } catch {
        return { generated: 0, error: "Failed to parse article JSON for image prompts" };
      }

      const client = new GoogleGenAI({ apiKey: this.env.GEMINI_API_KEY });
      const imagePrompts: { key: string; prompt: string }[] = [];

      if (articleData.hero_image?.prompt) {
        imagePrompts.push({ key: "hero", prompt: articleData.hero_image.prompt });
      }
      if (articleData.section_images) {
        articleData.section_images.forEach((img, i) => {
          imagePrompts.push({ key: `section_${i}`, prompt: img.prompt });
        });
      }

      let generated = 0;
      for (const { key, prompt } of imagePrompts) {
        try {
          const response = await client.models.generateContent({
            model: "gemini-3.1-pro-preview-image-preview",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              responseModalities: ["IMAGE", "TEXT"],
              imageConfig: { aspectRatio: "4:3", imageSize: "2K" },
            },
          });

          // Extract image data from response
          const candidates = response.candidates || [];
          if (candidates.length > 0 && candidates[0].content?.parts) {
            for (const part of candidates[0].content.parts) {
              if (part.inlineData?.data) {
                const imageData = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
                await this.env.BUCKET.put(
                  r2Key(slug, "images", `${key}.jpg`),
                  imageData,
                  { httpMetadata: { contentType: part.inlineData.mimeType || "image/jpeg" } },
                );
                generated++;
                break;
              }
            }
          }

          // Rate limit between image generations
          await new Promise((r) => setTimeout(r, 3000));
        } catch (e) {
          console.error(`Image generation failed for ${key}:`, e);
        }
      }

      return { generated, total: imagePrompts.length };
    });

    // Save image results
    await step.do("save-image-status", async () => {
      await this.env.BUCKET.put(
        r2Key(slug, "images", "_status.json"),
        JSON.stringify(imageResults),
      );
      await this.env.DB.prepare(
        `UPDATE articles SET images_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();
    });

    // Step 5: Finalize
    await step.do("finalize", async () => {
      await this.env.DB.prepare(
        `UPDATE articles SET assembly_status = 'completed', updated_at = datetime('now') WHERE slug = ?`
      ).bind(slug).run();

      await this.env.BUCKET.put(
        r2Key(slug, "_complete.json"),
        JSON.stringify({
          slug,
          target_site: research.target_site,
          completed_at: new Date().toISOString(),
          images: imageResults,
        }),
      );
    });
  }
}
