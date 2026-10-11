import en from "../../messages/en.json";

/**
 * All user-facing text lives in messages/<locale>.json.
 * Adding Spanish = add messages/es.json and register it here.
 */
const LOCALES = { en } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

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
