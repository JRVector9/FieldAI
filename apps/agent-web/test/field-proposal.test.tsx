import assert from "node:assert/strict";
import test, { before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
let FieldProposalPanel: typeof import("../src/agent-field-action").FieldProposalPanel;
let decisionErrorLabel: typeof import("../src/agent-field-action").decisionErrorLabel;
before(async () => {
  ({ FieldProposalPanel, decisionErrorLabel } = await import("../src/agent-field-action.js"));
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

// 사업자 연결에 제안 응답 권한이 없으면(canRespond=false) 수락·철회를 사유와 함께 막는다. 이전 응답(필드 없음)은 막지 않는다
test("canRespond=false는 결정 버튼을 막고 권한 사유를 보이며, 필드가 없으면 기존 동작을 유지한다", () => {
  const blocked = renderToStaticMarkup(<FieldProposalPanel view={{ ...(view({}) as object), canRespond: false } as never}
    busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.deepEqual(buttons(blocked).map(item => item.disabled), [false, true, true]);
  assert.match(blocked, /사업자 연결에 제안 응답 권한이 없습니다/);
  const allowed = renderToStaticMarkup(<FieldProposalPanel view={{ ...(view({}) as object), canRespond: true } as never}
    busy={false} onRefresh={() => {}} onDecide={() => {}} />);
  assert.deepEqual(buttons(allowed).map(item => item.disabled), [false, false, false]);
});

test("고객 결정 오류 코드는 한국어로 안내하고 모르는 코드는 노출하지 않는다", () => {
  for (const code of ["customer_proof_reused", "customer_proof_mismatch", "idempotency_conflict", "field_decision_rejected",
    "field_reservation_not_accepted", "invalid_receipt_key"]) {
    const label = decisionErrorLabel(code);
    assert.doesNotMatch(label, new RegExp(code));
    assert.doesNotMatch(label, /[a-z]+_[a-z]+/);
  }
  assert.match(decisionErrorLabel("invalid_receipt_key"), /접수 확인키/);
  assert.equal(decisionErrorLabel("something_new"), "Field가 이 응답을 받지 않았습니다. 제안을 새로 고친 뒤 다시 시도해 주세요.");
});
