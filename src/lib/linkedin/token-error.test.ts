import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeCodeForTokens } from "./client";
import { LinkedInTokenError, connectionErrorMessage } from "./token-error";

afterEach(() => { vi.unstubAllGlobals(); });

describe("a refused token exchange", () => {
  it("carries LinkedIn's error code, so invalid_client reads as rejected app credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed" }), { status: 401 })));
    const err = await exchangeCodeForTokens("code", "id", "secret", "https://x/cb").catch((e) => e);
    expect(err).toBeInstanceOf(LinkedInTokenError);
    expect(err.code).toBe("invalid_client");
    expect(connectionErrorMessage(err)).toMatch(/rejected the app credentials/);
    expect(connectionErrorMessage(err)).not.toContain("Client authentication failed");
  });

  it("keeps the general message for any other failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    const err = await exchangeCodeForTokens("code", "id", "secret", "https://x/cb").catch((e) => e);
    expect(err.code).toBe("invalid_grant");
    expect(connectionErrorMessage(err)).toBe("LinkedIn did not complete the connection. Try again.");
    expect(connectionErrorMessage(new Error("boom"))).toBe("LinkedIn did not complete the connection. Try again.");
  });

  it("copes with a reply that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502 })));
    const err = await exchangeCodeForTokens("code", "id", "secret", "https://x/cb").catch((e) => e);
    expect(err.code).toBeNull();
  });
});
