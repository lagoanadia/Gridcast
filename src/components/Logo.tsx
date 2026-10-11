/** GridCast mark: a 3×3 grid of cut-paper tiles with one tile "broadcasting". */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="11" fill="#f5ecdc" />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => {
          if (r === 1 && c === 1) return null;
          const fill = r === 0 && c === 2 ? "#c4502a" : r === 2 && c === 0 ? "#5e6b3a" : "#17120e";
          return <rect key={`${r}${c}`} x={6 + c * 13} y={6 + r * 13} width="10" height="10" rx="2.5" fill={fill} />;
        }),
      )}
      <circle cx="24" cy="24" r="4.2" fill="#e3a231" stroke="#17120e" strokeWidth="1.6" />
    </svg>
  );
}
