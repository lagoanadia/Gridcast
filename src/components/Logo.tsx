/** GridCast mark: a hand-cut linocut block — nine carved tiles, the centre one a rising sun. */
export const LOGO_TILES = [
  "M6.2 6.6 L16.4 5.8 L15.9 16.3 L6.6 15.8 Z",
  "M19.4 6.1 L29.1 6.5 L28.7 15.9 L19.1 16.4 Z",
  "M32.3 5.9 L42.2 6.4 L41.8 16.1 L32.6 15.7 Z",
  "M5.9 19.3 L15.8 19.0 L16.2 28.8 L6.3 29.2 Z",
  "M32.1 19.2 L42.1 18.8 L42.4 28.9 L32.4 29.0 Z",
  "M6.4 32.2 L16.1 32.6 L15.7 42.3 L6.0 41.9 Z",
  "M19.0 32.4 L28.9 32.0 L29.3 41.8 L19.3 42.4 Z",
  "M32.5 32.1 L42.0 32.5 L42.3 42.1 L32.2 41.7 Z",
];
export const LOGO_BLOCK = "M2.2 3.1 L45.6 1.6 L46.4 45.2 L1.4 46.3 Z";

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d={LOGO_BLOCK} fill="#b4441f" />
      {LOGO_TILES.map((d) => <path key={d} d={d} fill="#f5ecdb" />)}
      <circle cx="24.1" cy="24.3" r="5.3" fill="#f0a033" />
    </svg>
  );
}

/** Shared SVG filter: slightly roughened edges, like ink squeezed onto paper. Rendered once in the root layout. */
export function InkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="ink-bleed">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="2.2" />
      </filter>
    </svg>
  );
}
