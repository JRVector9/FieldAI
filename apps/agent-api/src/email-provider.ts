import { createTransport } from 'nodemailer';
import type { Pool } from 'pg';

// AP 인증 메일 포트. Field 메일 설정·DB·비밀값과 공유하지 않는다.
export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type EmailSendResult = {
  outcome: 'sent' | 'blocked_integration' | 'failed' | 'suppressed_duplicate';
  providerMessageId?: string;
  errorCode?: string;
};
export type EmailProvider = {
  // mock: 로컬 outbox·콘솔만, smtp: 실제 SMTP, blocked_integration: 비mock인데 SMTP 미설정
  readonly kind: 'mock' | 'smtp' | 'blocked_integration';
  send(message: EmailMessage): Promise<EmailSendResult>;
};
export type EmailDeliveryState = 'mock' | 'configured' | 'blocked_integration';
export type EmailPurpose = 'verify_email' | 'reset_password';
// nodemailer Transporter 중 실제로 쓰는 부분만 받는다(단위 테스트에서 가짜 transport 주입)
export type SmtpTransport = { sendMail(message: { from: string } & EmailMessage): Promise<{ messageId?: string }> };

export function createMockEmailProvider(log: (line: string) => void = line => process.stdout.write(line)): EmailProvider {
  return {
    kind: 'mock',
    async send(message) {
      // mock 프로필 전용: 실제 발송 없이 개발자가 링크를 확인할 수 있게 콘솔에 남긴다
      log(`[AP mock email] to=${message.to} subject=${message.subject}\n${message.text}\n`);
      return { outcome: 'sent', providerMessageId: 'mock-outbox' };
    },
  };
}

export function createBlockedEmailProvider(): EmailProvider {
  return { kind: 'blocked_integration', async send() { return { outcome: 'blocked_integration', errorCode: 'smtp_not_configured' }; } };
}

export function createSmtpEmailProvider(config: { from: string; transport: SmtpTransport }): EmailProvider {
  return {
    kind: 'smtp',
    async send(message) {
      try {
        const info = await config.transport.sendMail({ from: config.from, ...message });
        // SMTP 서버가 메시지를 받았다는 응답만 sent로 기록한다(수신함 도달 확인이 아님)
        return typeof info.messageId === 'string' && info.messageId
          ? { outcome: 'sent', providerMessageId: info.messageId }
          : { outcome: 'failed', errorCode: 'smtp_result_unknown' };
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        return { outcome: 'failed', errorCode: typeof code === 'string' && /^[A-Z_]{1,40}$/.test(code) ? `smtp_${code.toLowerCase()}` : 'smtp_send_failed' };
      }
    },
  };
}

const mailFrom = /^(?:[^<>\r\n]{1,100} <)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;
export function emailProviderFromEnvironment(env: Record<string, string | undefined> = process.env): EmailProvider {
  const url = env.AP_SMTP_URL, from = env.AP_MAIL_FROM, profile = env.AP_PROFILE;
  if (profile === 'mock') {
    if (url || from) throw new Error('real_email_provider_forbidden_in_mock');
    return createMockEmailProvider();
  }
  if (!url && !from) return createBlockedEmailProvider();
  if (!url || !from) throw new Error('incomplete_AP_email_configuration');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('invalid_AP_smtp_url'); }
  // 운영(live)은 암호화 연결(smtps)만 허용해 SMTP 자격증명이 평문으로 나가지 않게 한다
  if (!['smtp:', 'smtps:'].includes(parsed.protocol) || profile === 'live' && parsed.protocol !== 'smtps:')
    throw new Error('invalid_AP_smtp_url');
  if (!mailFrom.test(from)) throw new Error('invalid_AP_mail_from');
  return createSmtpEmailProvider({ from, transport: createTransport(url) });
}

export function emailDeliveryState(provider: EmailProvider): EmailDeliveryState {
  return provider.kind === 'smtp' ? 'configured' : provider.kind;
}

export function authEmailMessage(purpose: EmailPurpose, to: string, link: string): EmailMessage {
  const escaped = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  if (purpose === 'verify_email') return {
    to, subject: '[Agent Platform] 이메일 주소를 확인해 주세요',
    text: `Agent Platform 가입을 완료하려면 아래 링크를 열어 이메일 주소를 확인해 주세요.\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
    html: `<p>Agent Platform 가입을 완료하려면 아래 링크를 열어 이메일 주소를 확인해 주세요.</p><p><a href="${escaped}">이메일 주소 확인</a></p><p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`,
  };
  return {
    to, subject: '[Agent Platform] 비밀번호 재설정 안내',
    text: `아래 링크에서 새 비밀번호를 설정해 주세요. 링크는 1시간 동안만 사용할 수 있습니다.\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
    html: `<p>아래 링크에서 새 비밀번호를 설정해 주세요. 링크는 1시간 동안만 사용할 수 있습니다.</p><p><a href="${escaped}">비밀번호 재설정</a></p><p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`,
  };
}

// 모든 인증 메일은 공급사와 무관하게 ap.email_outbox에 감사 행을 남긴다.
// mock이 아니면 저장본에서 일회용 토큰을 가려 DB 열람만으로 계정을 넘겨받지 못하게 한다.
// 같은 주소·목적으로 10분 안에 보냈거나 보내는 중인 메일이 있으면 공급사를 부르지 않고 suppressed_duplicate로만 남긴다
// (추가, 보안 #5: 분산 IP로 한 주소에 메일을 반복 발송하는 것을 막는다. 화면 응답은 better-auth 동작 그대로 같다).
export const EMAIL_DEDUPE_MINUTES = 10;
export async function deliverAuthEmail(pool: Pool, provider: EmailProvider, input: {
  purpose: EmailPurpose; message: EmailMessage; secret: string;
}): Promise<EmailSendResult> {
  const redact = (value: string) => provider.kind === 'mock' ? value : value.replaceAll(input.secret, '[redacted]');
  const row = (await pool.query<{ id: string; state?: string }>(
    `insert into ap.email_outbox("to",subject,text,html,purpose,state)
     select $1,$2,$3,$4,$5,case when exists(select 1 from ap.email_outbox o where lower(o."to")=lower($1) and o.purpose=$5
       and o.state in ('pending','sent') and o.created_at>now()-make_interval(mins => $6::int))
       then 'suppressed_duplicate' else 'pending' end
     returning id,state`,
    [input.message.to, input.message.subject, redact(input.message.text),
      input.message.html === undefined ? null : redact(input.message.html), input.purpose, EMAIL_DEDUPE_MINUTES])).rows[0]!;
  if (row.state === 'suppressed_duplicate') return { outcome: 'suppressed_duplicate' };
  let result: EmailSendResult;
  try { result = await provider.send(input.message); }
  catch { result = { outcome: 'failed', errorCode: 'email_provider_error' }; }
  await pool.query(
    `update ap.email_outbox set state=$2,provider_message_id=$3,error_code=$4,
      sent_at=case when $2='sent' then now() else null end where id=$1`,
    [row.id, result.outcome, result.providerMessageId ?? null, result.errorCode ?? null]);
  return result;
}
