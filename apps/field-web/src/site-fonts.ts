export const siteFonts = [
  { id: 'system-sans', label: '시스템 고딕', family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: 'system-serif', label: '시스템 명조', family: 'Georgia, "Times New Roman", serif' },
] as const;
export type SiteFont = typeof siteFonts[number]['id'];
export function isSiteFont(value: unknown): value is SiteFont {
  return typeof value === 'string' && siteFonts.some(font => font.id === value);
}
export function siteFontFamily(value: unknown): string | undefined {
  return siteFonts.find(font => font.id === value)?.family;
}
