# 投準：職缺評估擴充功能

在 104 的職缺頁按一下，就能知道這個職缺**值不值得投**：對照你的經歷、找出台灣職缺常見的地雷、告訴你面試該問什麼、履歷該強調什麼。

- **104**：職缺頁右下角會自動出現「評估這個職缺」按鈕
- **其他求職網站**（1111、Cake、Yourator、LinkedIn…）：在職缺頁按瀏覽器上的投準圖示 →「評估這個頁面」
- **地雷偵測**：責任制、薪資面議、需配合加班、抗壓性高、試用期打折、底薪加獎金、派遣等，當下就標出來
- **你的底線**：在個人檔案勾選不能接受的條件，碰到就直接建議跳過
- **評估紀錄**：評估過的職缺都會留下來，方便比較

## 安裝（上架 Chrome 線上應用程式商店前）

1. 下載 [jobfit-extension.zip](https://github.com/DHoper/jobfit/raw/main/dist/jobfit-extension.zip)，解壓縮到不會刪掉的資料夾
2. 在網址列貼上 `chrome://extensions`
3. 打開右上角的「開發人員模式」
4. 按「載入未封裝項目」，選剛才解壓縮的資料夾
5. 按瀏覽器上的投準圖示 →「編輯個人檔案」，填好經歷（最快的方式是直接貼上舊履歷）

## 個人資料存在哪裡

個人檔案和評估紀錄只存在你這台電腦的瀏覽器裡（`chrome.storage.local`），不會上傳到任何伺服器。只有按「開始評估」時，個人檔案和職缺內容才會送去 AI 分析。換電腦時用設定頁的「匯出／匯入」搬過去。

## AI 評估服務

使用者不需要申請任何金鑰。擴充功能會呼叫 `worker/` 裡的 Cloudflare Worker，由它保管站方的 DeepSeek 金鑰：

```bash
npm i -g wrangler
wrangler login
cd worker
wrangler deploy
wrangler secret put DEEPSEEK_API_KEY
```

部署後把網址填進 `extension/background.js` 的 `DEFAULT_PROXY_URL`，重新打包即可。Worker 只接受擴充功能的請求、每個 IP 每天有次數上限（需綁定 KV，見 `wrangler.toml`），也不會記錄使用者內容。

開發測試時，可以在設定頁「進階設定」直接填 DeepSeek 金鑰，不經過代理。

## 專案結構

```
extension/
  manifest.json   擴充功能設定
  content.js      職缺頁上的按鈕與評估面板（Shadow DOM，不受網站樣式影響）
  rules.js        台灣職缺地雷規則（不用 AI，當下判斷）
  prompt.js       給 AI 的提示詞與回傳格式
  background.js   呼叫 AI、底線判斷
  options.*       個人檔案、評估紀錄、進階設定
  popup.*         點擴充功能圖示時的小視窗
worker/           AI 代理（Cloudflare Worker）
```

打包：`cd extension && zip -r ../dist/jobfit-extension.zip . -x '*.DS_Store'`
