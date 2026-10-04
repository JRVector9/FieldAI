export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const IMAGE_UPLOAD_GUIDANCE = "JPG·PNG·WebP·HEIC 사진을 서버에서 안전한 형식으로 변환합니다.";
export const HEIC_UNSUPPORTED_MESSAGE = "이 HEIC 사진을 변환하지 못했습니다. 아이폰 설정에서 '호환성 우선'으로 바꾸거나 JPG로 보내 주세요.";

// 415 응답 본문의 hint로 HEIC 미지원과 그 밖의 해독 실패를 구분한다.
export function unsupportedImageMessage(body: unknown) {
  const hint = body !== null && typeof body === "object" ? (body as { hint?: unknown }).hint : undefined;
  return hint === "heic_unsupported" ? HEIC_UNSUPPORTED_MESSAGE
    : "이 사진을 읽거나 안전하게 변환하지 못했습니다. JPG·PNG·WebP 파일로 다시 첨부해 주세요.";
}
