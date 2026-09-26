export const siteFonts = ['system-sans', 'system-serif'] as const;
export type SiteFont = typeof siteFonts[number];
export function isSiteFont(value: unknown): value is SiteFont {
  return typeof value === 'string' && siteFonts.some(font => font === value);
}
