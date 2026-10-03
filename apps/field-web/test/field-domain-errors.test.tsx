import assert from "node:assert/strict";
import test from "node:test";
import { domainErrorLabel } from "../src/field-domain-errors";

test("domain status error codes show a Korean cause, including the TLS failure guidance", () => {
  assert.match(domainErrorLabel("domain_tls_failed"), /443 포트/);
  assert.match(domainErrorLabel("domain_tls_unconfirmed"), /15분/);
  assert.match(domainErrorLabel("routing_dns_mismatch"), /CNAME/);
  // 모르는 코드는 내부 코드를 그대로 노출하지 않는다.
  assert.doesNotMatch(domainErrorLabel("private_internal_code"), /private_internal_code/);
});
