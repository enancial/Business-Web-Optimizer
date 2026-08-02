/**
 * Sample HTML fixture that intentionally fails the majority of scan checks.
 *
 * Missing on purpose (to generate > FREE_LIMIT=3 issues):
 *   - meta description          → HIGH
 *   - viewport meta             → HIGH
 *   - H1 tag                    → HIGH
 *   - alt text on two images    → MEDIUM ×2
 *   - Open Graph tags           → MEDIUM
 *   - canonical link            → MEDIUM
 *   - schema.org structured data → LOW
 *   - Twitter Card tags         → LOW
 */
export const BAD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Page</title>
</head>
<body>
  <img src="logo.png">
  <img src="hero.jpg">
  <p>This page deliberately omits every best-practice SEO element.</p>
  <p>It is used by automated tests to verify scan gating logic.</p>
</body>
</html>`;

/**
 * A well-optimised page that should produce ≤ 3 issues.
 * (Gives the paid full-report test something to contrast against.)
 */
export const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Good SEO Test Page</title>
  <meta name="description" content="A well-optimised test page for automated scanning." />
  <link rel="canonical" href="https://example.com/" />
  <meta property="og:title" content="Good SEO Test Page" />
  <meta property="og:description" content="A well-optimised test page." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://example.com/" />
  <meta name="twitter:card" content="summary" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Good SEO Test Page"}</script>
  <link rel="icon" href="/favicon.ico" />
</head>
<body>
  <h1>Good SEO Test Page</h1>
  <img src="logo.png" alt="Site logo" />
  <p>This page has all required SEO elements.</p>
</body>
</html>`;
