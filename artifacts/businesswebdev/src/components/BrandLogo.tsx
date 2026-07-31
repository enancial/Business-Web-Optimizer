/**
 * Business Web Dev logo — rendered as inline SVG so it scales perfectly
 * at every size and works on any background without image loading.
 *
 * Variants:
 *   'default' — full horizontal logo, dark text  (use on white/light backgrounds)
 *   'white'   — full horizontal logo, all white   (use on dark backgrounds)
 *   'icon'    — hexagon mark only                 (header icon, favicon, etc.)
 */

interface BrandLogoProps {
  variant?: 'default' | 'white' | 'icon';
  /** Height of the rendered logo in px. Width scales automatically. */
  height?: number;
  className?: string;
}

// ── Brand colour tokens ─────────────────────────────────────────────────────
const NAVY  = '#0D1B3E';   // "BUSINESS" text + hex border fill
const BLUE  = '#1565D6';   // "WEB DEV" text + hex inner fill
const WHITE = '#FFFFFF';

// ── Hexagon icon (100 × 100 viewBox) ───────────────────────────────────────
// Pointy-top regular hexagon, centred at (50, 50), radius ≈ 47
function HexIcon({ white = false }: { white?: boolean }) {
  const outerFill = white ? WHITE    : NAVY;
  const innerFill = white ? '#B8D0FF' : BLUE;
  const bFill     = white ? NAVY     : WHITE;

  return (
    <g>
      {/* Outer hexagon — dark navy */}
      <polygon
        points="50,3 88,25 88,75 50,97 12,75 12,25"
        fill={outerFill}
      />
      {/* Inner hexagon — bright blue */}
      <polygon
        points="50,14 79,31 79,69 50,86 21,69 21,31"
        fill={innerFill}
      />
      {/* Bold geometric "B" in white */}
      {/* Left vertical bar */}
      <rect x="27" y="27" width="10" height="46" fill={bFill} />
      {/* Top bump */}
      <polygon
        points="37,27 62,27 68,33 68,46 62,48 37,48"
        fill={bFill}
      />
      {/* Bottom bump (slightly taller for typographic balance) */}
      <polygon
        points="37,52 64,52 71,59 71,68 64,73 37,73"
        fill={bFill}
      />
    </g>
  );
}

// ── Full horizontal logo ────────────────────────────────────────────────────
export function BrandLogo({ variant = 'default', height = 40, className = '' }: BrandLogoProps) {
  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 100 100"
        height={height}
        width={height}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Business Web Dev logo"
        className={className}
      >
        <HexIcon />
      </svg>
    );
  }

  const isWhite  = variant === 'white';
  const textTop  = isWhite ? WHITE : NAVY;
  const textBot  = isWhite ? WHITE : BLUE;
  const tagColor = isWhite ? `${WHITE}99` : `${NAVY}99`;

  // viewBox: 280 × 56 — icon 56 wide + 12 gap + text block
  return (
    <svg
      viewBox="0 0 280 56"
      height={height}
      width={(height / 56) * 280}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Business Web Dev logo"
      className={className}
    >
      {/* Hex icon scaled to 56×56 */}
      <g transform="scale(0.56)">
        <HexIcon white={isWhite} />
      </g>

      {/* "BUSINESS" */}
      <text
        x="70"
        y="21"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize="16"
        letterSpacing="2"
        fill={textTop}
      >
        BUSINESS
      </text>

      {/* "WEB DEV" */}
      <text
        x="70"
        y="40"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize="16"
        letterSpacing="2"
        fill={textBot}
      >
        WEB DEV
      </text>

      {/* Tagline rule left */}
      <line x1="70" y1="48" x2="88" y2="48" stroke={tagColor} strokeWidth="1" />
      {/* Tagline text */}
      <text
        x="91"
        y="51"
        fontFamily="'Arial', sans-serif"
        fontWeight="400"
        fontSize="5.5"
        letterSpacing="1.2"
        fill={tagColor}
      >
        WE BUILD WEBSITES THAT GROW BUSINESSES
      </text>
      {/* Tagline rule right */}
      <line x1="260" y1="48" x2="278" y2="48" stroke={tagColor} strokeWidth="1" />
    </svg>
  );
}

// ── Convenience: icon-only SVG string for favicon injection ────────────────
export const FAVICON_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="50,3 88,25 88,75 50,97 12,75 12,25" fill="${NAVY}"/>
  <polygon points="50,14 79,31 79,69 50,86 21,69 21,31" fill="${BLUE}"/>
  <rect x="27" y="27" width="10" height="46" fill="${WHITE}"/>
  <polygon points="37,27 62,27 68,33 68,46 62,48 37,48" fill="${WHITE}"/>
  <polygon points="37,52 64,52 71,59 71,68 64,73 37,73" fill="${WHITE}"/>
</svg>`;
