// 서버(sharp)가 해독할 수 있는 형식만 고르게 한다. 아이폰은 accept에 HEIC가 없으면 사진을 JPEG로 바꿔 보낸다.
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";
export const HEIC_UNSUPPORTED_MESSAGE = "아이폰 HEIC 사진은 아직 지원하지 않습니다. 설정에서 '호환성 우선'으로 바꾸거나 JPG로 보내 주세요.";

// 415 응답 본문의 hint로 HEIC 미지원과 그 밖의 해독 실패를 구분한다.
export function unsupportedImageMessage(body: unknown) {
  const hint = body !== null && typeof body === "object" ? (body as { hint?: unknown }).hint : undefined;
  return hint === "heic_unsupported" ? HEIC_UNSUPPORTED_MESSAGE
    : "이 사진을 읽거나 안전하게 변환하지 못했습니다. JPG·PNG·WebP 파일로 다시 첨부해 주세요.";
}
