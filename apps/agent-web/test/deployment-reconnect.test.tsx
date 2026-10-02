import assert from "node:assert/strict";
import test, { before } from "node:test";
import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
require.extensions[".css"] = () => {};
let DeploymentReconnect: typeof import("../src/agent-deploy").DeploymentReconnect;
before(async () => {
  ({ DeploymentReconnect } = await import("../src/agent-deploy.js"));
});

test("disconnected active deployment offers a labeled reconnect that targets the same deployment", () => {
  const html = renderToStaticMarkup(<DeploymentReconnect id="dep-1" busy={false} onReconnect={() => {}} />);
  assert.match(html, /최신 승인으로 다시 연결 \(추가\)/);
  assert.doesNotMatch(html, /disabled/);
  assert.match(renderToStaticMarkup(<DeploymentReconnect id="dep-1" busy onReconnect={() => {}} />), /disabled/);
  const reconnected: string[] = [];
  const button = DeploymentReconnect({ id: "dep-1", busy: false, onReconnect: id => reconnected.push(id) }) as ReactElement<{ onClick: () => void }>;
  button.props.onClick();
  assert.deepEqual(reconnected, ["dep-1"]);
});
