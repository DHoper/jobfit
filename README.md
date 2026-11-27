# 避雷針：職缺避雷與評估

投履歷之前，先知道這份工作值不值得投。打開職缺，避雷針會當下標出台灣職缺常見的地雷，再對照你的經歷告訴你：建議投、再想想，還是別投。

![打開職缺，地雷馬上標出來](docs/store/1-flags.png)

## 功能

- **地雷偵測**：27 條台灣職缺規則，包括責任制、需配合加班、薪資含加班費、低於最低工資、試用期打折、綁約違約金、承攬不保勞健保、月休不足、要你加 LINE、要先付錢、海外高薪等。不用 AI，當下就有結果；「非責任制」這類否定寫法不會誤判。
- **看得到原文**：直接在職缺頁上用螢光筆標出地雷字詞，工具列圖示顯示地雷數量。
- **你的底線**：薪資底線、任一條規則、自訂關鍵字都能設成底線，碰到就直接建議跳過，AI 也推翻不了。
- **對照你的經歷**：逐項列出職缺要求，標示你符合、部分符合或缺少，每一項都引用你個人檔案裡的經歷，不替你編造。附上面試該問的問題、履歷該強調的經歷。
- **上傳舊履歷**：PDF 或 Word 直接拖進來，在瀏覽器裡轉成文字，再讓 AI 拆成個人檔案欄位。
- **投遞紀錄**：想投、已投遞、面試中、offer、沒上。看自己的面試率，以及 AI 建議和實際結果對不對得上。可加筆記、匯出 CSV。
- **隱私**：個人檔案和紀錄只存在你的電腦；送給 AI 前自動移除姓名、電話、Email 等個資。詳見[隱私權政策](docs/PRIVACY.md)。

支援 104、1111、Cake、Yourator、LinkedIn；其他網站按一下授權也能用，或先選取職缺文字。快捷鍵 Alt+J 打開側邊欄。

![對照你的經歷，告訴你該不該投](docs/store/2-verdict.png)

## 安裝（上架 Chrome 線上應用程式商店前）

1. 下載 [jobfit-extension.zip](https://github.com/DHoper/jobfit/raw/main/dist/jobfit-extension.zip)，解壓縮到不會刪掉的資料夾
2. 在網址列貼上 `chrome://extensions`，打開右上角的「開發人員模式」
3. 按「載入未封裝項目」，選剛才解壓縮的資料夾
4. 安裝後會自動打開設定頁：上傳或貼上舊履歷、設定底線
5. 打開任一個職缺，點頁面右側的「評估職缺」標籤（104），或按瀏覽器上的避雷針圖示

## AI 評估服務

使用者不需要申請任何金鑰。擴充功能呼叫 `worker/` 裡的 Cloudflare Worker，由它保管站方的 DeepSeek 金鑰：

```bash
npm i -g wrangler
wrangler login
cd worker
wrangler deploy
wrangler secret put DEEPSEEK_API_KEY
```

部署後把網址填進 `src/lib/ai.ts` 的 `DEFAULT_PROXY_URL`，重新建置即可。Worker 只接受擴充功能的請求、每個 IP 每天有次數上限（需綁定 KV，見 `wrangler.toml`）、每次回答有長度上限，不記錄使用者內容。

開發測試時，可以在「設定與資料」直接填 DeepSeek 金鑰，不經過代理，並用「測試連線」確認。

## 開發

使用 [WXT](https://wxt.dev) + React + TypeScript + Tailwind CSS，介面元件以 Radix UI 為基礎（shadcn/ui 的寫法）。

```bash
npm install
npm run dev          # 開一個載入擴充功能的 Chrome，改程式會自動重新載入
npm test             # 規則、薪資、去識別化、履歷檔案、統計的單元測試
npm run typecheck
npm run build        # 輸出到 .output/chrome-mv3
npm run e2e          # 把擴充功能載入 Chrome，在模擬的職缺頁上實際跑一遍（需先 build）
npm run screenshots  # 重新產生 docs/store/ 的商店截圖（需先 build）
npm run package      # 打包成 dist/jobfit-extension.zip
```

端對端測試需要 Chrome for Testing（一般版 Chrome 不允許用命令列載入擴充功能），用 `CHROME_PATH` 指定路徑。GitHub Actions 會在每個 PR 跑完整流程。

```
src/
  entrypoints/
    sidepanel/        側邊欄：這個職缺、投遞紀錄
    options/          個人檔案、底線與薪資、投遞紀錄、設定與資料
    job104.content.ts 104 職缺頁右側的「評估職缺」標籤
    background.ts     打開側邊欄、背景執行 AI 評估、工具列地雷數
  lib/
    rules.ts          台灣職缺地雷規則（含否定句判斷、自訂關鍵字）
    salary.ts         薪資解析與最低工資（2026：29,500／196；2027：30,900／205）
    extract.ts        讀取職缺：104 資料 API → JSON-LD → 網站專屬區塊 → 頁面文字
    prompt.ts         給 AI 的提示詞與回傳格式驗證
    redact.ts         送 AI 前移除個資
    resume-file.ts    PDF／Word 履歷轉文字（全部在瀏覽器裡）
    evaluate.ts       背景執行評估，關掉側邊欄也會跑完
    judge.ts          底線與薪資期望，永遠優先於 AI
    stats.ts          投遞統計、AI 建議與結果對照
    brand.ts          產品名稱（改名只要改這裡、兩個 index.html 的標題和這份 README）
worker/               AI 代理（Cloudflare Worker）
docs/                 隱私權政策、商店上架資料與截圖
scripts/screenshots/  商店截圖產生器
tests/                單元測試與端對端測試
```

最低工資每年第 3 季審議，隔年 1 月 1 日生效；新的數字公布後更新 `src/lib/salary.ts` 的 `MIN_WAGE`。
