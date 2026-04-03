/**
 * Altimi article HTML assembly — deterministic, no LLM calls.
 * Produces a complete standalone HTML page with Altimi branding.
 */

import type { TargetSite } from "../types";
import { SITE_CONFIGS } from "./site-configs";

export interface ArticleAssemblyInput {
  slug: string;
  title: string;
  subtitle: string;
  metaDescription: string;
  targetSite: TargetSite;
  primaryKeyword: string;

  /** Markdown article body with <!-- CHART:id --> and <!-- TABLE:id --> markers */
  articleHtml: string;

  /** Chart.js configurations */
  charts: {
    id: string;
    type: string;
    title: string;
    labels: string[];
    datasets: { label: string; data: number[]; backgroundColor?: string | string[]; borderColor?: string }[];
    sourceNote: string;
  }[];

  /** Data tables */
  tables: {
    id: string;
    title: string;
    headers: string[];
    rows: string[][];
    sourceNote: string;
  }[];

  /** FAQ questions */
  faq: { question: string; answer: string }[];

  /** Cited sources */
  sources: { key: string; name: string; url: string; date: string }[];

  /** Image URLs (relative to article path) */
  heroImageUrl: string;
  sectionImageUrls: { url: string; alt: string }[];

  /** Reading time in minutes */
  readingTime: number;
}

// ── Altimi color palette ──
const CHART_COLORS = [
  "#0a1926", // navy
  "#419AF0", // blue
  "#D34489", // magenta
  "#333333", // dark gray
  "#f5f5f5", // off-white
  "#6B7280", // gray
];

// ── TOC builder ──
function buildToc(html: string): string {
  const headings: { id: string; text: string; level: number }[] = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>(.*?)<\/h[23]>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      id: match[2],
      text: match[3].replace(/<[^>]+>/g, ""),
    });
  }

  if (headings.length === 0) return "";

  let tocHtml = `<nav class="article-toc" aria-label="Table of Contents">
  <h4>Contents</h4>
  <ul>\n`;
  for (const h of headings) {
    const indent = h.level === 3 ? '    ' : '';
    const cls = h.level === 3 ? ' class="toc-h3"' : '';
    tocHtml += `${indent}<li${cls}><a href="#${h.id}">${h.text}</a></li>\n`;
  }
  tocHtml += `  </ul>\n</nav>`;
  return tocHtml;
}

// ── Chart script builder ──
function buildChartScripts(charts: ArticleAssemblyInput["charts"]): string {
  if (charts.length === 0) return "";

  const inits = charts.map((c, i) => {
    // Assign colors if not provided
    const datasets = c.datasets.map((ds, di) => ({
      ...ds,
      backgroundColor: ds.backgroundColor || CHART_COLORS[di % CHART_COLORS.length],
      borderColor: ds.borderColor || CHART_COLORS[di % CHART_COLORS.length],
    }));

    return `
    new Chart(document.getElementById('chart-${c.id}'), {
      type: '${c.type}',
      data: {
        labels: ${JSON.stringify(c.labels)},
        datasets: ${JSON.stringify(datasets)}
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          title: { display: true, text: ${JSON.stringify(c.title)}, font: { size: 15, weight: 'normal', family: "'DM Mono', monospace" }, color: '#0a1926', padding: { bottom: 16 } },
          legend: { display: ${datasets.length > 1}, labels: { font: { size: 12 }, color: '#333' } }
        },
        scales: ${c.type === 'radar' || c.type === 'doughnut' || c.type === 'pie' ? '{}' : "{ y: { beginAtZero: true, ticks: { color: '#666' }, grid: { color: 'rgba(10,25,38,0.06)' } }, x: { ticks: { color: '#666' }, grid: { display: false } } }"}
      }
    });`;
  }).join("\n");

  return `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
${inits}
});
</script>`;
}

// ── Insert charts into HTML ──
function insertCharts(html: string, charts: ArticleAssemblyInput["charts"]): string {
  for (const chart of charts) {
    const marker = `<!-- CHART:${chart.id} -->`;
    const replacement = `<div class="chart-block">
      <div class="chart-container"><canvas id="chart-${chart.id}"></canvas></div>
      ${chart.sourceNote ? `<p class="chart-source">${chart.sourceNote}</p>` : ""}
    </div>`;
    html = html.replace(marker, replacement);
  }
  return html;
}

// ── Insert tables into HTML ──
function insertTables(html: string, tables: ArticleAssemblyInput["tables"]): string {
  for (const table of tables) {
    const marker = `<!-- TABLE:${table.id} -->`;
    const headerCells = table.headers.map(h => `<th>${h}</th>`).join("");
    const bodyRows = table.rows.map(row =>
      `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`
    ).join("\n");
    const replacement = `<div class="table-block">
      ${table.title ? `<p class="table-title">${table.title}</p>` : ""}
      <div class="table-scroll">
        <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
      </div>
      ${table.sourceNote ? `<p class="table-source">${table.sourceNote}</p>` : ""}
    </div>`;
    html = html.replace(marker, replacement);
  }
  return html;
}

// ── Insert images after H2s ──
function insertSectionImages(html: string, images: { url: string; alt: string }[]): string {
  let imageIdx = 0;
  return html.replace(/<\/h2>/gi, (match) => {
    if (imageIdx < images.length) {
      const img = images[imageIdx++];
      return `</h2>\n<figure class="article-image"><img src="${img.url}" alt="${img.alt}" loading="lazy"></figure>`;
    }
    return match;
  });
}

// ── Build FAQ HTML ──
function buildFaqHtml(faq: { question: string; answer: string }[]): string {
  if (faq.length === 0) return "";

  const items = faq.map(f => `
    <details class="faq-item">
      <summary class="faq-question">${f.question}</summary>
      <div class="faq-answer"><p>${f.answer}</p></div>
    </details>`).join("\n");

  return `<section id="faq" class="faq-section">
    <span class="section-label">FAQ</span>
    <h2>Frequently Asked Questions</h2>
    ${items}
  </section>`;
}

// ── Build FAQ Schema.org ──
function buildFaqSchema(faq: { question: string; answer: string }[]): string {
  if (faq.length === 0) return "";
  const items = faq.map(f => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  }));
  return `<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items }, null, 2)}
</script>`;
}

// ── Build Sources HTML ──
function buildSourcesHtml(sources: { key: string; name: string; url: string; date: string }[]): string {
  if (sources.length === 0) return "";

  const items = sources.map(s => {
    const urlHtml = s.url ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${new URL(s.url).hostname}</a>` : "";
    return `<li id="ref-${s.key}">[${s.key}] ${s.name} (${s.date}). ${urlHtml}</li>`;
  }).join("\n");

  return `<section id="references" class="sources-section">
    <span class="section-label">Sources</span>
    <h2>Sources &amp; Citations</h2>
    <ol class="sources-list">${items}</ol>
  </section>`;
}

// ── Build CTA HTML ──
function buildCtaHtml(targetSite: TargetSite): string {
  const config = SITE_CONFIGS[targetSite];
  const ctaUrl = "https://meetings.hubspot.com/jacek-podoba";

  if (targetSite === "altimitech.com") {
    return `<section class="cta-section">
      <h3>Ready to De-Risk Your Next Deal?</h3>
      <p>Altimi's Rapid Tech DD provides a clear investment recommendation in 2–3 weeks — combining code sampling, AI assessment, and risk scoring.</p>
      <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer">Book a 20-minute call</a>
    </section>`;
  }

  return `<section class="cta-section">
    <h3>Ready to Unblock Your Roadmap?</h3>
    <p>Altimi's Modernization Discovery Sprint delivers a concrete execution plan in 2–4 weeks — architecture assessment, 90-day roadmap, and business case.</p>
    <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer">Book a Modernization Assessment</a>
  </section>`;
}

// ── Main assembly ──
export function assembleAltimiHtml(input: ArticleAssemblyInput): string {
  let { articleHtml } = input;

  // Insert charts, tables, images
  articleHtml = insertCharts(articleHtml, input.charts);
  articleHtml = insertTables(articleHtml, input.tables);
  articleHtml = insertSectionImages(articleHtml, input.sectionImageUrls);

  // Build components
  const tocHtml = buildToc(articleHtml);
  const faqHtml = buildFaqHtml(input.faq);
  const faqSchema = buildFaqSchema(input.faq);
  const sourcesHtml = buildSourcesHtml(input.sources);
  const ctaHtml = buildCtaHtml(input.targetSite);
  const chartScripts = buildChartScripts(input.charts);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${input.title} | Altimi Insights</title>
    <meta name="description" content="${input.metaDescription}">
    <meta name="keywords" content="${input.primaryKeyword}">

    <meta property="og:title" content="${input.title}">
    <meta property="og:description" content="${input.metaDescription}">
    <meta property="og:type" content="article">
    <meta property="og:image" content="${input.heroImageUrl}">

    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@300;400;500;600;700&display=swap');
        :root {
            --navy: #0a1926;
            --white: #ffffff;
            --off-white: #f5f5f5;
            --text-primary: #0a1926;
            --text-secondary: #333333;
            --text-muted: #666666;
            --blue: #419AF0;
            --magenta: #D34489;
            --border: rgba(10, 25, 38, 0.12);
            --bg-subtle: #f8f9fa;
        }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            line-height: 1.75;
            color: var(--text-primary);
            font-size: 1.0625rem;
            -webkit-font-smoothing: antialiased;
        }

        /* Reading progress */
        #progress-bar { position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, var(--blue), var(--magenta)); z-index: 100; transition: width 0.1s; }

        /* Section labels */
        .section-label { display: inline-block; font-family: 'DM Mono', monospace; font-size: 0.8125rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.065em; color: var(--text-muted); background: var(--off-white); padding: 4px 12px; border-radius: 4px; margin-bottom: 1rem; }

        /* Prose */
        .prose { font-size: 1.0625rem; }
        .prose p { margin-bottom: 1.5rem; }
        .prose h2 { color: var(--navy); font-size: 1.75rem; font-weight: 400; margin-top: 3rem; margin-bottom: 1.25rem; line-height: 1.3; letter-spacing: -0.01em; }
        .prose h3 { color: var(--navy); font-size: 1.25rem; font-weight: 500; margin-top: 2rem; margin-bottom: 0.75rem; line-height: 1.4; }
        .prose a { color: var(--blue); text-decoration: none; border-bottom: 1px solid rgba(65,154,240,0.3); transition: border-color 0.15s; }
        .prose a:hover { border-bottom-color: var(--blue); }
        .prose a[href^="#ref-"] { font-size: 0.75em; vertical-align: super; border-bottom: none; color: var(--blue); font-weight: 600; font-family: 'DM Mono', monospace; }
        .prose ul, .prose ol { margin: 1.5rem 0; padding-left: 1.5rem; }
        .prose li { margin-bottom: 0.5rem; }
        .prose ul li::marker { color: var(--blue); }
        .prose ol li::marker { color: var(--navy); font-weight: 600; }
        .prose blockquote { border-left: 4px solid var(--blue); background: var(--bg-subtle); padding: 1rem 1.5rem; margin: 1.5rem 0; border-radius: 0 0.5rem 0.5rem 0; font-style: italic; color: var(--text-secondary); }
        .prose strong { font-weight: 600; color: var(--navy); }
        .prose table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 0.9375rem; }
        .prose thead { background: var(--navy); color: white; }
        .prose th { padding: 0.875rem 1rem; text-align: left; font-weight: 500; font-family: 'DM Mono', monospace; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .prose td { padding: 0.875rem 1rem; border-bottom: 1px solid var(--border); vertical-align: top; }
        .prose tr:hover { background: var(--bg-subtle); }

        /* TOC */
        .article-toc { background: var(--bg-subtle); border-left: 4px solid var(--navy); padding: 1.5rem 2rem; margin-bottom: 2.5rem; border-radius: 0 0.5rem 0.5rem 0; }
        .article-toc h4 { margin: 0 0 1rem; font-family: 'DM Mono', monospace; font-weight: 500; color: var(--navy); font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.065em; }
        .article-toc ul { margin: 0; padding-left: 0; list-style: none; }
        .article-toc li { margin: 0.5rem 0; padding-left: 1rem; border-left: 2px solid transparent; }
        .article-toc li:hover { border-left-color: var(--blue); }
        .article-toc li.toc-h3 { padding-left: 2rem; }
        .article-toc a { color: var(--text-secondary); text-decoration: none; font-size: 0.9375rem; }
        .article-toc a:hover { color: var(--navy); }

        /* Charts */
        .chart-block { background: var(--bg-subtle); border-radius: 0.75rem; padding: 1.5rem; margin: 2rem 0; }
        .chart-container { position: relative; width: 100%; height: 380px; max-height: 450px; }
        .chart-source { text-align: right; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.75rem; font-family: 'DM Mono', monospace; }
        @media (max-width: 768px) { .chart-container { height: 280px; } }

        /* Tables */
        .table-block { margin: 2rem 0; border-radius: 0.75rem; overflow: hidden; border: 1px solid var(--border); }
        .table-title { font-family: 'DM Mono', monospace; font-size: 0.8125rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 1rem 1rem 0; margin: 0; }
        .table-scroll { overflow-x: auto; }
        .table-source { text-align: right; font-size: 0.75rem; color: var(--text-muted); padding: 0.5rem 1rem 1rem; margin: 0; font-family: 'DM Mono', monospace; }

        /* Images */
        .article-image { margin: 2rem 0; }
        .article-image img { width: 100%; border-radius: 0.75rem; box-shadow: 0 4px 12px -2px rgba(10,25,38,0.1), 0 2px 4px -1px rgba(10,25,38,0.06); }

        /* FAQ */
        .faq-section { background: var(--bg-subtle); padding: 2.5rem; border-radius: 0.75rem; margin-top: 3rem; }
        .faq-section h2 { font-size: 1.5rem; font-weight: 400; color: var(--navy); margin-bottom: 1.5rem; }
        .faq-item { border-bottom: 1px solid var(--border); }
        .faq-item:last-child { border-bottom: none; }
        .faq-question { padding: 1.25rem 0; font-weight: 500; color: var(--navy); cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
        .faq-question::after { content: '+'; font-size: 1.25rem; color: var(--text-muted); transition: transform 0.2s; }
        details[open] .faq-question::after { transform: rotate(45deg); }
        .faq-question::-webkit-details-marker { display: none; }
        .faq-answer { padding: 0 0 1.25rem; color: var(--text-secondary); line-height: 1.65; }

        /* Sources */
        .sources-section { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--border); }
        .sources-section h2 { font-size: 1rem; font-weight: 400; color: var(--text-muted); margin-bottom: 1rem; }
        .sources-list { padding-left: 0; list-style: none; }
        .sources-list li { font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.5rem; font-family: 'DM Mono', monospace; line-height: 1.5; }
        .sources-list a { color: var(--blue); text-decoration: none; }
        .sources-list a:hover { text-decoration: underline; }

        /* CTA */
        .cta-section { background: var(--navy); color: white; padding: 2.5rem; border-radius: 0.75rem; margin-top: 3rem; text-align: center; }
        .cta-section h3 { font-size: 1.5rem; font-weight: 400; margin-bottom: 0.75rem; }
        .cta-section p { opacity: 0.8; margin-bottom: 0; font-size: 1rem; }
        .cta-section a { display: inline-block; background: white; color: var(--navy); padding: 0.875rem 2rem; border-radius: 0.5rem; font-family: 'DM Mono', monospace; font-weight: 500; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; margin-top: 1.25rem; transition: transform 0.15s, box-shadow 0.15s; }
        .cta-section a:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

        /* Responsive */
        @media (max-width: 640px) {
            body { font-size: 1rem; }
            .prose h2 { font-size: 1.5rem; }
            .article-toc, .faq-section, .cta-section { padding: 1.5rem; }
        }
    </style>
</head>
<body class="bg-white">
    <div id="progress-bar" style="width: 0%"></div>

    <header class="bg-[#0a1926] text-white py-4">
      <div class="max-w-3xl mx-auto px-4 flex items-center justify-between">
        <a href="${input.targetSite === 'altimitech.com' ? 'https://altimitech.com' : 'https://altimi-dev.com'}" class="font-mono text-sm tracking-wider opacity-80 hover:opacity-100">← altimi</a>
        <span class="font-mono text-xs tracking-wider opacity-50">${input.readingTime} min read</span>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
        ${input.heroImageUrl ? `<figure class="article-image mb-8"><img src="${input.heroImageUrl}" alt="${input.title}" loading="lazy"></figure>` : ""}

        <header class="mb-8">
            <span class="section-label">${input.primaryKeyword}</span>
            <h1 class="text-3xl md:text-4xl font-normal mb-4" style="color: var(--navy); line-height: 1.2; letter-spacing: -0.02em;">${input.title}</h1>
            ${input.subtitle ? `<p class="text-lg" style="color: var(--text-secondary);">${input.subtitle}</p>` : ""}
        </header>

        ${tocHtml}

        <article class="prose prose-lg max-w-none">
            ${articleHtml}
        </article>

        ${faqHtml}
        ${ctaHtml}
        ${sourcesHtml}
    </main>

    ${faqSchema}
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": ${JSON.stringify(input.title)},
        "description": ${JSON.stringify(input.metaDescription)},
        "publisher": { "@type": "Organization", "name": "Altimi", "url": "https://${input.targetSite}" },
        "keywords": ${JSON.stringify(input.primaryKeyword)},
        "inLanguage": "en"
    }
    </script>

    ${chartScripts}

    <script>
    // Reading progress bar
    window.addEventListener('scroll', function() {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      document.getElementById('progress-bar').style.width = pct + '%';
    });
    </script>
</body>
</html>`;
}
