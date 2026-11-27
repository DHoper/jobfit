# 投準：職缺評估擴充功能

打開 104 的職缺，投準會當下標出台灣職缺常見的地雷，再對照你的經歷判斷**值不值得投**：哪些要求你符合、缺什麼、面試該問什麼、履歷該強調什麼。

- **側邊欄評估**（快捷鍵 Alt+J）：在 104、1111、Cake、Yourator、LinkedIn 的職缺頁打開側邊欄，切換分頁時自動跟著換。其他網站按一下授權也能用，或先選取職缺文字。
- **27 條台灣地雷規則**：責任制、薪資含加班費、低於最低工資、綁約違約金、承攬不保勞健保、月休不足、要你加 LINE、要先付錢等，不用 AI、當下就有結果，並能在頁面上用螢光筆標出原文。
- **你的底線**：設定薪資底線與不能接受的條件，碰到就直接建議跳過，AI 也推翻不了。
- **AI 對照經歷**：逐項列出職缺要求 → 你符合／部分符合／缺少，每一項都引用你個人檔案裡的經歷，不替你編造。在背景執行，關掉側邊欄也會跑完；評估過的職缺，104 頁面上的標籤會直接顯示「建議投／再想想／別投」。
- **投遞紀錄**：想投、已投遞、面試中、offer、沒上，可匯出 CSV。

## 安裝（上架 Chrome 線上應用程式商店前）

1. 下載 [jobfit-extension.zip](https://github.com/DHoper/jobfit/raw/main/dist/jobfit-extension.zip)，解壓縮到不會刪掉的資料夾
2. 在網址列貼上 `chrome://extensions`，打開右上角的「開發人員模式」
3. 按「載入未封裝項目」，選剛才解壓縮的資料夾
4. 安裝後會自動打開設定頁：貼上舊履歷、設定底線
5. 打開任一個 104 職缺，點右側的「評估職缺」標籤，或按瀏覽器上的投準圖示

## 個人資料存在哪裡

個人檔案和投遞紀錄只存在這台電腦的瀏覽器裡（`chrome.storage.local`），不會上傳到任何伺服器。只有按「對照我的經歷評估」時，個人檔案和職缺內容才會送去 AI 分析。換電腦時用「設定與資料」的匯出／匯入。

## AI 評估服務

使用者不需要申請任何金鑰。擴充功能呼叫 `worker/` 裡的 Cloudflare Worker，由它保管站方的 DeepSeek 金鑰：

```bash
npm i -g wrangler
wrangler login
cd worker
wrangler deploy
wrangler secret put DEEPSEEK_API_KEY
```

部署後把網址填進 `src/lib/ai.ts` 的 `DEFAULT_PROXY_URL`，重新建置即可。Worker 只接受擴充功能的請求、每個 IP 每天有次數上限（需綁定 KV，見 `wrangler.toml`），不記錄使用者內容。

開發測試時，可以在「設定與資料」直接填 DeepSeek 金鑰，不經過代理。

## 開發

使用 [WXT](https://wxt.dev) + React + TypeScript + Tailwind CSS，介面元件以 Radix UI 為基礎（shadcn/ui 的寫法）。

```bash
npm install
npm run dev        # 開一個載入擴充功能的 Chrome，改程式會自動重新載入
npm test           # 規則、薪資解析、AI 回傳格式的測試
npm run e2e        # 載入擴充功能，在模擬的 104 職缺頁上實際跑一遍（需先 build）
npm run typecheck
npm run build      # 輸出到 .output/chrome-mv3
npm run package    # 打包成 dist/jobfit-extension.zip
```

```
src/
  entrypoints/
    sidepanel/        側邊欄：這個職缺、投遞紀錄
    options/          個人檔案、底線與薪資、投遞紀錄、設定與資料
    job104.content.ts 104 職缺頁右側的「評估職缺」標籤
    background.ts     打開側邊欄
  lib/
    rules.ts          台灣職缺地雷規則（含否定句判斷，例如「非責任制」不算）
    salary.ts         薪資解析與最低工資（2026：29,500／196；2027：30,900／205）
    extract.ts        讀取職缺：104 用職缺頁自己的資料 API，其他網站用 JSON-LD，最後才讀頁面文字
    prompt.ts         給 AI 的提示詞與回傳格式驗證（zod）
    judge.ts          底線與薪資期望，永遠優先於 AI
    ai.ts             呼叫代理或 DeepSeek，格式錯誤自動重試一次
  components/         介面元件
worker/               AI 代理（Cloudflare Worker）
tests/
```

最低工資每年第 3 季審議，隔年 1 月 1 日生效；新的數字公布後更新 `src/lib/salary.ts` 的 `MIN_WAGE`。
