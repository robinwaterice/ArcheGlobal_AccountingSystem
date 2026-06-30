/**
 * Google Apps Script - 記帳與單據辨識系統 串接代碼 (繁體中文標頭版本)
 *
 * 說明：
 * 1. 請在您的 Google 試算表中點選「擴充功能」 > 「Apps Script」。
 * 2. 清除所有預設程式碼，並將本檔案內容完整貼入。
 * 3. 點選儲存後，點選右上角「部署」 > 「新增部署」。
 * 4. 類型選取「網頁應用程式」，「執行身分」設定為「您自己」，「誰存取此網頁應用程式」設定為「任何人」。
 * 5. 部署並授權後，複製產生的 URL 設定到 `.env` 中的 `GOOGLE_SCRIPT_URL`。
 *
 * 特色：
 * - 試算表的欄位標頭會顯示為「繁體中文」（如 傳票ID, 消費日期, 帳務類型... 等），美觀易讀。
 * - 自動依據消費日期 (例如 2026-06-12) 分類至對應的民國年月工作表分頁 (例如 115年06月)。
 * - 具備雙向欄位翻譯，完美相容現有的舊英文標頭與新的中文標頭。
 */

// 欄位英文 Key 與繁體中文標頭的對照表
var FIELD_MAP = [
  { key: 'id', name: '傳票ID' },
  { key: 'date', name: '消費日期' },
  { key: 'billing_type', name: '帳務類型' },
  { key: 'invoice_number', name: '發票/憑證編號' },
  { key: 'status', name: '簽核狀態' },
  { key: 'approved_by', name: '核准人' },
  { key: 'approved_at', name: '核准時間' },
  { key: 'seller_name', name: '賣方名稱' },
  { key: 'seller_tax_id', name: '賣方統一編號' },
  { key: 'buyer_tax_id', name: '買方統一編號' },
  { key: 'summary', name: '品名摘要' },
  { key: 'category', name: '會計科目' },
  { key: 'amount_sales', name: '銷售金額(未稅)' },
  { key: 'amount_tax', name: '稅額' },
  { key: 'amount_total', name: '總金額(含稅)' },
  { key: 'currency', name: '幣別' },
  { key: 'notes', name: '備註說明' },
  { key: 'createdAt', name: '建檔時間' },
  { key: 'imageUrl', name: '憑證照片連結' },
  { key: 'recorded_by', name: '登錄人' }
];

// 將中文標頭轉換回英文 Key，確保回傳給網頁的 JSON 欄位名稱正確
function getHeaderKeys(headers) {
  if (!headers || !headers.map) {
    return [];
  }
  return headers.map(function (headerName) {
    for (var i = 0; i < FIELD_MAP.length; i++) {
      if (FIELD_MAP[i].name === headerName || FIELD_MAP[i].key === headerName) {
        return FIELD_MAP[i].key;
      }
    }
    return headerName;
  });
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var allRecords = [];

  for (var k = 0; k < sheets.length; k++) {
    var sheet = sheets[k];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue; // 跳過空工作表

    var headers = data[0];
    var keys = getHeaderKeys(headers);

    // 檢查是否有 id 欄位標頭，以確認是會計資料表
    if (keys.indexOf('id') === -1) continue;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var record = {};
      for (var j = 0; j < keys.length; j++) {
        record[keys[j]] = row[j];
      }
      allRecords.push(record);
    }
  }

  return ContentService.createTextOutput(JSON.stringify(allRecords))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var record = payload.record;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'migrate') {
      convertSheetImagesToDrive();
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: '試算表照片批次轉存雲端硬碟完成！' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 根據消費日期推算目標民國年月份分頁名稱 (例如: 115年06月)
    var targetSheetName = getMinguoYearMonth(record.date);

    // 檢查是否有 base64 格式的圖片需要上傳到 Google Drive (支援有前綴與無前綴格式)
    var isBase64 = record.imageUrl && (
      record.imageUrl.indexOf('data:image/') === 0 ||
      record.imageUrl.indexOf('/9j/') === 0 ||
      record.imageUrl.indexOf('iVBORw0KG') === 0
    );

    if (isBase64) {
      try {
        var driveUrl = uploadBase64ToDrive(record.imageUrl, record.id || ('img_' + new Date().getTime()), targetSheetName);
        if (driveUrl) {
          record.imageUrl = driveUrl;
        } else {
          throw new Error('uploadBase64ToDrive 傳回空網址');
        }
      } catch (uploadErr) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: '圖片上傳至雲端硬碟失敗，請確認 Apps Script 已授權 DriveApp。錯誤細節: ' + uploadErr.toString()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'create') {
      var sheet = getOrCreateSheet(ss, targetSheetName);
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var rowData = mapRecordToRow(record, headers);
      sheet.appendRow(rowData);
      return ContentService.createTextOutput(JSON.stringify({ success: true, record: record }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'update' || action === 'delete') {
      var sheets = ss.getSheets();
      var foundRow = -1;
      var foundSheet = null;
      var foundHeaders = null;

      // 搜尋所有分頁找到該筆資料
      for (var k = 0; k < sheets.length; k++) {
        var sh = sheets[k];
        var data = sh.getDataRange().getValues();
        if (data.length <= 1) continue;
        var hd = data[0];
        var keys = getHeaderKeys(hd);
        var idIndex = keys.indexOf('id');
        if (idIndex === -1) continue;

        for (var i = 1; i < data.length; i++) {
          if (String(data[i][idIndex]) === String(record.id)) {
            foundRow = i + 1; // 1-based index
            foundSheet = sh;
            foundHeaders = hd;
            break;
          }
        }
        if (foundRow !== -1) break;
      }

      if (foundSheet && foundRow !== -1) {
        if (action === 'delete') {
          foundSheet.deleteRow(foundRow);
        } else if (action === 'update') {
          // 直接在原本所在的分頁進行修改，不進行跨月份分頁搬移
          var rowData = mapRecordToRow(record, foundHeaders);
          foundSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
        }
        return ContentService.createTextOutput(JSON.stringify({ success: true, record: record }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 如果是 update 但沒找到舊資料，視為新增寫入目標分頁
      if (action === 'update') {
        var newSheet = getOrCreateSheet(ss, targetSheetName);
        var newHeaders = newSheet.getRange(1, 1, 1, newSheet.getLastColumn()).getValues()[0];
        var rowData = mapRecordToRow(record, newHeaders);
        newSheet.appendRow(rowData);
        return ContentService.createTextOutput(JSON.stringify({ success: true, record: record }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '找不到該筆傳票 ID: ' + record.id }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: '未知的操作類型: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 取得或建立指定分頁，並初始化欄位標頭
function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeHeaders(sheet);
  }
  return sheet;
}

// 初始化標頭欄位定義 (繁體中文標頭)
function initializeHeaders(sheet) {
  if (sheet.getLastColumn() === 0) {
    var headers = FIELD_MAP.map(function (item) {
      return item.name;
    });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // 格式化標頭為粗體、置中、灰底
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight('bold');
    range.setHorizontalAlignment('center');
    range.setBackground('#f3f3f3');
  }
}

// 根據標頭對齊 record 資料並寫入
function mapRecordToRow(record, headers) {
  var keys = getHeaderKeys(headers);
  return keys.map(function (key) {
    var val = record[key];
    return val === undefined || val === null ? '' : val;
  });
}

// 解析西元日期 (YYYY-MM-DD) 為民國年月份名稱 (例如: 2026-06-12 -> 115年06月)
function getMinguoYearMonth(dateStr) {
  if (!dateStr) {
    return '未分類';
  }
  var parts = dateStr.split('-');
  if (parts.length >= 2) {
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month)) {
      var minguoYear = year - 1911;
      var monthStr = month < 10 ? '0' + month : String(month);
      return minguoYear + '年' + monthStr + '月';
    }
  }
  return '未分類';
}

// 將 Base64 格式的憑證影像解碼，並上傳到 Google 雲端硬碟的特定資料夾中
function uploadBase64ToDrive(dataUrl, fileNamePrefix, monthFolderName) {
  // dataUrl 格式預期為 "data:image/png;base64,iVBORw0KG..." 或 "data:image/jpeg;base64,..."
  // 若為無前綴的純 Base64 字串，則根據字元特徵自動補上前綴
  if (dataUrl.indexOf('data:') !== 0) {
    if (dataUrl.indexOf('/9j/') === 0) {
      dataUrl = 'data:image/jpeg;base64,' + dataUrl;
    } else if (dataUrl.indexOf('iVBORw0KG') === 0) {
      dataUrl = 'data:image/png;base64,' + dataUrl;
    } else {
      dataUrl = 'data:image/jpeg;base64,' + dataUrl; // 預設為 jpeg
    }
  }

  var parts = dataUrl.split(',');
  if (parts.length < 2) return null;

  var meta = parts[0];
  var base64Data = parts[1];

  // 取得 Mime Type
  var mimeType = 'image/png';
  var matches = meta.match(/data:(.*?);/);
  if (matches && matches.length > 1) {
    mimeType = matches[1];
  }

  // 決定對應的副檔名
  var ext = 'png';
  if (mimeType.indexOf('jpeg') !== -1 || mimeType.indexOf('jpg') !== -1) {
    ext = 'jpg';
  } else if (mimeType.indexOf('gif') !== -1) {
    ext = 'gif';
  } else if (mimeType.indexOf('webp') !== -1) {
    ext = 'webp';
  }

  // 解碼 Base64
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileNamePrefix + '.' + ext);

  // 尋找或建立儲存圖片的「發票憑證照片」資料夾，預設建立在試算表所在資料夾
  var parentFolder = getOrCreateImageFolder();
  if (!parentFolder) return null;
  var folder = getOrCreateSubFolder(parentFolder, monthFolderName);
  if (!folder) return null;

  // 建立檔案並寫入雲端硬碟
  var file = folder.createFile(blob);

  // 開啟權限為「任何知道連結的人皆可檢視」，以供前端網頁順利下載與顯示
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // 回傳直連檢視與下載格式 URL
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

// 尋找或建立儲存圖片的「發票憑證照片」資料夾，預設建立在試算表所在資料夾
function getOrCreateImageFolder() {
  var folderName = '發票憑證照片';
  var folder = null;
  var errors = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var ssId = ss.getId();
      var ssFile = DriveApp.getFileById(ssId);
      var parents = ssFile.getParents();
      if (parents.hasNext()) {
        var parentFolder = parents.next();
        var folders = parentFolder.getFoldersByName(folderName);
        if (folders.hasNext()) {
          folder = folders.next();
        } else {
          folder = parentFolder.createFolder(folderName);
        }
      }
    }
  } catch (e) {
    errors.push("同層查找失敗: " + e.toString());
  }

  if (!folder) {
    try {
      var folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
    } catch (e) {
      errors.push("根目錄建立失敗: " + e.toString());
    }
  }

  if (!folder) {
    throw new Error("無法建立或取得雲端資料夾。詳細錯誤: " + errors.join(" | "));
  }
  return folder;
}

// 取得或建立雲端硬碟月份子資料夾
function getOrCreateSubFolder(parentFolder, subFolderName) {
  if (!parentFolder) return null;
  if (!subFolderName) return parentFolder;
  var folders = parentFolder.getFoldersByName(subFolderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    var subFolder = parentFolder.createFolder(subFolderName);
    // 開啟子資料夾共用權限為「任何知道連結的人皆可檢視」
    subFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return subFolder;
  }
}

// 從 Google Drive 連結中擷取檔案 ID
function extractFileIdFromUrl(url) {
  var match = url.match(/id=([^&]+)/);
  if (match && match[1]) {
    return match[1];
  }
  var matchPath = url.match(/\/file\/d\/([^/]+)/);
  if (matchPath && matchPath[1]) {
    return matchPath[1];
  }
  return null;
}

// 掃描並轉換工作表中現有的發票照片為雲端硬碟檔案
function convertSheetImagesToDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var folder = getOrCreateImageFolder();
  if (!folder) {
    SpreadsheetApp.getUi().alert("錯誤：無法建立或取得 '發票憑證照片' 資料夾，請確認已授權雲端硬碟權限。");
    return;
  }

  var processedCount = 0;
  var successCount = 0;
  var failCount = 0;

  for (var k = 0; k < sheets.length; k++) {
    var sheet = sheets[k];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;

    var headers = data[0];
    var keys = getHeaderKeys(headers);

    // 尋找「憑證照片連結」或「imageUrl」欄位的索引
    var imgColIndex = keys.indexOf('imageUrl');
    if (imgColIndex === -1) {
      for (var col = 0; col < headers.length; col++) {
        if (headers[col] === '憑證照片連結' || headers[col] === 'imageUrl') {
          imgColIndex = col;
          break;
        }
      }
    }
    if (imgColIndex === -1) continue; // 如果該工作表沒有圖片欄位，跳過

    // 尋找「傳票ID」或「id」欄位索引，用於命名圖片檔案
    var idColIndex = keys.indexOf('id');
    if (idColIndex === -1) {
      for (var col = 0; col < headers.length; col++) {
        if (headers[col] === '傳票ID' || headers[col] === 'id') {
          idColIndex = col;
          break;
        }
      }
    }

    for (var row = 1; row < data.length; row++) {
      var cell = sheet.getRange(row + 1, imgColIndex + 1);
      var cellValue = cell.getValue();
      var cellFormula = cell.getFormula();

      var targetUrl = null;
      var isBase64 = false;
      var isUrl = false;

      var idVal = idColIndex !== -1 ? String(data[row][idColIndex]).trim() : '';
      if (!idVal) {
        idVal = 'row_' + (row + 1) + '_' + new Date().getTime();
      }

      // 檢查是否為 =IMAGE("url") 函數
      if (cellFormula && cellFormula.toUpperCase().indexOf('=IMAGE') === 0) {
        var match = cellFormula.match(/=IMAGE\(\s*["']([^"']+)["']/i);
        if (match && match[1]) {
          targetUrl = match[1];
          // 若已經是 Google Drive 的連結，跳過不重複上傳
          if (targetUrl.indexOf('drive.google.com') === -1 && targetUrl.indexOf('google.com') === -1) {
            isUrl = true;
          }
        }
      } else if (cellValue && typeof cellValue === 'string') {
        cellValue = cellValue.trim();
        // 檢查是否為 Base64 格式
        if (cellValue.indexOf('data:image/') === 0 || cellValue.indexOf('/9j/') === 0 || cellValue.indexOf('iVBORw0KG') === 0) {
          isBase64 = true;
        } else if (cellValue.indexOf('http://') === 0 || cellValue.indexOf('https://') === 0) {
          // 檢查是否已是 Google Drive 連結
          if (cellValue.indexOf('drive.google.com') !== -1) {
            // 這是已經轉存的 Google Drive 連結，將其移動至對應的月份資料夾
            var fileId = extractFileIdFromUrl(cellValue);
            if (fileId) {
              try {
                var file = DriveApp.getFileById(fileId);
                var targetFolder = getOrCreateSubFolder(folder, sheet.getName());
                var parents = file.getParents();
                var alreadyInSubfolder = false;
                while (parents.hasNext()) {
                  var p = parents.next();
                  if (p.getId() === targetFolder.getId()) {
                    alreadyInSubfolder = true;
                    break;
                  }
                }
                if (!alreadyInSubfolder) {
                  file.moveTo(targetFolder);
                  processedCount++;
                  successCount++;
                }
              } catch (moveErr) {
                Logger.log("移動檔案失敗：" + moveErr.toString() + "，連結：" + cellValue);
              }
            }
          } else if (cellValue.indexOf('google.com') === -1) {
            targetUrl = cellValue;
            isUrl = true;
          }
        }
      }

      if (isUrl && targetUrl) {
        try {
          processedCount++;
          var response = UrlFetchApp.fetch(targetUrl, { muteHttpExceptions: true });
          if (response.getResponseCode() === 200) {
            var blob = response.getBlob();
            var contentType = blob.getContentType();
            var ext = 'png';
            if (contentType.indexOf('jpeg') !== -1 || contentType.indexOf('jpg') !== -1) {
              ext = 'jpg';
            } else if (contentType.indexOf('gif') !== -1) {
              ext = 'gif';
            } else if (contentType.indexOf('webp') !== -1) {
              ext = 'webp';
            }

            blob.setName(idVal + '.' + ext);
            var targetFolder = getOrCreateSubFolder(folder, sheet.getName());
            var file = targetFolder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

            var newUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
            cell.setValue(newUrl);
            successCount++;
          } else {
            failCount++;
            Logger.log("下載圖片失敗，HTTP 狀態碼：" + response.getResponseCode() + "，網址：" + targetUrl);
          }
        } catch (urlErr) {
          failCount++;
          Logger.log("下載圖片出錯：" + urlErr.toString() + "，網址：" + targetUrl);
        }
      } else if (isBase64) {
        try {
          processedCount++;
          var newUrl = uploadBase64ToDrive(cellValue, idVal, sheet.getName());
          if (newUrl) {
            cell.setValue(newUrl);
            successCount++;
          } else {
            failCount++;
            Logger.log("Base64 圖片上傳失敗，傳票 ID：" + idVal);
          }
        } catch (b64Err) {
          failCount++;
          Logger.log("Base64 圖片上傳出錯：" + b64Err.toString() + "，傳票 ID：" + idVal);
        }
      }
    }
  }

  try {
    var ui = SpreadsheetApp.getUi();
    if (ui) {
      ui.alert("轉換完成！\n總共處理：" + processedCount + " 筆\n成功上傳：" + successCount + " 筆\n失敗：" + failCount + " 筆\n詳情請參閱 Apps Script 執行日誌。");
    }
  } catch (e) {
    Logger.log("無 UI 界面，已略過顯示對話框。");
  }
}

// ⚠️ 測試用：強制觸發雲端硬碟 (Google Drive) 授權視窗
// 請在編輯器上方選擇執行 testDriveAuth 函式
function testDriveAuth() {
  var folder = DriveApp.getRootFolder();
  Logger.log("雲端硬碟根目錄名稱: " + folder.getName());
  Logger.log("恭喜！雲端硬碟權限授權成功！");
}

// 當試算表開啟時，自動建立自訂選單
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('記帳與單據系統')
    .addItem('將試算表照片轉存至雲端硬碟', 'convertSheetImagesToDrive')
    .addItem('授權雲端硬碟測試', 'testDriveAuth')
    .addToUi();
}

