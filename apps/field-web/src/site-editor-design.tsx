import type { SiteDraft } from './field-site';

const templates = [
  { id: 'essential', name: 'Essential', description: '정돈된 안내', heading: '좋은 시작을 함께.', detail: '필요한 서비스를 편하게' },
  { id: 'editorial', name: 'Editorial', description: '여백이 있는 이야기', heading: '당신만의 시선.', detail: '기억하고 싶은 순간' },
  { id: 'warm', name: 'Warm', description: '따뜻한 분위기', heading: '일상에, 여유를.', detail: '나를 위한 작은 시간' },
] as const;

export function SiteTemplateCards({ template, businessName, onChange }: {
  template: SiteDraft['template'];
  businessName: string;
  onChange: (template: SiteDraft['template']) => void;
}) {
  return <div className="site-template-cards" role="group" aria-label="사이트 템플릿 선택">
    {templates.map(item => <button type="button" key={item.id}
      className="site-template-card" aria-label={`${item.name} · ${item.description}`}
      aria-pressed={template === item.id} onClick={() => onChange(item.id)}>
      <div className={`site-template-thumb ${item.id}`} aria-hidden="true">
        <div className="site-template-paper">
          <div className="site-template-top"><span>{businessName.trim() || '내 브랜드'}</span><i /></div>
          <div className="site-template-core"><div><h3>{item.heading}</h3><p>{item.detail}</p></div>
            <div className="site-template-picture"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></svg></div>
          </div>
        </div>
      </div>
      <div className="site-template-label"><div><strong>{item.name}</strong><span>{item.description}</span></div>
        <span className="site-template-check" aria-hidden="true">{template === item.id ? '✓' : '→'}</span>
      </div>
    </button>)}
  </div>;
}
