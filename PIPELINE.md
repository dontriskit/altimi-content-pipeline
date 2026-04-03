# Altimi Content Pipeline — Article Assembly Redesign

## Problem

Current approach asks the LLM to produce everything in one shot → produces raw markdown garbage.
The adtrip pipeline proves the right approach: LLM generates structured JSON, deterministic assembly builds the final HTML.

## Reference quality

- **Adtrip DPR articles:** `https://adtrip-deep-research.whitecontext.workers.dev/viewer/dpr/` — full HTML pages with brand CSS, TOC, images, infographics, FAQ, sources, CTA
- **Existing Altimi article:** `seo/altimi/content/article.html` — Chart.js visualizations, sidebar nav, reading progress, collapsible FAQ, numbered citations

## Target output

Each article = a complete standalone HTML page with:
1. Altimi-branded CSS (navy #0a1926, Matter font, DM Mono for labels, dashed separators)
2. Sidebar nav + TOC (desktop), mobile header (mobile)
3. Reading progress bar
4. Hero image (Gemini-generated, Altimi brand style)
5. 4-6 H2 sections, each 500-800 words, ~4000 words total
6. Section images between H2s (Gemini-generated)
7. 4-6 inline Chart.js canvases with REAL data from research
8. 1-2 data tables with Altimi styling (navy headers, RAG indicators where applicable)
9. Inline [N] citation markers linking to sources
10. FAQ as collapsible `<details>` elements (5-7 questions)
11. Sources section with numbered references (15-25 cited)
12. CTA section with Altimi branding (site-specific: Rapid Tech DD vs Discovery Sprint)
13. Schema.org Article + FAQ markup
14. OG meta tags

## Pipeline stages (redesigned)

### Stage 1: Deep Research (3 streams) ✅ WORKING
- 3 parallel research queries per article
- Results saved to R2 as markdown reports
- ~30 min per stream, 65s cooldown between

### Stage 2: Synthesis ✅ WORKING (needs tuning)
- Merge 3 research streams into unified brief
- Extract chartable data points as structured JSON
- Output: `unified.json` with narrative + data_points + conflicts + source_quality

### Stage 3: Outline (NEW — separate step)
- Input: synthesis + article metadata + site config
- LLM generates structured outline:
  ```json
  {
    "sections": [
      {
        "h2_title": "...",
        "h3_titles": ["...", "..."],
        "word_target": 700,
        "key_data_points": ["72% IT budgets on maintenance [1]", "..."],
        "chart": { "id": "budget_allocation", "type": "doughnut", "description": "..." } | null,
        "table": { "id": "comparison", "description": "..." } | null,
        "image_prompt": "..."
      }
    ],
    "faq": [{"question": "...", "answer": "..."}],
    "meta_description": "...",
    "subtitle": "..."
  }
  ```
- This is a SHORT call — just the structure, not the content
- Model: Gemini Pro, structured JSON output, ~30s

### Stage 4: Article generation (REWRITTEN)
- Input: outline + synthesis + full research reports
- LLM generates ONLY the article body as markdown
- Prompt enforces: ~4000 words, inline [N] citations, `<!-- CHART:id -->` and `<!-- TABLE:id -->` markers
- Does NOT generate charts/FAQ/images — those come from the outline
- Model: Gemini Pro with high token limit (65536 output), ~2-5 min

### Stage 5: Chart generation (NEW — deterministic)
- Input: outline (chart specs) + synthesis (data_points)
- For each chart in the outline, build a Chart.js config from real data points
- NO LLM call — this is deterministic code:
  ```typescript
  function buildChartConfig(chartSpec, dataPoints) {
    // Match data points to chart spec
    // Build Chart.js JSON with labels, datasets, colors
    // Use Altimi palette: navy #0a1926, blue #419AF0, magenta #D34489
  }
  ```
- Actually, we DO need an LLM call here — to map research data points to chart configs accurately
- Model: Gemini Flash (fast, cheap), structured JSON output

### Stage 6: Image generation ✅ WORKING (needs brand tuning)
- Input: outline (image_prompts)
- Gemini image generation with Altimi brand system prompt
- Text-only prompts (no reference images)
- Output: hero.jpg + section_N.jpg saved to R2
- 3s delay between image requests

### Stage 7: HTML Assembly (NEW — deterministic, no LLM)
- Input: article markdown + chart configs + outline (FAQ, tables) + images + site config
- Deterministic function that builds complete HTML:
  1. Convert markdown → HTML (with heading IDs)
  2. Build TOC from headings
  3. Insert images after each H2
  4. Replace `<!-- CHART:id -->` markers with `<canvas>` + Chart.js init script
  5. Replace `<!-- TABLE:id -->` markers with styled `<table>` HTML
  6. Build FAQ HTML from outline
  7. Build sources HTML from citations
  8. Build CTA HTML from site config
  9. Wrap in full HTML template with Altimi CSS, Schema.org, OG tags
- Output: complete HTML file saved to R2

### Stage 8: QA (NEW)
- Word count check (≥3500 words)
- Chart count check (≥4 charts)
- Image count check (≥3 images)
- Citation count check (≥10 unique sources)
- FAQ count check (≥5 questions)
- All [N] citations have matching entries in sources
- No broken chart/table markers remaining
- Output: QA score JSON

### Stage 9: Publish ✅ WORKING (needs update for HTML approach)
- Option A: Push HTML to R2, serve via Worker route `/resources/:slug`
- Option B: Push as Next.js page.tsx to GitHub (current approach — needs rewrite)
- **Recommendation: Option A** — serve HTML directly from R2 via the target site's Worker
  - Add a catch-all route to altimitech.com and altimi-dev.com Workers
  - `/resources/:slug` → fetch HTML from R2 bucket → serve
  - No rebuild needed, instant publish

## Workflow mapping

```
DeepResearchWorkflow (existing):
  load-config → [submit-stream → poll-stream → save → cooldown] × 3 → finalize

ArticleGenWorkflow (REWRITTEN):
  load-research → synthesize → save-synthesis
  → cooldown → generate-outline → save-outline
  → cooldown → generate-article → save-article
  → cooldown → generate-charts → save-charts
  → generate-images (hero + sections) → save-images
  → assemble-html → save-html
  → qa-check → save-qa
  → finalize

PublishWorkflow (SIMPLIFIED):
  load-html → upload-to-r2 → update-dns/route → finalize
```

## Altimi CSS template

Based on the existing `article.html` and Altimi Design Guidelines, adapted from adtrip's pattern:

```css
:root {
  --navy: #0a1926;
  --white: #ffffff;
  --off-white: #f5f5f5;
  --text-primary: #0a1926;
  --text-muted: #333333;
  --blue: #419AF0;
  --magenta: #D34489;
  --border: rgba(10, 25, 38, 0.15);
}
```

- Headings: navy, font-weight 400 (Matter Regular, never bold)
- Labels: DM Mono, uppercase, letter-spacing 0.65px
- Charts: navy/blue/magenta palette
- Tables: navy headers, alternating row bg
- FAQ: collapsible details with navy border
- CTA: navy bg with gradient blobs (magenta + blue)
- Sources: small text, navy links

## Implementation order

1. Rewrite `ArticleGenWorkflow` with separate outline/article/charts/assembly steps
2. Build `assembleAltimiHtml()` function — the HTML template
3. Build chart config generation (Gemini Flash call)
4. Test on MOD#1 (research already in R2)
5. Add `/resources/:slug` route to both site Workers (serve HTML from R2)
6. Verify article renders correctly on altimi-dev.com
7. Run PE#1 through the same pipeline
8. Queue remaining 10 articles
