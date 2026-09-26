import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const organizationId = "11111111-1111-4111-8111-111111111111";
const request = () => new NextRequest(`http://field-012345abcdef.localhost:3002/public/${organizationId}`, {
  headers: { host: "field-012345abcdef.localhost:3002" },
});

test("tenant public route distinguishes missing and mismatched sites from API failure", async () => {
  const originalFetch = globalThis.fetch;
  const originalProfile = process.env.APP_PROFILE;
  process.env.APP_PROFILE = "mock";
  try {
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal((await proxy(request())).status, 404);

    globalThis.fetch = async () => Response.json({ organizationId: "22222222-2222-4222-8222-222222222222" });
    assert.equal((await proxy(request())).status, 404);

    globalThis.fetch = async () => new Response("upstream private details", { status: 503 });
    const unavailable = await proxy(request());
    assert.equal(unavailable.status, 503);
    assert.match(await unavailable.text(), /새로고침/);
    assert.equal(unavailable.headers.get("cache-control"), "no-store");

    globalThis.fetch = async () => { throw new Error("upstream private details"); };
    const disconnected = await proxy(request());
    assert.equal(disconnected.status, 503);
    assert.doesNotMatch(await disconnected.text(), /upstream private details/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProfile === undefined) delete process.env.APP_PROFILE;
    else process.env.APP_PROFILE = originalProfile;
  }
});
