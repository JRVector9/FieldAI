import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

// env를 바꾼 뒤 원래 값으로 되돌린다.
async function withEnv(values: Record<string, string>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

const platform = (host: string, path: string) => new NextRequest(`http://${host}${path}`, { headers: { host } });

test("live platform host returns 404 for design preview routes but keeps other routes", async () => {
  await withEnv({ APP_PROFILE: "live", FIELD_SITE_BASE_DOMAIN: "sites.example.test", FIELD_PUBLIC_WEB_ORIGIN: "https://field.example.test" }, async () => {
    assert.equal((await proxy(platform("field.example.test", "/preview/owner/start"))).status, 404);
    assert.equal((await proxy(platform("field.example.test", "/preview"))).status, 404);
    for (const path of ["/workspace", "/terms", "/privacy", "/previewer"]) {
      const response = await proxy(platform("field.example.test", path));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
    }
  });
});

test("live tenant host still routes through FIELD_SITE_BASE_DOMAIN", async () => {
  await withEnv({ APP_PROFILE: "live", FIELD_SITE_BASE_DOMAIN: "sites.example.test", FIELD_PUBLIC_WEB_ORIGIN: "https://field.example.test" }, async () => {
    const home = await proxy(platform("field-012345abcdef.sites.example.test", "/"));
    assert.match(home.headers.get("x-middleware-rewrite") ?? "", /\/site\/field-012345abcdef$/);
    assert.equal((await proxy(platform("not-a-site.sites.example.test", "/"))).status, 404);
  });
});

test("mock and sandbox keep the design preview reachable", async () => {
  for (const profile of ["mock", "sandbox"]) await withEnv({ APP_PROFILE: profile, FIELD_PUBLIC_WEB_ORIGIN: "http://localhost:3002" }, async () => {
    const response = await proxy(platform("localhost:3002", "/preview/owner/start"));
    assert.equal(response.headers.get("x-middleware-next"), "1", profile);
  });
});
