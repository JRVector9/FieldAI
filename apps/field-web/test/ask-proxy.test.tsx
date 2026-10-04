import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("public hosts reject the internal certificate ask route, including normalized Next data URLs", async () => {
  const values = { APP_PROFILE: "live", FIELD_SITE_BASE_DOMAIN: "sites.example.test", FIELD_PUBLIC_WEB_ORIGIN: "https://field.example.test" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  let upstreamCalls = 0;
  Object.assign(process.env, values);
  globalThis.fetch = async () => { upstreamCalls++; throw new Error("ask must not reach an upstream"); };
  try {
    for (const host of ["field.example.test", "field-012345abcdef.sites.example.test", "customer.example.test"]) {
      for (const path of ["/v1/public/site-hosts/allow", "/_next/data/build-123/v1/public/site-hosts/allow.json"]) {
        const request = new NextRequest(`https://${host}${path}?domain=customer.example.test`, { headers: { host } });
        assert.equal(request.nextUrl.pathname, "/v1/public/site-hosts/allow", "Next normalizes the data URL before proxy dispatch");
        assert.equal((await proxy(request)).status, 404, `${host}${path}`);
      }
    }
    assert.equal(upstreamCalls, 0);
    assert.equal((await proxy(new NextRequest("https://field.example.test/v1/public/catalog/example", { headers: { host: "field.example.test" } }))).headers.get("x-middleware-next"), "1");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
