import * as React from 'react';
import { Button } from './ui';

// 介面出錯時不要整片空白：說明發生什麼事、給重新載入的按鈕
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error('[避雷針]', error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md px-6 pt-14">
        <h1 className="text-base font-semibold">這個畫面出錯了</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">你的個人檔案和紀錄都還在。重新載入通常就會恢復；如果一直發生，把下面的錯誤訊息貼到 GitHub 的 issue。</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-surface p-3 text-xs text-ink-2 ring-1 ring-line">{this.state.error.message}</pre>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>重新載入</Button>
          <Button onClick={() => window.open('https://github.com/DHoper/jobfit/issues/new', '_blank')}>回報問題</Button>
        </div>
      </div>
    );
  }
}
