import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

describe("proxy", () => {
  it("adds a fresh nonce to the policy of each response", () => {
    const first = proxy(new NextRequest("http://localhost/prediccion"));
    const second = proxy(new NextRequest("http://localhost/"));
    const policy = first.headers.get("Content-Security-Policy");
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).not.toBe(second.headers.get("Content-Security-Policy"));
  });
});
