/**
 * The queue drawn as a mountain range: one peak per day for the next N days.
 * Peak height = videos scheduled that day; hatched peaks are still awaiting approval; flat ground = a gap.
 */
export function Ridge({ days }: { days: { approved: number; proposed: number }[] }) {
  const w = 100 / days.length;
  const max = Math.max(1, ...days.map((d) => d.approved + d.proposed));
  const peak = (i: number, n: number, jitter: number) => {
    const h = n === 0 ? 0 : 22 + (n / max) * 46;
    const x0 = i * w - w * 0.35, x1 = i * w + w * 1.35, xm = i * w + w * (0.45 + jitter);
    return `M${x0},78 L${xm},${78 - h} L${x1},78 Z`;
  };
  return (
    <svg className="ridge" viewBox="0 0 100 78" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="ridge-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="#f5ecdb" />
          <rect width="1" height="3" fill="#2e4636" />
        </pattern>
      </defs>
      {days.map((d, i) => (d.approved + d.proposed > 0 ? <path key={`p${i}`} d={peak(i, d.approved + d.proposed, ((i * 37) % 10) / 100)} fill="url(#ridge-hatch)" /> : null))}
      {days.map((d, i) => (d.approved > 0 ? <path key={`a${i}`} d={peak(i, d.approved, ((i * 37) % 10) / 100)} fill="#2e4636" /> : null))}
      <rect x="0" y="76" width="100" height="2" fill="#2e4636" />
    </svg>
  );
}
