import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewWorkspace, type Role } from "@fieldai/ui";
import { screens } from "../src/screens";

for (const role of ["owner", "customer", "media", "admin"] as Role[]) {
  test(`mobile navigation reaches every AP ${role} screen`, () => {
    const current = screens[role][0];
    assert.ok(current);
    const html = renderToStaticMarkup(
      <PreviewWorkspace product="Agent Platform" role={role} roleLabel={role} screens={screens[role]} current={current} />,
    );
    const mobileNavigation = html.match(/<nav class="mobile-nav"[^>]*>(.*?)<\/nav>/s)?.[1];
    assert.ok(mobileNavigation, "mobile navigation must exist");
    for (const screen of screens[role]) {
      assert.ok(mobileNavigation.includes(`href="/preview/${role}/${screen.slug}"`), `${screen.id} is unreachable on mobile`);
    }
  });
}
