import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET as verification } from "../src/app/.well-known/ap-site-verification/route";

const proof = "a".repeat(40);

// Host 대소문자(추가): 대문자가 섞인 Host도 같은 tenant·custom host로 소문자 origin을 확인한다.
test("AP site verification lowercases the Host before tenant and custom host matching", async () => {
  const fetcher = globalThis.fetch, profile = process.env.APP_PROFILE;
  const urls: string[] = [];
  try {
    process.env.APP_PROFILE = "mock";
    globalThis.fetch = async (input: string | URL | Request) => {
      urls.push(String(input));
      return Response.json({ origin: "http://field-012345abcdef.localhost:3002", proof });
    };
    const tenantHost = "FIELD-012345ABCDEF.LocalHost:3002";
    const tenant = await verification(new NextRequest(`http://${tenantHost}/.well-known/ap-site-verification`, { headers: { host: tenantHost } }));
    assert.equal(tenant.status, 200);
    assert.equal(await tenant.text(), `ap-site-verification=${proof}`);
    assert.ok(urls.some(url => url.endsWith("/v1/public/site-verification/field-012345abcdef")));

    process.env.APP_PROFILE = "live";
    urls.length = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return url.includes("/site-hosts/")
        ? Response.json({ slug: "field-012345abcdef", organizationId: "11111111-1111-4111-8111-111111111111", origin: "https://shop.example.com" })
        : Response.json({ origin: "https://shop.example.com", proof });
    };
    const customHost = "Shop.Example.COM";
    const custom = await verification(new NextRequest(`https://${customHost}/.well-known/ap-site-verification`, { headers: { host: customHost } }));
    assert.equal(custom.status, 200);
    assert.ok(urls.some(url => url.includes("host=shop.example.com")));
  } finally {
    globalThis.fetch = fetcher;
    if (profile === undefined) delete process.env.APP_PROFILE; else process.env.APP_PROFILE = profile;
  }
});
