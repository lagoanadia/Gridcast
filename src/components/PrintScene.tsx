/**
 * A tiny flat landscape (sun, ridges, pines) generated from a seed.
 * Used where a video has no playable file, so every placeholder is different but on-palette.
 */
function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
}

const PALETTES = [
  { sky: "#dcd4ff", sun: "#ffd166", far: "#9b86ff", near: "#4b2fc7", tree: "#2a1a80" },
  { sky: "#d9f0ea", sun: "#ff8a65", far: "#5cc4ad", near: "#1d7f6e", tree: "#0f4a41" },
  { sky: "#ffe3d6", sun: "#ffffff", far: "#ff9a76", near: "#c2461f", tree: "#6b230d" },
];

export function PrintScene({ seed }: { seed: string }) {
  const r = rand(seed);
  const p = PALETTES[Math.floor(r() * PALETTES.length)];
  const sunX = 25 + r() * 50;
  const ridge = (base: number, amp: number) => {
    const pts = Array.from({ length: 7 }, (_, i) => `${i * 20},${base - r() * amp}`);
    return `M0,120 L${pts.join(" L")} L120,120 Z`;
  };
  const trees = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ x: 8 + r() * 104, h: 18 + r() * 16 }));
  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="120" height="120" fill={p.sky} />
      <circle cx={sunX} cy={38} r={17} fill={p.sun} />
      <path d={ridge(70, 26)} fill={p.far} />
      <path d={ridge(92, 14)} fill={p.near} />
      {trees.map((t, i) => (
        <path key={i} d={`M${t.x},${120 - t.h - 6} L${t.x + 6},${114} L${t.x - 6},${114} Z M${t.x - 1},114 h2 v6 h-2 Z`} fill={p.tree} />
      ))}
    </svg>
  );
}
