import { Router, type IRouter } from 'express';
import * as cheerio from 'cheerio';
import jwt from 'jsonwebtoken';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface SchemaDeepDive {
  /** @type values found in JSON-LD blocks on the page */
  typesFound: string[];
  /** High-value schema types not present that would improve rich-snippet eligibility */
  typesRecommended: string[];
  /** Warnings about missing or malformed structured data */
  warnings: string[];
  /** 0–100 score based on coverage and correctness */
  score: number;
  /** Human-readable summary */
  summary: string;
}

export interface ScanResult {
  url: string;
  score: number;
  issues: ScanIssue[];
  fetchTimeMs: number;
  /** Present when the response is gated — total issues found before slicing */
  totalIssues?: number;
  gated?: boolean;
  /** Schema.org structured-data deep-dive (Optimizer Pro only) */
  schemaDeepDive?: SchemaDeepDive;
  /** White-label flag — suppress BWO branding in PDF exports (Optimizer Pro only) */
  whiteLabel?: boolean;
}

// ---------------------------------------------------------------------------
// Schema.org deep-dive analyser (Optimizer Pro exclusive)
// ---------------------------------------------------------------------------

const HIGH_VALUE_SCHEMA_TYPES = [
  'Organization',
  'LocalBusiness',
  'WebSite',
  'WebPage',
  'BreadcrumbList',
  'FAQPage',
  'Article',
  'BlogPosting',
  'Product',
  'SiteLinksSearchBox',
];

function analyseSchemaOrg(html: string): SchemaDeepDive {
  const $ = cheerio.load(html);
  const typesFound: string[] = [];
  const warnings: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).html() ?? '';
      type LdNode = { '@type'?: string | string[]; '@graph'?: LdNode[] };
      const parsed = JSON.parse(text) as LdNode;

      function extractTypes(node: LdNode) {
        const t = node['@type'];
        if (typeof t === 'string') typesFound.push(t);
        else if (Array.isArray(t)) typesFound.push(...t.filter((x): x is string => typeof x === 'string'));
        if (Array.isArray(node['@graph'])) node['@graph'].forEach(extractTypes);
      }
      extractTypes(parsed);
    } catch {
      warnings.push('Found a JSON-LD block with invalid syntax — check for parse errors.');
    }
  });

  const uniqueTypes = [...new Set(typesFound)];

  // Recommend the most valuable missing types (up to 4)
  const typesRecommended = HIGH_VALUE_SCHEMA_TYPES.filter(
    (t) => !uniqueTypes.includes(t),
  ).slice(0, 4);

  // Generate actionable warnings
  if (uniqueTypes.length === 0) {
    warnings.push(
      'No structured data found — adding schema.org markup unlocks rich-snippet eligibility in Google Search.',
    );
  }
  if (!uniqueTypes.some((t) => ['Organization', 'LocalBusiness'].includes(t))) {
    warnings.push(
      'Missing Organization or LocalBusiness schema — required for knowledge panel and brand-authority signals.',
    );
  }
  if (!uniqueTypes.includes('BreadcrumbList') && uniqueTypes.length > 0) {
    warnings.push(
      'Missing BreadcrumbList — add it to enable breadcrumb rich results in search.',
    );
  }
  if (!uniqueTypes.some((t) => ['WebSite', 'WebPage'].includes(t))) {
    warnings.push(
      'Missing WebSite or WebPage schema — these anchor your structured-data graph and improve entity understanding.',
    );
  }

  // Score: coverage × 100, minus 10 per warning, floor 0
  const IDEAL_COUNT = 4;
  const coverage = Math.min(uniqueTypes.length / IDEAL_COUNT, 1);
  const score = Math.max(0, Math.round(coverage * 100 - warnings.length * 10));

  const summary =
    uniqueTypes.length === 0
      ? 'No schema.org markup detected. Add structured data to improve rich-snippet eligibility and search-engine entity understanding.'
      : `Found ${uniqueTypes.length} schema type${uniqueTypes.length !== 1 ? 's' : ''}: ${uniqueTypes.join(', ')}.${typesRecommended.length > 0 ? ` Consider adding: ${typesRecommended.slice(0, 2).join(', ')}.` : ' Good coverage!'}`;

  return { typesFound: uniqueTypes, typesRecommended, warnings, score, summary };
}

// ---------------------------------------------------------------------------
// Scoring weights (points deducted per issue)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  high: 15,
  medium: 8,
  low: 4,
};

// ---------------------------------------------------------------------------
// Analyser
// ---------------------------------------------------------------------------

function analyseHtml(html: string, url: string, fetchTimeMs: number): ScanResult {
  const $ = cheerio.load(html);
  const issues: ScanIssue[] = [];

  // ── 1. Title tag ──────────────────────────────────────────────────────────
  const title = $('title').first().text().trim();
  if (!title) {
    issues.push({
      severity: 'high',
      title: 'Page title is missing',
      detail:
        'No <title> tag found. Search engines use the title as the primary headline in results — without one, your page will likely rank poorly and get fewer clicks.',
    });
  } else if (title.length < 30) {
    issues.push({
      severity: 'medium',
      title: 'Page title is too short',
      detail: `Your title "${title}" is only ${title.length} characters. Aim for 50–60 characters to make full use of search result space and improve click-through rates.`,
    });
  } else if (title.length > 60) {
    issues.push({
      severity: 'low',
      title: 'Page title may be truncated in search results',
      detail: `Your title is ${title.length} characters — Google typically shows up to 60. The excess will be cut off with "…" in search results.`,
    });
  }

  // ── 2. Meta description ───────────────────────────────────────────────────
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? '';
  if (!metaDesc) {
    issues.push({
      severity: 'high',
      title: 'Meta description is missing',
      detail:
        'No meta description tag found. Search engines often show this text under your page title in results. Without it, they\'ll guess — usually with poor results.',
    });
  } else if (metaDesc.length < 80) {
    issues.push({
      severity: 'medium',
      title: 'Meta description is too short',
      detail: `At ${metaDesc.length} characters, your meta description is too brief. Aim for 120–155 characters to give searchers a compelling reason to click.`,
    });
  } else if (metaDesc.length > 160) {
    issues.push({
      severity: 'low',
      title: 'Meta description will be truncated in search results',
      detail: `Your meta description is ${metaDesc.length} characters — Google truncates at ~155. Tighten the copy so your full message is always visible.`,
    });
  }

  // ── 3. H1 tag ─────────────────────────────────────────────────────────────
  const h1s = $('h1');
  if (h1s.length === 0) {
    issues.push({
      severity: 'high',
      title: 'No H1 heading found on the page',
      detail:
        'Every page should have exactly one H1 that clearly states what the page is about. It\'s a strong SEO signal and orients visitors who land mid-page.',
    });
  } else if (h1s.length > 1) {
    issues.push({
      severity: 'medium',
      title: `Multiple H1 headings found (${h1s.length})`,
      detail:
        'Having more than one H1 dilutes its SEO weight and makes the page hierarchy confusing. Consolidate to a single, clear H1.',
    });
  } else {
    const h1Text = h1s.first().text().trim();
    if (h1Text.length < 10) {
      issues.push({
        severity: 'medium',
        title: 'H1 heading is too vague or short',
        detail: `Your H1 is "${h1Text}" — only ${h1Text.length} characters. A meaningful H1 includes your core value proposition and primary keyword.`,
      });
    }
  }

  // ── 4. Heading hierarchy ──────────────────────────────────────────────────
  const headingLevels: number[] = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const tagName = (el as unknown as { name?: string }).name ?? '';
    headingLevels.push(parseInt(tagName.slice(1), 10));
  });
  let hierarchyBroken = false;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) {
      hierarchyBroken = true;
      break;
    }
  }
  if (hierarchyBroken) {
    issues.push({
      severity: 'medium',
      title: 'Heading hierarchy skips levels',
      detail:
        'Your headings jump levels (e.g. H1 → H3), which confuses screen readers and weakens SEO. Use a logical H1 → H2 → H3 structure without gaps.',
    });
  }

  // ── 5. Open Graph tags ────────────────────────────────────────────────────
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const missingOg: string[] = [];
  if (!ogTitle) missingOg.push('og:title');
  if (!ogDesc) missingOg.push('og:description');
  if (!ogImage) missingOg.push('og:image');
  if (missingOg.length > 0) {
    issues.push({
      severity: missingOg.length >= 2 ? 'medium' : 'low',
      title: `Open Graph tags missing: ${missingOg.join(', ')}`,
      detail: `When your page is shared on LinkedIn, Facebook, or Slack, it will show a blank or broken preview. Add ${missingOg.join(', ')} to control how your page appears when shared.`,
    });
  }

  // ── 6. Twitter/X Card ─────────────────────────────────────────────────────
  const twitterCard = $('meta[name="twitter:card"]').attr('content');
  if (!twitterCard) {
    issues.push({
      severity: 'low',
      title: 'Twitter/X card meta tag is missing',
      detail:
        'Without a twitter:card tag, links shared on X (Twitter) show as plain text instead of a rich card. Add <meta name="twitter:card" content="summary_large_image"> to enable rich previews.',
    });
  }

  // ── 7. Viewport meta tag ──────────────────────────────────────────────────
  const viewport = $('meta[name="viewport"]').attr('content');
  if (!viewport) {
    issues.push({
      severity: 'high',
      title: 'Viewport meta tag is missing (mobile-unfriendly)',
      detail:
        'No viewport tag found. Without it, mobile browsers render your page at desktop width and shrink it — breaking your layout and damaging rankings, since Google uses mobile-first indexing.',
    });
  }

  // ── 8. Images missing alt text ────────────────────────────────────────────
  const images = $('img');
  const imagesWithoutAlt = images.filter(
    (_, el) => !$(el).attr('alt') && $(el).attr('alt') !== '',
  );
  if (imagesWithoutAlt.length > 0) {
    const count = imagesWithoutAlt.length;
    issues.push({
      severity: count >= 3 ? 'medium' : 'low',
      title: `${count} image${count > 1 ? 's' : ''} missing alt text`,
      detail: `${count} <img> element${count > 1 ? 's' : ''} ${count > 1 ? 'have' : 'has'} no alt attribute. Alt text is read by screen readers and indexed by search engines — missing it hurts both accessibility and SEO.`,
    });
  }

  // ── 9. CTA detection ─────────────────────────────────────────────────────
  const ctaKeywords = /\b(get started|sign up|start|buy|order|subscribe|contact|book|request|demo|try|free|download|learn more)\b/i;
  const buttons = $('button, a[href]').filter((_, el) => {
    const text = $(el).text().trim();
    return ctaKeywords.test(text);
  });
  if (buttons.length === 0) {
    issues.push({
      severity: 'high',
      title: 'No clear call-to-action found',
      detail:
        "We couldn't detect any CTA buttons or links (e.g. \"Get started\", \"Sign up\", \"Book a demo\"). Without a clear next step, visitors leave without converting.",
    });
  }

  // ── 10. Canonical tag ─────────────────────────────────────────────────────
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical) {
    issues.push({
      severity: 'low',
      title: 'Canonical tag is missing',
      detail:
        'No <link rel="canonical"> found. Without it, search engines may index duplicate versions of your page (e.g. with/without trailing slash, with query strings), splitting your SEO value.',
    });
  }

  // ── 11. HTTPS ─────────────────────────────────────────────────────────────
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      issues.push({
        severity: 'high',
        title: 'Site is not using HTTPS',
        detail:
          'Your URL uses HTTP, not HTTPS. Browsers show a "Not Secure" warning, and Google uses HTTPS as a ranking signal. Switch to HTTPS immediately.',
      });
    }
  } catch {
    // ignore URL parse errors
  }

  // ── 12. Page load time ────────────────────────────────────────────────────
  if (fetchTimeMs > 3000) {
    issues.push({
      severity: 'high',
      title: 'Slow server response time',
      detail: `The server took ${(fetchTimeMs / 1000).toFixed(1)}s to respond. Google recommends under 200ms for Time to First Byte. Slow response times hurt rankings and increase bounce rates.`,
    });
  } else if (fetchTimeMs > 1500) {
    issues.push({
      severity: 'medium',
      title: 'Server response time is above average',
      detail: `Response took ${(fetchTimeMs / 1000).toFixed(1)}s. While not critical, optimising to under 1s will improve both user experience and Core Web Vitals scores.`,
    });
  }

  // ── 13. Structured data ───────────────────────────────────────────────────
  const jsonLd = $('script[type="application/ld+json"]');
  if (jsonLd.length === 0) {
    issues.push({
      severity: 'low',
      title: 'No structured data (Schema.org) found',
      detail:
        'Adding JSON-LD structured data (e.g. Organization, Product, or FAQ schema) helps search engines understand your content and can unlock rich results like star ratings and FAQs in SERPs.',
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const deducted = issues.reduce((sum, i) => sum + WEIGHTS[i.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - deducted));

  return { url, score, issues, fetchTimeMs };
}

// ---------------------------------------------------------------------------
// POST /api/scan
// ---------------------------------------------------------------------------

// Severity sort order — high issues bubble to the top
const SEVERITY_ORDER: Record<ScanIssue['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Fetches the given URL and runs a set of on-page optimisation checks.
 *
 * Body:   { url: string }
 * Header: Authorization: Bearer <scan-token>   (issued by POST /api/issue-scan-token)
 *
 * The client-supplied `tier` field is intentionally ignored — tier is derived
 * solely from the signed JWT in the Authorization header so it cannot be
 * spoofed by manipulating the request body.
 *
 * Returns: ScanResult
 */
router.post('/scan', async (req, res): Promise<void> => {
  const { url } = req.body as { url?: unknown };

  // Determine tier from verified JWT — never trust the request body.
  let isPaid = false;
  let isPro = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = process.env.SESSION_SECRET;
    if (secret) {
      try {
        const payload = jwt.verify(token, secret) as { tier?: string; product?: string };
        isPaid = payload.tier === 'paid';
        isPro = payload.product === 'optimizer-pro';
      } catch (err) {
        // Token provided but expired — tell the client explicitly so they can re-auth
        if (err instanceof Error && err.name === 'TokenExpiredError') {
          res.status(401).json({
            error: 'Your paid scan access has expired. Visit your account page to re-authenticate.',
            tokenExpired: true,
          });
          return;
        }
        // Malformed or tampered token — treat as free tier
        isPaid = false;
      }
    }
  }

  if (typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ error: 'url is required.' });
    return;
  }

  // Normalise: add https:// if no protocol given
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  // Validate the URL
  try {
    new URL(targetUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL. Please include a full domain, e.g. https://example.com' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const start = Date.now();
  let html: string;

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'BusinessWebOptimizer/1.0 (+https://businessweboptimizer.com/bot)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const fetchTimeMs = Date.now() - start;

    if (!response.ok) {
      res.status(422).json({
        error: `Could not fetch that URL — server returned ${response.status}. Make sure the URL is publicly accessible.`,
      });
      return;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      res.status(422).json({ error: 'URL does not point to an HTML page.' });
      return;
    }

    html = await response.text();
    clearTimeout(timeout);

    const result = analyseHtml(html, targetUrl, fetchTimeMs);

    // Sort issues by severity before any gating
    result.issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    const totalIssues = result.issues.length;

    // Free tier: return only the top 3 issues
    const FREE_LIMIT = 3;
    if (!isPaid && totalIssues > FREE_LIMIT) {
      result.issues = result.issues.slice(0, FREE_LIMIT);
      result.gated = true;
      result.totalIssues = totalIssues;
    }

    // Optimizer Pro: schema.org deep-dive + white-label flag
    if (isPro) {
      result.schemaDeepDive = analyseSchemaOrg(html);
      result.whiteLabel = true;
    }

    req.log.info(
      {
        url: targetUrl,
        score: result.score,
        total: totalIssues,
        returned: result.issues.length,
        tier: isPaid ? (isPro ? 'optimizer-pro' : 'optimizer') : 'free',
      },
      'Scan complete',
    );
    res.json(result);
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      res.status(504).json({ error: 'The page took too long to load (>15s). Try again or check the URL.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    req.log.error({ err, url: targetUrl }, 'Scan fetch failed');
    res.status(502).json({ error: `Could not reach that URL: ${msg}` });
  }
});

export default router;
