import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Jimp } from 'jimp';

dotenv.config();

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL ? process.env.GOOGLE_SCRIPT_URL.replace(/^["']|["']$/g, '').trim() : '';
const DATA_FILE = path.join(process.cwd(), 'data', 'records.json');

async function migrate() {
  if (!GOOGLE_SCRIPT_URL) {
    console.error('❌ 錯誤：未在 .env 檔案中找到 GOOGLE_SCRIPT_URL，請先完成部署並設定！');
    return;
  }

  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ 錯誤：未找到 data/records.json 資料庫快取檔案。');
    return;
  }

  console.log('🔄 開始載入本地資料庫...');
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  
  if (!Array.isArray(data)) {
    console.error('❌ 錯誤：資料格式不正確，預期為陣列。');
    return;
  }

  const base64Records = data.filter(r => {
    return r.imageUrl && (
      r.imageUrl.startsWith('data:') || 
      r.imageUrl.startsWith('/9j/') || 
      r.imageUrl.startsWith('iVBORw0KG')
    );
  });

  if (base64Records.length === 0) {
    console.log('✅ 檢查完畢：目前資料庫中沒有任何 Base64 格式的圖片需要轉移。');
    return;
  }

  console.log(`ℹ️ 偵測到有 ${base64Records.length} 筆資料含有 Base64 圖片。準備進行轉移...`);

  let successCount = 0;

  for (let i = 0; i < base64Records.length; i++) {
    const record = base64Records[i];
    console.log(`\n⏳ [${i + 1}/${base64Records.length}] 正在同步傳票: ${record.id} (${record.seller_name || '無名店家'})...`);
    
    let imageUrl = record.imageUrl;

    // 1. 若圖片大於 150KB，使用 Jimp 進行自動壓縮/調整大小
    if (imageUrl.length > 200000) {
      console.log(`   ⚙️ 偵測為大型圖片 (大小約 ${(imageUrl.length * 0.75 / 1024).toFixed(1)} KB)，啟動壓縮...`);
      try {
        let base64Data = imageUrl;
        if (imageUrl.startsWith('data:')) {
          base64Data = imageUrl.split(',')[1];
        } else {
          // 如果沒有前綴，確認開頭，防呆補齊
          if (imageUrl.startsWith('/9j/')) {
            imageUrl = 'data:image/jpeg;base64,' + imageUrl;
          } else if (imageUrl.startsWith('iVBORw0KG')) {
            imageUrl = 'data:image/png;base64,' + imageUrl;
          } else {
            imageUrl = 'data:image/jpeg;base64,' + imageUrl;
          }
          base64Data = imageUrl.split(',')[1];
        }

        const buffer = Buffer.from(base64Data, 'base64');
        const jimg = await Jimp.read(buffer);

        // 如果寬度大於 1200px，進行等比例縮小
        if (jimg.width > 1200) {
          jimg.resize({ w: 1200 });
        }
        
        // 壓縮為高品質 JPEG (品質 75%)
        imageUrl = await jimg.getBase64('image/jpeg', { quality: 75 });
        console.log(`   ✅ 壓縮成功！(壓縮後大小約: ${(imageUrl.length * 0.75 / 1024).toFixed(1)} KB)`);
      } catch (compressErr) {
        console.warn(`   ⚠️ 圖片處理/壓縮失敗，將嘗試使用原始圖片發送:`, compressErr.message || compressErr);
        // 回退至標準 data url 格式
        if (!imageUrl.startsWith('data:')) {
          if (imageUrl.startsWith('/9j/')) imageUrl = 'data:image/jpeg;base64,' + imageUrl;
          else if (imageUrl.startsWith('iVBORw0KG')) imageUrl = 'data:image/png;base64,' + imageUrl;
          else imageUrl = 'data:image/jpeg;base64,' + imageUrl;
        }
      }
    } else {
      // 小型圖片直接標準化 data url 格式
      if (!imageUrl.startsWith('data:')) {
        if (imageUrl.startsWith('/9j/')) imageUrl = 'data:image/jpeg;base64,' + imageUrl;
        else if (imageUrl.startsWith('iVBORw0KG')) imageUrl = 'data:image/png;base64,' + imageUrl;
        else imageUrl = 'data:image/jpeg;base64,' + imageUrl;
      }
    }

    // 2. 構造上傳 payload
    const payload = {
      action: 'update',
      record: {
        ...record,
        imageUrl: imageUrl
      }
    };

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP 錯誤狀態碼: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.record && result.record.imageUrl) {
        const driveUrl = result.record.imageUrl;
        console.log(`   ✅ 成功上傳並同步！已取得 Google Drive 連結: ${driveUrl}`);
        
        // 3. 更新本地記憶體中的紀錄
        const index = data.findIndex(r => r.id === record.id);
        if (index !== -1) {
          data[index].imageUrl = driveUrl;
          // 即時寫入檔案，確保如果中途斷開也不會遺失已成功的進度
          fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
          successCount++;
        }
      } else {
        console.error(`   ❌ 轉移失敗: ${result.error || 'Apps Script 回傳成功但無 Drive 網址'}`);
      }
    } catch (err) {
      console.error(`   ❌ 連線到 Apps Script 發生錯誤:`, err.message || err);
    }
  }

  console.log(`\n🎉 轉移作業完成！成功轉移 ${successCount} / ${base64Records.length} 筆圖片資料。`);
  console.log(`📊 本地資料庫 records.json 已清理完成。檔案大小大幅縮減！`);
}

migrate();
