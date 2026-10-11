export function Flash({ sp }: { sp: { msg?: string; err?: string } }) {
  if (sp.err) return <div className="flash error" role="alert">{sp.err}</div>;
  if (sp.msg) return <div className="flash" role="status">{sp.msg}</div>;
  return null;
}
