/** GridCast mark: a rounded 3×3 grid of tiles, the centre one lit. Same geometry as public/brand/gridcast-logo.svg. */
const TILE = 176, GAP = 36, OFFSET = 212;

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="gc-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A6CFF" />
          <stop offset="1" stopColor="#5632E8" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill="url(#gc-logo-grad)" />
      {Array.from({ length: 9 }, (_, i) => {
        const r = Math.floor(i / 3), c = i % 3;
        return <rect key={i} x={OFFSET + c * (TILE + GAP)} y={OFFSET + r * (TILE + GAP)} width={TILE} height={TILE} rx="44" fill={i === 4 ? "#FFD166" : "#FFFFFF"} opacity={i === 4 ? 1 : 0.96} />;
      })}
    </svg>
  );
}
