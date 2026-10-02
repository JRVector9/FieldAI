import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { config, proxy } from "../src/proxy";

async function withProfile(profile: string, run: () => void) {
  const previous = process.env.APP_PROFILE;
  process.env.APP_PROFILE = profile;
  try { run(); } finally { if (previous === undefined) delete process.env.APP_PROFILE; else process.env.APP_PROFILE = previous; }
}

const request = (path: string) => new NextRequest(`http://ap.example.test${path}`);

test("AP live returns 404 for design preview routes", async () => {
  await withProfile("live", () => {
    assert.equal(proxy(request("/preview/owner/start")).status, 404);
    assert.equal(proxy(request("/preview")).status, 404);
    assert.equal(proxy(request("/previewer")).headers.get("x-middleware-next"), "1");
  });
  assert.deepEqual(config.matcher, ["/preview", "/preview/:path*"]);
});

test("AP mock and sandbox keep the design preview reachable", async () => {
  for (const profile of ["mock", "sandbox"]) await withProfile(profile, () => {
    assert.equal(proxy(request("/preview/owner/start")).headers.get("x-middleware-next"), "1", profile);
  });
});
