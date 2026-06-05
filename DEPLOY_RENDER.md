# 飲食順序創意決策助理：Render 部署步驟

這個版本已經整理成 React/Vite + Express + PWA，可部署成一個網址。

## 1. 上傳到 GitHub

1. 建立一個新的 GitHub repository。
2. 將本資料夾所有檔案上傳。

## 2. 在 Render 建立 Web Service

1. 進入 Render Dashboard。
2. New → Web Service。
3. 連接剛剛的 GitHub repository。
4. 設定：
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: Node

## 3. 設定環境變數

在 Render 的 Environment Variables 加入：

```
NODE_ENV=production
GEMINI_API_KEY=你的 Gemini API key
```

不要把真正的 API key 寫進程式碼或 GitHub。

## 4. 部署完成後

Render 會提供一個公開網址，例如：

```
https://your-app-name.onrender.com
```

用手機打開這個網址後，可以在 Safari / Chrome 選擇「加入主畫面」，就能像 App 一樣使用。

## 5. 本版修改重點

- 保留原本的趣味性與互動流程。
- 只輕量修正太絕對、太像醫療保證的句子。
- 新增 PWA manifest、service worker、icon。
- 修正 `PORT`，讓 Render / Railway 類平台可以正常啟動。
- AI prompt 改成生活化、有趣但不要亂編精確生理數字。
- Gemini API 失敗時會顯示 fallback 提醒。
