import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { BRAND } from './src/lib/brand';

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
    name: BRAND.full,
    short_name: BRAND.name,
    description: BRAND.description,
    homepage_url: 'https://github.com/DHoper/jobfit',
    action: { default_title: `${BRAND.name}：打開職缺評估` },
    permissions: ['storage', 'sidePanel', 'scripting', 'activeTab'],
    host_permissions: [...JOB_SITE_MATCHES, 'https://api.deepseek.com/*', 'https://*.workers.dev/*'],
    optional_host_permissions: ['https://*/*'],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+J' }, description: `打開${BRAND.name}側邊欄` },
    },
  },
});
