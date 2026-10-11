import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto";

describe("token encryption", () => {
  it("round-trips and does not leak the token", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const enc = encryptToken("ya29.secret-token");
    expect(enc).not.toContain("secret");
    expect(decryptToken(enc)).toBe("ya29.secret-token");
  });
});
