/**
 * Business Web Dev logo — inline SVG, pixel-perfect at any size.
 *
 * Rebuilt from the official brand style guide.
 *
 * Variants:
 *   'default' — full horizontal logo, dark text  (light backgrounds)
 *   'white'   — full horizontal logo, all white   (dark / colour backgrounds)
 *   'icon'    — hex mark only                     (favicons, avatars, etc.)
 */

interface BrandLogoProps {
  variant?: 'default' | 'white' | 'icon';
  /** Height in px. Width scales proportionally. */
  height?: number;
  className?: string;
}

// ── Brand tokens ────────────────────────────────────────────────────────────
const NAVY  = '#0A1F44';   // outer hexagon fill + "BUSINESS" text
const BLUE  = '#1A6FE8';   // inner hexagon fill + "WEB DEV" text
const WHITE = '#FFFFFF';

// ── Hex icon (100 × 100 viewBox) ────────────────────────────────────────────
//
// Pointy-top hexagon (vertices at top & bottom, flat sides L/R).
// Outer hex: radius ≈ 46; Inner hex: radius ≈ 37.
//
// The "B" letterform is built from three pieces:
//   1. Left vertical bar
//   2. Upper bump — right-pointing angular arrow (pentagon)
//   3. Lower bump — right-pointing angular arrow (pentagon), slightly taller
//
function HexIcon({ white = false }: { white?: boolean }) {
  const outerFill = white ? WHITE    : NAVY;
  const innerFill = white ? '#B8D4FF' : BLUE;
  const bFill     = white ? NAVY     : WHITE;

  return (
    <g>
      {/* ── Outer hexagon (navy / white) ── */}
      <polygon
        points="50,4 90,27 90,73 50,96 10,73 10,27"
        fill={outerFill}
      />

      {/* ── Inner hexagon (blue / light-blue) ── */}
      <polygon
        points="50,14 82,32 82,68 50,86 18,68 18,32"
        fill={innerFill}
      />

      {/* ── B letterform — white ── */}

      {/* Left vertical bar — full height of both bumps */}
      <rect x="27" y="23" width="10" height="54" fill={bFill} />

      {/* Upper bump: right-pointing arrow shape (pentagon)
            Top-left → top-right → point → bottom-right → bottom-left */}
      <polygon
        points="37,23 63,23 73,36 63,49 37,49"
        fill={bFill}
      />

      {/* Gap between bumps: y=49–51 (2 px, matches the inner-hex shadow) */}

      {/* Lower bump: slightly taller arrow (pentagon) */}
      <polygon
        points="37,51 65,51 75,64 65,77 37,77"
        fill={bFill}
      />
    </g>
  );
}

// ── Full horizontal logo ─────────────────────────────────────────────────────
//
// viewBox 296 × 58
//   [0–58]    hex icon (58 × 58 square)
//   [70–296]  wordmark + tagline
//
export function BrandLogo({
  variant  = 'default',
  height   = 40,
  className = '',
}: BrandLogoProps) {

  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 100 100"
        height={height}
        width={height}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Business Web Dev"
        className={className}
      >
        <HexIcon />
      </svg>
    );
  }

  const isWhite  = variant === 'white';
  const textTop  = isWhite ? WHITE : NAVY;
  const textBot  = isWhite ? WHITE : BLUE;
  const tagColor = isWhite ? `${WHITE}BB` : `${NAVY}99`;

  return (
    <svg
      viewBox="0 0 296 58"
      height={height}
      width={Math.round((height / 58) * 296)}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Business Web Dev"
      className={className}
    >
      {/* Hex icon: 100×100 viewBox scaled to 58×58 */}
      <g transform="scale(0.58)">
        <HexIcon white={isWhite} />
      </g>

      {/* "BUSINESS" — upper wordmark */}
      <text
        x="68"
        y="22"
        fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900"
        fontSize="18"
        letterSpacing="2.5"
        fill={textTop}
      >
        BUSINESS
      </text>

      {/* "WEB DEV" — lower wordmark, bright blue */}
      <text
        x="68"
        y="42"
        fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900"
        fontSize="18"
        letterSpacing="2.5"
        fill={textBot}
      >
        WEB DEV
      </text>

      {/* Tagline: dash – text – dash */}
      <line x1="68" y1="50" x2="82" y2="50" stroke={tagColor} strokeWidth="1" />
      <text
        x="85"
        y="53"
        fontFamily="Arial,sans-serif"
        fontWeight="400"
        fontSize="5.5"
        letterSpacing="1.5"
        fill={tagColor}
      >
        WE BUILD WEBSITES THAT GROW BUSINESSES
      </text>
      <line x1="275" y1="50" x2="289" y2="50" stroke={tagColor} strokeWidth="1" />
    </svg>
  );
}
