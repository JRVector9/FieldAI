// live 운영 환경에서는 /preview 화면 검토본이 404이므로 링크를 숨긴다.
// "use client" 컴포넌트에서는 APP_PROFILE이 브라우저에 없으므로 next.config의 env로 빌드 시 넣은 NEXT_PUBLIC_APP_PROFILE을 읽는다.
export function previewLinksVisible(profile: string | undefined = process.env.NEXT_PUBLIC_APP_PROFILE) {
  return profile !== "live";
}
