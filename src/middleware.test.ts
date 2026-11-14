import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@supabase/ssr";
import { middleware } from "./middleware";

const createClient = vi.mocked(createServerClient);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("public landing design preview", () => {
  it("serves sample content without initialising an auth connection", async () => {
    createClient.mockImplementation(() => { throw new Error("Auth is not configured"); });

    const response = await middleware(new NextRequest("https://example.com/landing-preview"));

    expect(response.status).toBe(200);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["/home", "/review", "/landing-preview/private", "/landing-preview-other"])(
    "keeps %s on the existing auth path",
    async (path) => {
      createClient.mockImplementation(() => { throw new Error("Auth is not configured"); });

      await expect(middleware(new NextRequest(`https://example.com${path}`)))
        .rejects.toThrow("Auth is not configured");
      expect(createClient).toHaveBeenCalledOnce();
    },
  );
});
