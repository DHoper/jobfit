import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '@/styles.css';
import { TooltipProvider } from '@/components/ui';
import { migrate } from '@/lib/storage';
import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

migrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="bottom-center" toastOptions={{ className: '!text-[13px] !rounded-md' }} />
    </TooltipProvider>,
  );
});
