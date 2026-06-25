import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;

// Helper to safely get environment variables without quotes or outer whitespace
const getCleanEnvVar = (key: string): string => {
  const val = process.env[key];
  return val ? val.replace(/^["']|["']$/g, '').trim() : '';
};

// High-capacity JSON parsing for supporting larger base64 invoice images
app.use(express.json({ limit: '15mb' }));

const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Yuanqi corporate tax ID is simulated as "60327997"
const YUANQI_VAT_ID = '60327997';

const SEED_RECORDS: any[] = [];

// Initialize database with seed records if empty
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(SEED_RECORDS, null, 2), 'utf8');
}

// Helper to read records safely with property level backward-compatibility fallbacks
function readRecords() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const records = JSON.parse(data);
      if (Array.isArray(records)) {
        return records.map((r: any) => ({
          ...r,
          date: String(r.date || '').split('T')[0].split(' ')[0],
          billing_type: r.billing_type || '事後報帳',
          status: r.status || '免簽核/待查閱',
          approved_by: r.approved_by || '',
          approved_at: r.approved_at || '',
          recorded_by: r.recorded_by || ''
        }));
      }
    }
  } catch (error) {
    console.error('Error reading records file:', error);
  }
  return SEED_RECORDS;
}

// Helper to write records safely
function writeRecords(records: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing records file:', error);
  }
}

// Lazy Gemini API initialization
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = getCleanEnvVar('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY 尚未設定，請在專案根目錄的 .env 檔案中設定您的金鑰。'
      );
    }
    aiInstance = new GoogleGenAI({
      apiKey,
    });
  }
  return aiInstance;
}

// Helper function to sync record updates to Google Sheets via Apps Script Web App (Background Async)
function syncToGoogleSheets(action: 'create' | 'update' | 'delete', record: any) {
  const url = getCleanEnvVar('GOOGLE_SCRIPT_URL');
  if (!url) return;

  // Execute asynchronously in the background so it doesn't block the API response
  (async () => {
    try {
      console.log(`[Google Sheets 同步] 正在同步 "${action}" 操作，ID: ${record.id}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, record })
      });
      if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        console.log(`[Google Sheets 同步] 同步成功 (${action})`);
      } else {
        console.error(`[Google Sheets 同步] 同步失敗: ${result.error}`);
      }
    } catch (error: any) {
      console.error(`[Google Sheets 同步] 連線異常:`, error.message || error);
    }
  })();
}

// Middleware to check operator password for editing and deleting
const checkOperatorPassword = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const clientPassword = req.headers['x-operation-password'];
  const correctPassword = getCleanEnvVar('OPERATOR_PASSWORD');
  
  if (!correctPassword) {
    return res.status(500).json({ error: '系統錯誤：後端環境變數 OPERATOR_PASSWORD 尚未設定。' });
  }
  
  if (clientPassword !== correctPassword) {
    return res.status(403).json({ error: '安全核對失敗：操作密碼不正確或未提供。' });
  }
  next();
};

// API Routes

// Verify password API endpoint
app.post(['/api/verify-password', '/verify-password'], (req, res) => {
  const { password } = req.body;
  const correctPassword = getCleanEnvVar('OPERATOR_PASSWORD');
  if (!correctPassword) {
    return res.status(500).json({ success: false, error: '後端環境變數 OPERATOR_PASSWORD 尚未設定。' });
  }
  if (password === correctPassword) {
    res.json({ success: true });
  } else {
    res.status(403).json({ success: false, error: '密碼錯誤' });
  }
});

// Verify login password API endpoint
app.post(['/api/verify-login', '/verify-login'], (req, res) => {
  const { password } = req.body;
  const correctPassword = getCleanEnvVar('LOGIN_PASSWORD');
  if (!correctPassword) {
    return res.status(500).json({ success: false, error: '後端環境變數 LOGIN_PASSWORD 尚未設定。' });
  }
  if (password === correctPassword) {
    res.json({ success: true });
  } else {
    res.status(403).json({ success: false, error: '登入密碼錯誤' });
  }
});

// Load all accounting records
app.get(['/api/records', '/records'], async (req, res) => {
  const url = getCleanEnvVar('GOOGLE_SCRIPT_URL');
  let records = readRecords();

  if (url) {
    try {
      console.log('正在從 Google Sheets 獲取最新資料...');
      const response = await fetch(url);
      if (response.ok) {
        const sheetsRecords = await response.json();
        if (Array.isArray(sheetsRecords)) {
          records = sheetsRecords.map((r: any) => ({
            id: String(r.id || ''),
            date: String(r.date || '').split('T')[0].split(' ')[0],
            billing_type: r.billing_type || '事後報帳',
            invoice_number: String(r.invoice_number || ''),
            status: r.status || '免簽核/待查閱',
            approved_by: String(r.approved_by || ''),
            approved_at: String(r.approved_at || ''),
            seller_name: String(r.seller_name || ''),
            seller_tax_id: String(r.seller_tax_id || ''),
            buyer_tax_id: String(r.buyer_tax_id || ''),
            summary: String(r.summary || ''),
            category: r.category || '其他支出',
            amount_sales: Number(r.amount_sales) || 0,
            amount_tax: Number(r.amount_tax) || 0,
            amount_total: Number(r.amount_total) || 0,
            currency: String(r.currency || 'TWD'),
            notes: String(r.notes || ''),
            createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
            imageUrl: String(r.imageUrl || ''),
            recorded_by: String(r.recorded_by || '')
          }));
          writeRecords(records);
          console.log('已成功從 Google Sheets 同步並更新本地快取！');
        }
      } else {
        console.warn(`從 Google Sheets 載入失敗 (HTTP ${response.status})，將使用本地快取。`);
      }
    } catch (error: any) {
      console.error('從 Google Sheets 獲取資料發生連線錯誤，使用本地快取：', error.message || error);
    }
  }

  res.json({ records, yuanqiVatId: YUANQI_VAT_ID });
});

// Create an accounting record
app.post(['/api/records', '/records'], (req, res) => {
  if (!req.body.recorded_by || !req.body.recorded_by.trim()) {
    return res.status(400).json({ error: '登錄失敗：必須填寫登錄人！' });
  }
  const records = readRecords();
  const newRecord = {
    ...req.body,
    date: String(req.body.date || '').split('T')[0].split(' ')[0],
    id: req.body.id || 'rec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    createdAt: req.body.createdAt || new Date().toISOString()
  };
  records.push(newRecord);
  writeRecords(records);
  
  // Trigger async sync to Google Sheets
  syncToGoogleSheets('create', newRecord);

  res.status(201).json(newRecord);
});

// Update an accounting record
app.put(['/api/records/:id', '/records/:id'], checkOperatorPassword, (req, res) => {
  if (req.body.recorded_by !== undefined && (!req.body.recorded_by || !req.body.recorded_by.trim())) {
    return res.status(400).json({ error: '修改失敗：必須填寫登錄人！' });
  }
  const records = readRecords();
  const { id } = req.params;
  const index = records.findIndex((r: any) => r.id === id);
  if (index !== -1) {
    const updatedRecord = { 
      ...req.body,
      date: req.body.date ? String(req.body.date).split('T')[0].split(' ')[0] : records[index].date
    };
    records[index] = { ...records[index], ...updatedRecord };
    writeRecords(records);

    // Trigger async sync to Google Sheets
    syncToGoogleSheets('update', records[index]);

    res.json(records[index]);
  } else {
    res.status(404).json({ error: `Record with id ${id} not found.` });
  }
});

// Delete an accounting record
app.delete(['/api/records/:id', '/records/:id'], checkOperatorPassword, (req, res) => {
  const records = readRecords();
  const { id } = req.params;
  const targetRecord = records.find((r: any) => r.id === id);
  const updatedRecords = records.filter((r: any) => r.id !== id);
  if (records.length !== updatedRecords.length) {
    writeRecords(updatedRecords);

    // Trigger async sync to Google Sheets
    if (targetRecord) {
      syncToGoogleSheets('delete', targetRecord);
    }

    res.json({ success: true, message: `Record ${id} deleted successfully.` });
  } else {
    res.status(404).json({ error: `Record ${id} not found.` });
  }
});

// Gemini OCR Parser Route
app.post(['/api/ocr', '/ocr'], async (req, res) => {
  const { base64Image, mimeType, description } = req.body;

  try {
    const ai = getGeminiClient();

    let parts: any[] = [];

    // System prompt with accounting rules and constraints
    const systemPromptMessage = `你是一個精通中華民國（台灣）會計稅務法規、國際會計準則（IFRS）以及企業財務審計的「智慧型公司記帳與單據辨識專家」。你的任務是為「元啟實業有限公司」辨識並記帳。
請分析這張發票或憑證，精確辨識關鍵財務資訊，並進行會計科目分類，最後 strict 輸出 JSON。

規範：
1. 語言與名稱：台灣單據以繁體中文辨識；國外單據（如英文、日文）保留原始賣方名稱與摘要關鍵字（核對用），但在 category 會計科目則必須歸入在列出的中文分類。
2. 統一編號：仔細檢查有沒有買受人統一編號（買方統編，元啟實業的統一編號是 "${YUANQI_VAT_ID}"）。「僅在發票影像中明確印有該統編」時，才填寫 buyer_tax_id 為 "${YUANQI_VAT_ID}"，若無印出、非此統編、或是看不清，則必須設為空字串 ""，絕對不可自行預設或虛構。同時也請辨識賣方統一編號。這對扣抵營業稅至關重要。
3. 金額拆解防呆：區分 未稅金額（amount_sales）、稅額（amount_tax）與含稅總金額（amount_total）。
   - 若單據是免稅、收據或海外憑證，則 amount_sales = amount_total, amount_tax = 0。
   - 務必確保：amount_sales + amount_tax = amount_total（數學一致性防呆）。
4. 日期格式：消費日期統一格式化成 "YYYY-MM-DD"（例如 2026-05-15）。如果發票上是民國年（例如 115年5-6月，或 115年06月12日），請轉換成西元，若只有月份區間（如 115年5-6月），請使用該區間的開單日、合理付款日或月份最後一天（如：2026-06-22）。
5. 摘要：將單據中的主要消費項目濃縮成簡短扼要的繁體中文摘要。
6. 費用分類標準 (會計科目)：
   - '辦公用品'：文具、紙張、碳粉、小型耗材。
   - '交際費'：客商餐敘、送禮、公關、公商會議聚餐。
   - '旅費-國內'：國內出差的油資、高鐵、計程車、捷運、住宿費。
   - '旅費-國外'：出國機票、海外交通車資、海外住宿。
   - '修繕費'：電腦或螢幕維修、辦公設備維修、辦公室室內修繕。
   - '水電郵電費'：水費、電費、電話費、公司上網費、掛號郵資。
   - '雜項購置'：非文具的小型常規消耗品（洗手乳、垃圾袋、清潔劑、辦公室盆栽）。
   - '國際貿易費用'：國際物流、快遞、關稅、報關手續費、進口代徵營業稅。
   - '其他支出'：無法歸入上述 1-8 類的項目。此時，必須在 notes 欄位中詳細說明具體性質與項目（例如：公司十週年紀念布條設計與印刷費）。
7. 帳務類型（billing_type）與簽核狀態（status）推理邏輯：
   - 透過推理判斷該筆項目的帳務類型（billing_type）：
     * 若圖片為「估價單」、「報價單」、「訂購單」或無發票號碼之採購申請，屬於尚未支出，歸類為 "事前請款"。
     * 若圖片為「電子發票」、「收據」、「刷卡簽單」、「已蓋章之收付憑證」，屬於已經支出，歸類為 "事後報帳"。
   - 簽核狀態（status）初始化規範：
     * 狀態一律預設為 "免簽核/待查閱"（配合目前公司不強制簽核、僅供內部溝通的彈性原則）。
   - 核准資訊初始化：
     * approved_by（核准人）與 approved_at（核准時間）一律初始化為空字串 ""。`;

    if (base64Image && mimeType) {
      parts.push({
        inlineData: {
          mimeType,
          data: base64Image
        }
      });
    }

    const userInput = description
      ? `以下是使用者提供的發票資訊或說明："${description}"。請辨識並完善所有未提供之欄位。`
      : `請對上傳的發票/憑證圖片進行完整的視覺辨識、OCR 與稅務科目分類。`;

    parts.push({ text: userInput });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        systemInstruction: systemPromptMessage,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: {
              type: Type.STRING,
              description: '消費日期，格式統一為 YYYY-MM-DD'
            },
            invoice_number: {
              type: Type.STRING,
              description: '發票號碼或收據憑證編號，若單據上沒有請填寫空字串'
            },
            seller_name: {
              type: Type.STRING,
              description: '賣方名稱/店家名稱'
            },
            seller_tax_id: {
              type: Type.STRING,
              description: '賣方統一編號，若無請填寫空字串'
            },
            buyer_tax_id: {
              type: Type.STRING,
              description: `買方統一編號(公司統編)。必須只在發票或憑證影像中「明確印有此統編 ${YUANQI_VAT_ID}」時才填寫。若沒有印出或看不清，必須填寫空字串 ""`
            },
            summary: {
              type: Type.STRING,
              description: '消費品名或主要項目的繁體中文摘要'
            },
            category: {
              type: Type.STRING,
              enum: [
                '辦公用品',
                '交際費',
                '旅費-國內',
                '旅費-國外',
                '修繕費',
                '水電郵電費',
                '雜項購置',
                '國際貿易費用',
                '其他支出'
              ],
              description: '會計科目分類，只能是指定 enumerator 項目'
            },
            amount_sales: {
              type: Type.NUMBER,
              description: '未稅銷售金額'
            },
            amount_tax: {
              type: Type.NUMBER,
              description: '稅額'
            },
            amount_total: {
              type: Type.NUMBER,
              description: '含稅總金額，必須等於 amount_sales + amount_tax'
            },
            currency: {
              type: Type.STRING,
              description: '幣別縮寫，如 TWD, USD, JPY'
            },
            notes: {
              type: Type.STRING,
              description: '備註說明，若為其他支出則必須詳細描述理由'
            },
            billing_type: {
              type: Type.STRING,
              enum: ['事前請款', '事後報帳'],
              description: '帳務申請類型。估價/報價/訂購/無發票號之採購等選：事前請款。發票/收據/刷卡簽單/已付款憑證選：事後報帳。'
            },
            status: {
              type: Type.STRING,
              enum: ['免簽核/待查閱', '待簽核', '已核准', '已退回'],
              description: '簽核狀態。初始化時預設一律為『免簽核/待查閱』。'
            },
            approved_by: {
              type: Type.STRING,
              description: '核准人，初始化一律為空字串'
            },
            approved_at: {
              type: Type.STRING,
              description: '核准時間 YYYY-MM-DD HH:mm:ss，初始化一律為空字串'
            }
          },
          required: [
            'date',
            'seller_name',
            'category',
            'amount_sales',
            'amount_tax',
            'amount_total',
            'currency',
            'billing_type',
            'status',
            'approved_by',
            'approved_at'
          ]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('無法從 Gemini 生成內容取得文字輸出。');
    }

    const parsedJson = JSON.parse(text);
    res.json({ success: true, result: parsedJson });
  } catch (error: any) {
    console.error('OCR analysis error:', error);
    res.status(500).json({
      success: false,
      message: error.message || '無法解析該單據，請重試或確認 GEMINI_API_KEY 已正確設定。',
      details: error.stack
    });
  }
});

// Configure Vite middleware for dev or Serve static client bundle in prod
async function setupViteOrStaticAndListen() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Prevent browser from caching the Service Worker file
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(path.join(distPath, 'sw.js'));
    });
    app.use(express.static(distPath));
    // Serve index.html for SPA on non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`元啟實業會計後端伺服器 啟動於 http://0.0.0.0:${PORT}`);
  });
}

// 僅在非 Vercel 環境下執行監聽和設置開發伺服器
if (!isVercel) {
  setupViteOrStaticAndListen();
}

export default app;
