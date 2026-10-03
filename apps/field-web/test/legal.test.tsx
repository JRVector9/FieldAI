import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";
import PrivacyPage from "../src/app/privacy/page";
import TermsPage from "../src/app/terms/page";
import { PrivacyNotice } from "../src/legal";
// 공개 폼 컴포넌트가 import하는 CSS를 테스트 런타임에서 무시한다.
require.extensions[".css"] = () => {};

const LEGAL_KEYS = ["BUSINESS_NAME", "REPRESENTATIVE", "REGISTRATION_NUMBER", "MAIL_ORDER_NUMBER", "ADDRESS", "CONTACT_EMAIL", "PRIVACY_OFFICER"]
  .map(key => `NEXT_PUBLIC_LEGAL_${key}`);

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { run(); } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test("Field legal pages show an unset operator placeholder instead of invented values", () => {
  withEnv(Object.fromEntries(LEGAL_KEYS.map(key => [key, undefined])), () => {
    for (const html of [renderToStaticMarkup(<PrivacyPage />), renderToStaticMarkup(<TermsPage />)]) {
      assert.match(html, /운영자 정보 미설정 \(출시 전 입력 필요\)/);
      assert.match(html, /정책 확정 전/);
      assert.doesNotMatch(html, /\d{3}-\d{2}-\d{5}/);
    }
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    for (const heading of ["수집 항목과 이용 목적", "보존기간", "처리 위탁", "국외 이전", "이용자 권리"]) assert.match(privacy, new RegExp(heading));
    assert.match(privacy, /OpenAI \(미국\)/);
    assert.match(privacy, /마지막 시도 후 1일이 지나면 삭제/);
    // 업무 보존 일수를 지어내지 않는다. 코드(retention-purge.ts)가 집행하는 인증 메일 발송 기록 행의 일수만 예외로 허용한다
    const withoutEmailOutboxRow = privacy.replace(/<tr><th scope="row">인증 메일 발송 기록<\/th>.*?<\/tr>/g, "");
    assert.doesNotMatch(withoutEmailOutboxRow, /180일|90일/);
  });
});

test("Field legal pages render operator identity from env", () => {
  withEnv({ NEXT_PUBLIC_LEGAL_BUSINESS_NAME: "테스트상호", NEXT_PUBLIC_LEGAL_REPRESENTATIVE: "홍길동", NEXT_PUBLIC_LEGAL_REGISTRATION_NUMBER: "000-00-00000",
    NEXT_PUBLIC_LEGAL_MAIL_ORDER_NUMBER: "제0000-테스트-0000호", NEXT_PUBLIC_LEGAL_ADDRESS: "테스트 주소", NEXT_PUBLIC_LEGAL_CONTACT_EMAIL: "privacy@example.test",
    NEXT_PUBLIC_LEGAL_PRIVACY_OFFICER: "김담당" }, () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    for (const value of ["테스트상호", "홍길동", "000-00-00000", "제0000-테스트-0000호", "테스트 주소", "privacy@example.test", "김담당"]) assert.match(html, new RegExp(value));
    assert.doesNotMatch(html, /운영자 정보 미설정/);
  });
});

test("Field customer form notice names items, purpose, retention and links the privacy policy", () => {
  for (const kind of ["inquiry", "reservation"] as const) {
    const html = renderToStaticMarkup(<PrivacyNotice kind={kind} />);
    assert.match(html, /개인정보 수집·이용 안내 \(추가\)/);
    assert.match(html, /이름·휴대전화/);
    assert.match(html, /사진\(선택\)/);
    assert.match(html, /구체 일수: 정책 확정 전/);
    assert.match(html, /알림 공급사/);
    assert.match(html, /href="\/privacy"/);
  }
});

test("Field home links legal pages and hides the design preview in live", () => {
  withEnv({ APP_PROFILE: "live" }, () => {
    const html = renderToStaticMarkup(<Home />);
    assert.match(html, /href="\/terms">이용약관 \(추가\)/);
    assert.match(html, /href="\/privacy">개인정보처리방침 \(추가\)/);
    assert.doesNotMatch(html, /\/preview\//);
  });
});

test("Field booking request form shows the notice above the extended required consent", async () => {
  const { PublicBookingPanel } = await import("../src/field-booking.js");
  const catalog = { organizationId: "11111111-1111-4111-8111-111111111111", revision: 1, businessName: "테스트", introduction: "", region: "",
    openingHours: "", contactPhone: "", services: [], faqs: [] };
  const html = renderToStaticMarkup(<PublicBookingPanel catalog={catalog} />);
  const notice = html.indexOf("개인정보 수집·이용 안내 (추가)");
  const consent = html.indexOf("예약 처리에 필요한 연락처 저장에 동의합니다. 위 개인정보 수집·이용 안내를 확인했습니다. (필수)");
  assert.ok(notice > 0 && consent > notice);
  assert.match(html, /요청 내용·희망 시간/);
});

// 개인정보처리방침은 구현된 계정·조직 삭제와 카카오·2단계 인증·인증 메일 기록 수집을 반영한다
test("Field privacy policy describes implemented deletion and the newly collected auth items", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  assert.doesNotMatch(html, /계정 삭제 기능 준비 중/);
  assert.match(html, /14일 유예/);
  assert.match(html, /카카오 계정 식별값/);
  assert.match(html, /백업코드\(암호화 저장\)/);
  assert.match(html, /인증 메일 발송 기록/);
  assert.match(html, /7일 뒤 수신 주소를 익명화/);
});
