/**
 * Business Web Dev — inline SVG logo
 * Traced from the official brand style guide (July 2026).
 *
 * Variants:
 *   'default' — full horizontal logo on light background (navy + blue text)
 *   'white'   — full horizontal logo on dark/colour background (all-white)
 *   'icon'    — hex B mark only (favicons, PWA icons, etc.)
 */

interface BrandLogoProps {
  variant?: 'default' | 'white' | 'icon';
  height?: number;
  className?: string;
}

// ── Brand palette ─────────────────────────────────────────────────────────────
const NAVY      = '#0A1C3E';   // outer hex fill; "BUSINESS" text
const BLUE      = '#1565D6';   // accent / "WEB DEV" text
const BLUE_MID  = '#0E4DB5';   // inner-hex gradient mid-tone
const BLUE_DARK = '#0A3080';   // inner-hex gradient shadow (bottom-left)
const WHITE     = '#FFFFFF';

// ── Hex icon (100 × 100 viewBox) ─────────────────────────────────────────────
//
// Pointy-top regular hexagon (vertices at top & bottom).
// The inner fill uses a linear gradient — light upper-right → dark lower-left —
// which recreates the depth/shadow seen in the brand reference.
//
// The "B" letterform is two right-pointing arrow pentagons stacked on a left bar.
//
function HexIcon({ white = false, idSuffix = '' }: { white?: boolean; idSuffix?: string }) {
  const gradId    = `hexGrad${idSuffix}`;
  const outerFill = white ? WHITE : NAVY;
  const bFill     = white ? NAVY  : WHITE;

  return (
    <g>
      <defs>
        {/* Inner-hex gradient: bright blue upper-right → dark navy lower-left */}
        <linearGradient id={gradId} x1="85%" y1="10%" x2="15%" y2="90%">
          <stop offset="0%"   stopColor={white ? '#D0E4FF' : '#1E82F0'} />
          <stop offset="55%"  stopColor={white ? '#A8C8F8' : BLUE_MID}  />
          <stop offset="100%" stopColor={white ? '#7AAAEE' : BLUE_DARK} />
        </linearGradient>
      </defs>

      {/* Outer hexagon — dark navy border/background */}
      <polygon
        points="50,3 90,26 90,74 50,97 10,74 10,26"
        fill={outerFill}
      />

      {/* Inner hexagon — gradient fill */}
      <polygon
        points="50,13 82,31 82,69 50,87 18,69 18,31"
        fill={`url(#${gradId})`}
      />

      {/* ── White geometric B ── */}

      {/* Left vertical bar */}
      <rect x="26" y="22" width="11" height="56" fill={bFill} />

      {/* Upper arrow bump (pentagon: flat left + flat top + right point + flat bottom) */}
      {/* Spans y 22 → 49; apex at x ≈ 73 */}
      <polygon
        points="37,22  64,22  74,35.5  64,49  37,49"
        fill={bFill}
      />

      {/* Gap between bumps: y 49 → 51 (2 px) */}

      {/* Lower arrow bump — slightly taller to match brand proportions */}
      {/* Spans y 51 → 78; apex at x ≈ 76 */}
      <polygon
        points="37,51  65,51  76,64.5  65,78  37,78"
        fill={bFill}
      />
    </g>
  );
}

// ── Full horizontal logo (viewBox 300 × 60) ──────────────────────────────────
export function BrandLogo({
  variant   = 'default',
  height    = 40,
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
        role="img"
      >
        <HexIcon idSuffix="icon" />
      </svg>
    );
  }

  const isWhite   = variant === 'white';
  const textTop   = isWhite ? WHITE : NAVY;
  const textBot   = isWhite ? WHITE : BLUE;
  const tagClr    = isWhite ? `${WHITE}CC` : `${NAVY}88`;
  const ruleClr   = isWhite ? `${WHITE}AA` : BLUE;

  // viewBox 300 × 60:  hex icon occupies [0-60], text occupies [70-300]
  return (
    <svg
      viewBox="0 0 300 60"
      height={height}
      width={Math.round((height / 60) * 300)}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Business Web Dev"
      className={className}
      role="img"
    >
      {/* Hex icon — 100×100 scaled to 60×60 */}
      <g transform="scale(0.6)">
        <HexIcon white={isWhite} idSuffix={isWhite ? 'wh' : 'df'} />
      </g>

      {/* "BUSINESS" */}
      <text
        x="70"
        y="23"
        fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900"
        fontSize="19"
        letterSpacing="2"
        fill={textTop}
      >
        BUSINESS
      </text>

      {/* "WEB DEV" */}
      <text
        x="70"
        y="43"
        fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
        fontWeight="900"
        fontSize="19"
        letterSpacing="2"
        fill={textBot}
      >
        WEB DEV
      </text>

      {/* Tagline: — WE BUILD WEBSITES THAT GROW BUSINESSES — */}
      <line x1="70" y1="51" x2="84" y2="51" stroke={ruleClr} strokeWidth="1.2" />
      <text
        x="87"
        y="54.5"
        fontFamily="Arial,Helvetica,sans-serif"
        fontWeight="400"
        fontSize="5.2"
        letterSpacing="1.6"
        fill={tagClr}
      >
        WE BUILD WEBSITES THAT GROW BUSINESSES
      </text>
      <line x1="272" y1="51" x2="286" y2="51" stroke={ruleClr} strokeWidth="1.2" />
    </svg>
  );
}
