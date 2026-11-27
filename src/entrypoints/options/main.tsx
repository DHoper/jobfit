import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '@/styles.css';
import { TooltipProvider } from '@/components/ui';
import { migrate } from '@/lib/storage';
import App from './App';

migrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
      <App />
      <Toaster position="bottom-right" toastOptions={{ className: '!text-[13px] !rounded-md' }} />
    </TooltipProvider>,
  );
});
