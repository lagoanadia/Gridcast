import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/crypto";
import { appOrigin, CALLBACK_PATH, exchangeCode, fetchChannelHandle } from "@/lib/oauth/google";
import { currentUserId } from "@/lib/current-user";
import { mutate } from "@/lib/store";
import { safeEqual } from "@/lib/safeEqual";

const STATE_COOKIE = "gc_oauth_google";

/** Step 2: Google sends the owner back here with a one-time code, which we swap for tokens and store encrypted. */
export async function GET(req: Request) {
  const origin = appOrigin(req);
  const back = (kind: "msg" | "err", text: string) => {
    const res = NextResponse.redirect(`${origin}/channels?${kind}=${encodeURIComponent(text)}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/oauth/google", maxAge: 0 });
    return res;
  };

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back("err", "Has cancelado la conexión con Google.");

  const [state, channelId] = (req.headers.get("cookie") ?? "").match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1]?.split(".") ?? [];
  const given = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!state || !channelId || !code || !safeEqual(state, given)) return back("err", "La conexión con Google ha caducado o no es válida. Inténtalo de nuevo.");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back("err", "Google no está configurado en este servidor.");

  const tokens = await exchangeCode({ code, clientId, clientSecret, redirectUri: `${origin}${CALLBACK_PATH}` });
  if (!tokens) return back("err", "Google no ha aceptado la conexión. Inténtalo de nuevo.");
  const handle = (await fetchChannelHandle(tokens.accessToken)) ?? "YouTube";

  let encrypted: string;
  try { encrypted = encryptToken(JSON.stringify(tokens)); } catch { return back("err", "Falta TOKEN_ENCRYPTION_KEY en este servidor, así que no puedo guardar la conexión de forma segura."); }

  const uid = await currentUserId();
  const saved = await mutate((db) => {
    const channel = db.channels.find((c) => c.id === channelId && c.userId === uid);
    if (!channel) return false;
    const acc = channel.accounts.find((a) => a.platform === "youtube");
    if (acc) Object.assign(acc, { handle, tokenEncrypted: encrypted, connected: true });
    else channel.accounts.push({ platform: "youtube", handle, tokenEncrypted: encrypted, connected: true });
    return true;
  });
  return saved ? back("msg", `YouTube conectado: ${handle}.`) : back("err", "No se ha encontrado la cuenta.");
}
