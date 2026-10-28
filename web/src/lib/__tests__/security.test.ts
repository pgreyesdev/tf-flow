import { createHash } from "node:crypto";

import { contentSecurityPolicy, createNonce, HIDDEN_SEGMENT_STYLE } from "@/lib/csp";
import { clientAddress, RateLimiter } from "@/lib/rate-limit";

describe("content security policy", () => {
  it("only runs scripts carrying the nonce in production", () => {
    const policy = contentSecurityPolicy("abc", false);
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("only allows the inline style React uses to hide streamed segments", () => {
    const hash = createHash("sha256").update("display:none").digest("base64");
    expect(HIDDEN_SEGMENT_STYLE).toBe(`sha256-${hash}`);
    expect(contentSecurityPolicy("abc", false)).toContain(
      `style-src-attr 'unsafe-hashes' 'sha256-${hash}'`,
    );
  });

  it("lets the map run its workers from the site or a blob", () => {
    expect(contentSecurityPolicy("abc", false)).toContain("worker-src 'self' blob:");
  });

  it("allows eval only in development", () => {
    const policy = contentSecurityPolicy("abc", true);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("creates a different nonce each time", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("rate limiter", () => {
  it("lets a burst through and then asks to wait", () => {
    let now = 0;
    const limiter = new RateLimiter(2, () => now);
    expect(limiter.acquire("a")).toBe(0);
    expect(limiter.acquire("a")).toBe(0);
    expect(limiter.acquire("a")).toBe(30);
    expect(limiter.acquire("b")).toBe(0);
    now = 30_000;
    expect(limiter.acquire("a")).toBe(0);
  });

  it("forgets the least recently seen client when full", () => {
    const limiter = new RateLimiter(1, () => 0, 2);
    limiter.acquire("a");
    limiter.acquire("b");
    limiter.acquire("c");
    // «a» se olvidó, así que vuelve a tener el cubo lleno.
    expect(limiter.acquire("a")).toBe(0);
    expect(limiter.acquire("c")).toBeGreaterThan(0);
  });

  it("reads the visitor address set by the proxy", () => {
    expect(clientAddress(new Headers({ "x-real-ip": " 1.2.3.4 " }))).toBe("1.2.3.4");
    expect(clientAddress(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientAddress(new Headers())).toBe("desconocido");
  });
});
