import assert from "node:assert/strict";
import test, { before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
let FieldProposalPanel: typeof import("../src/agent-field-action").FieldProposalPanel;
before(async () => {
  ({ FieldProposalPanel } = await import("../src/agent-field-action.js"));
});
const proposal = { revision: 3, startAt: "2026-10-10T01:00:00.000Z", endAt: "2026-10-10T01:30:00.000Z",
  state: "awaiting_customer" as const };
const view = (field: Record<string, unknown>) => ({ decisions: [], field: { readState: "current",
  state: "proposed", revision: 3, proposal, checkedAt: "2026-10-03T00:00:00.000Z", ...field } }) as never;
const buttons = (html: string) => [...html.matchAll(/<button type="button"( disabled="")?>([^<]+)<\/button>/g)]
  .map(match => ({ label: match[2], disabled: Boolean(match[1]) }));

test("현재 첫 제안은 수락·철회 버튼을 열고 사업자가 확정한다고 안내한다", () => {
  const html = renderToStaticMarkup(<FieldProposalPanel view={view({})} busy={false}
    onRefresh={() => {}} onDecide={() => {}} />);
  assert.match(html, /Field 제안 확인 \(추가\)/);
  assert.match(html, /사업자가 확정합니다/);
  assert.deepEqual(buttons(html), [{ label: "제안 새로 고침 (추가)", disabled: false },
    { label: "제안 시간 수락 (추가)", disabled: false }, { label: "요청 철회 (추가)", disabled: false }]);
});

test("변경 제안은 철회를 막고, 권한 미동의·확인 실패·수락 완료는 결정 버튼을 사유와 함께 막는다", () => {
  const changed = renderToStaticMarkup(<FieldProposalPanel view={view({ state: "change_proposed" })}
    busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.deepEqual(buttons(changed).map(item => item.disabled), [false, false, true]);
  assert.match(changed, /변경 제안은 여기서 철회할 수 없습니다/);
  const missing = renderToStaticMarkup(<FieldProposalPanel view={view({ readState: "scope_missing" })}
    busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.deepEqual(buttons(missing).map(item => item.disabled), [false, true, true]);
  assert.match(missing, /제안 응답 권한 동의가 없어/);
  const accepted = renderToStaticMarkup(<FieldProposalPanel view={view({ state: "customer_accepted",
    proposal: { ...proposal, state: "customer_accepted" } })} busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.deepEqual(buttons(accepted).map(item => item.disabled), [false, true, true]);
  assert.match(accepted, /이미 제안을 수락했습니다/);
  const decided: Array<[string, number]> = [];
  const element = FieldProposalPanel({ view: view({}), busy: false, onRefresh: () => {},
    onDecide: (decision, revision) => decided.push([decision, revision]) }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const acceptButton = React.Children.toArray(element.props.children).find(child =>
    React.isValidElement<{ children?: unknown; onClick?: () => void }>(child)
    && child.props.children === "제안 시간 수락 (추가)") as React.ReactElement<{ onClick: () => void }>;
  acceptButton.props.onClick();
  assert.deepEqual(decided, [["accept", 3]]);
});

test("이전 결정이 결과 미상이면 그 결정·revision을 보여 주고 '결과 다시 확인 (추가)'로 같은 결정을 다시 보낸다", () => {
  const accepted = view({ state: "change_proposed", revision: 6,
    proposal: { ...proposal, revision: 6, state: "awaiting_customer" } });
  const html = renderToStaticMarkup(<FieldProposalPanel view={accepted} busy={false}
    pending={{ decision: "accept", proposalRevision: 4 }} onRefresh={() => {}} onDecide={() => {}} />);
  assert.match(html, /이전 응답 결과 확인 중: 제안 시간 수락 \(제안 4번\)/);
  assert.deepEqual(buttons(html)[0], { label: "결과 다시 확인 (추가)", disabled: false });
  const decided: Array<[string, number]> = [];
  const element = FieldProposalPanel({ view: accepted, busy: false, pending: { decision: "accept", proposalRevision: 4 },
    onRefresh: () => {}, onDecide: (decision, revision) => decided.push([decision, revision]) }) as React.ReactElement<{ children: React.ReactNode[] }>;
  const fragment = React.Children.toArray(element.props.children).find(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) as React.ReactElement<{ children: React.ReactNode }>;
  const recheck = React.Children.toArray(fragment.props.children).find(child =>
    React.isValidElement<{ children?: unknown }>(child) && child.props.children === "결과 다시 확인 (추가)") as React.ReactElement<{ onClick: () => void }>;
  recheck.props.onClick();
  assert.deepEqual(decided, [["accept", 4]]);
  // 결과 미상이 없으면 다시 확인 버튼을 보이지 않는다
  const plain = renderToStaticMarkup(<FieldProposalPanel view={view({})} busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.doesNotMatch(plain, /결과 다시 확인/);
});
