import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
  hooks: {
    // PDF 履歷裡的中文字型需要 CMap 對照表才能正確轉成文字
    'build:publicAssets': (_wxt, files) => {
      const dir = resolve('node_modules/pdfjs-dist/cmaps');
      // 只帶中文（繁中、簡中）需要的對照表，減少擴充功能大小
      const zh = /^(Adobe-(CNS1|GB1)|UniCNS|UniGB|B5|ETen|ETHK|HK|CNS|GB|LICENSE)/;
      for (const f of readdirSync(dir).filter((f) => zh.test(f))) files.push({ absoluteSrc: resolve(dir, f), relativeDest: `pdfjs/cmaps/${f}` });
    },
  },
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
