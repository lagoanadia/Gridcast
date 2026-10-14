import en from "../../messages/en.json";
import es from "../../messages/es.json";

/**
 * All user-facing text lives in messages/<locale>.json.
 * Spanish is the default; English is kept as a secondary dictionary (not all keys are translated back).
 */
const LOCALES = { es, en } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "es";

/** BCP 47 tag used for every Intl date/time format in the UI. */
export const DATE_LOCALE = "es-ES";

type Dict = { [k: string]: string | Dict };

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translator(locale: Locale = DEFAULT_LOCALE) {
  return (key: string, params?: Record<string, string | number>) => {
    const raw = lookup(LOCALES[locale] as Dict, key) ?? lookup(LOCALES[DEFAULT_LOCALE] as Dict, key) ?? key;
    return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
  };
}

export const t = translator();
