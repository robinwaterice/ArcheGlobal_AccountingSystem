# 元啟實業有限公司 - 記帳與單據辨識系統

本系統專為元啟實業有限公司設計，提供自動化電子發票與憑證辨識、智慧費用分類、會計自動記帳及試算表管理。

## 本機執行步驟

### 前置需求
- Node.js (建議 v18 以上版本)

### 執行步驟

1. **安裝依賴套件**：
   ```bash
   npm install
   ```

2. **設定環境變數**：
   將 `.env.example` 複製並命名為 `.env`：
   ```bash
   cp .env.example .env
   ```
   並於 `.env` 中設定您的 `GEMINI_API_KEY`：
   ```env
   GEMINI_API_KEY="您的_GEMINI_API_金鑰"
   ```

3. **啟動開發伺服器**：
   ```bash
   npm run dev
   ```

4. **瀏覽應用程式**：
   開啟瀏覽器並造訪 `http://localhost:3000`。
