import { type ReactNode } from 'react';
import { Brand } from '@fieldai/ui';
import { previewLinksVisible } from './preview-visibility';

export function SiteEditorFrame({ step, mobileView, navigation, children }: {
  step: 'business' | 'design' | 'pages' | 'contact' | 'publish';
  mobileView: 'edit' | 'preview';
  navigation?: ReactNode;
  children: ReactNode;
}) {
  const isEditor = step === 'pages';
  return <div className="site-shell site-editor-shell">
    <header className="site-header"><a href="/"><Brand product="Field" /></a>
      <nav aria-label="작업 메뉴"><a href="/workspace">사업 운영</a>{previewLinksVisible() && <a href="/preview/owner/editor">화면 검토본</a>}</nav>
    </header>
    <main className={`feature-section site-editor-${step} site-editor-view-${mobileView}${isEditor ? '' : ' site-editor-wizard'}`}>
      {isEditor ? <>{navigation}{children}</> : <div className="site-editor-wizard-body">
        {navigation && <aside className="site-editor-stepbar"><p>내 사이트의 시작</p>{navigation}
          <p className="site-editor-stepbar-note">만드는 중인 내용은<br />고객에게 보이지 않아요.<br />공개는 직접 확인한 뒤.</p>
        </aside>}
        <section className="site-editor-stage">{children}</section>
      </div>}
    </main>
  </div>;
}
