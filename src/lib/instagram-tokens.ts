import { decryptToken, encryptToken } from "./crypto";
import { refreshToken } from "./publisher/instagram";
import type { Database } from "./types";

const REFRESH_AFTER_DAYS = 30; // tokens last 60 days

/** Renews Instagram tokens that are more than 30 days old, so a connected account never silently expires. */
export async function refreshDueTokens(
  db: Database, now: Date,
  deps: { refresh?: typeof refreshToken; decrypt?: typeof decryptToken; encrypt?: typeof encryptToken } = {},
) {
  const { refresh = refreshToken, decrypt = decryptToken, encrypt = encryptToken } = deps;
  let renewed = 0;
  for (const channel of db.channels) {
    for (const acc of channel.accounts) {
      if (acc.platform !== "instagram" || !acc.tokenEncrypted || !acc.tokenIssuedAt) continue;
      if (now.getTime() - new Date(acc.tokenIssuedAt).getTime() < REFRESH_AFTER_DAYS * 86_400_000) continue;
      try {
        const fresh = await refresh(decrypt(acc.tokenEncrypted));
        if (fresh) { acc.tokenEncrypted = encrypt(fresh); acc.tokenIssuedAt = now.toISOString(); renewed++; }
      } catch { /* try again on the next tick */ }
    }
  }
  return renewed;
}
