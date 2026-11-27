import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// 求職網站：不需要使用者另外授權就能讀取職缺內容
export const JOB_SITE_MATCHES = [
  'https://www.104.com.tw/*',
  'https://www.1111.com.tw/*',
  'https://www.cake.me/*',
  'https://www.cakeresume.com/*',
  'https://www.yourator.co/*',
  'https://www.linkedin.com/*',
];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: '投準：職缺評估',
    short_name: '投準',
    description: '在 104 等求職網站的職缺頁，當下標出台灣職缺地雷，並對照你的經歷判斷值不值得投。',
    homepage_url: 'https://github.com/DHoper/jobfit',
    action: { default_title: '投準：打開職缺評估' },
    permissions: ['storage', 'sidePanel', 'scripting', 'activeTab'],
    host_permissions: [...JOB_SITE_MATCHES, 'https://api.deepseek.com/*', 'https://*.workers.dev/*'],
    optional_host_permissions: ['https://*/*'],
  },
});
