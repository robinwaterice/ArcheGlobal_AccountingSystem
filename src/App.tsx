import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  Layers,
  TrendingDown,
  Calculator,
  Search,
  Filter,
  Trash2,
  Edit3,
  PlusCircle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Check,
  X,
  FileSpreadsheet,
  Building,
  DollarSign,
  HelpCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Zap,
  Eye
} from 'lucide-react';
import { AccountingRecord, ExpenseCategory, BillingType, ApprovalStatus } from './types';

export default function App() {
  // Records state
  const [records, setRecords] = useState<AccountingRecord[]>([]);
  const [yuanqiVatId, setYuanqiVatId] = useState<string>('60327997');
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Theme support
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const isDark = theme === 'dark';

  // Filter conditions
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [deductibleFilter, setDeductibleFilter] = useState<string>('all'); // 'all', 'yes', 'no'
  const [billingTypeFilter, setBillingTypeFilter] = useState<string>('all'); // 'all', '事前請款', '事後報帳'
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all', '免簽核/待查閱', ...
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<string>('all');

  // Form input states
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  
  // OCR & Upload states
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [uploadedImageMimeType, setUploadedImageMimeType] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // Standard Form State
  const [formDate, setFormDate] = useState<string>('');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState<string>('');
  const [formRecordedBy, setFormRecordedBy] = useState<string>('');
  const [formSellerName, setFormSellerName] = useState<string>('');
  const [formSellerTaxId, setFormSellerTaxId] = useState<string>('');
  const [formBuyerTaxId, setFormBuyerTaxId] = useState<string>('');
  const [formSummary, setFormSummary] = useState<string>('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('辦公用品');
  const [formAmountSales, setFormAmountSales] = useState<number>(0);
  const [formAmountTax, setFormAmountTax] = useState<number>(0);
  const [formAmountTotal, setFormAmountTotal] = useState<number>(0);
  const [formCurrency, setFormCurrency] = useState<string>('TWD');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formBillingType, setFormBillingType] = useState<BillingType>('事後報帳');
  const [formStatus, setFormStatus] = useState<ApprovalStatus>('免簽核/待查閱');
  const [formApprovedBy, setFormApprovedBy] = useState<string>('');
  const [formApprovedAt, setFormApprovedAt] = useState<string>('');

  // Tax calculation helpers & automatic tax calculation toggle
  const [autoCalcTax, setAutoCalcTax] = useState<boolean>(true);

  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [selectedFullscreenImage, setSelectedFullscreenImage] = useState<string | null>(null);

  // Image Ref for Drag-n-Drop hover styling
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // New approval view states
  const [activeView, setActiveView] = useState<'records' | 'approval'>('records');
  const [currentApproverName, setCurrentApproverName] = useState<string>('主管張元啟');
  const [selectedApprovalRecordId, setSelectedApprovalRecordId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // Authorization states
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return sessionStorage.getItem('app_authorized') === 'true';
  });
  const [loginPasswordInput, setLoginPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Handle System Login password submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch('/api/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPasswordInput })
      });
      if (res.ok) {
        sessionStorage.setItem('app_authorized', 'true');
        setIsAuthorized(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        setLoginError(errData.error || '密碼錯誤，請重新輸入');
      }
    } catch (err) {
      setLoginError('與伺服器連線失敗，請檢查後端服務是否正常。');
    } finally {
      setLoginLoading(false);
    }
  };

  // Operation password state
  const [operationPassword, setOperationPassword] = useState<string | null>(null);

  // Password validation helper (Calling backend for validation)
  const checkPassword = async (actionName: string): Promise<string | null> => {
    const pwd = prompt(`進行「${actionName}」操作，請輸入密碼：`);
    if (pwd === null) return null;
    
    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        return pwd;
      }
    } catch (e) {}
    
    alert('密碼錯誤，操作已取消！');
    return null;
  };

  // Load all records on boot
  const fetchRecords = async (forceRefresh = false) => {
    setLoading(true);
    setApiError(null);
    try {
      const url = forceRefresh ? '/api/records?refresh=true' : '/api/records';
      const res = await fetch(url);
      if (!res.ok) throw new Error('無法串接後端憑證資料庫');
      const data = await res.json();
      setRecords(data.records || []);
      if (data.yuanqiVatId) {
        setYuanqiVatId(data.yuanqiVatId);
      }
    } catch (err: any) {
      console.error(err);
      setApiError('讀取記帳紀錄失敗，請檢查後端服務是否正常。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchRecords();
    }
  }, [isAuthorized]);

  // Sync Form Sales + Tax -> Total
  useEffect(() => {
    if (autoCalcTax) {
      const sales = Number(formAmountSales) || 0;
      // Taiwan VAT is standard 5%
      const calculatedTax = Math.round(sales * 0.05);
      setFormAmountTax(calculatedTax);
      setFormAmountTotal(sales + calculatedTax);
    }
  }, [formAmountSales, autoCalcTax]);

  // Adjust Sales or Tax when Total changes if Auto-Calc is active
  const handleTotalChange = (totalVal: number) => {
    setFormAmountTotal(totalVal);
    if (autoCalcTax) {
      // Back-calculate
      // sales = total / 1.05
      const calculatedSales = Math.round(totalVal / 1.05);
      const calculatedTax = totalVal - calculatedSales;
      setFormAmountSales(calculatedSales);
      setFormAmountTax(calculatedTax);
    }
  };

  // Check if a record is tax-deductible under Taiwan VAT laws
  // 1. Must carry Yuanqi Corporate VAT number (60327997)
  // 2. Tax must be > 0
  // 3. Category must NOT be "交際費" (Deductibility restriction per Tax Article 19)
  const checkIsDeductible = (record: Pick<AccountingRecord, 'buyer_tax_id' | 'amount_tax' | 'category' | 'seller_tax_id'>) => {
    const isYuanqiBuyer = record.buyer_tax_id?.trim() === yuanqiVatId;
    const hasTax = (record.amount_tax || 0) > 0;
    const isEntertaining = record.category === '交際費';
    const isForeignJourney = record.category === '旅費-國外';
    
    return isYuanqiBuyer && hasTax && !isEntertaining && !isForeignJourney;
  };

  // Get available months to dynamically render target spreadsheet sheets/tabs
  const getAvailableMonths = () => {
    const months = new Set<string>();
    records.forEach(rec => {
      if (rec.date && rec.date.length >= 7) {
        months.add(rec.date.substring(0, 7));
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // Newest months first
  };

  // Add or Edit Submission
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saveLoading) return;

    if (!formRecordedBy || !formRecordedBy.trim()) {
      alert('⚠️ 請填寫「登錄人」欄位才可儲存！');
      return;
    }

    // Verify consistency restriction: Sales + Tax = Total
    const sales = Number(formAmountSales) || 0;
    const tax = Number(formAmountTax) || 0;
    const total = Number(formAmountTotal) || 0;

    if (Math.abs(sales + tax - total) > 2) {
      alert(`⚠️ 稅率計算防呆警示：\n未稅金額 (${sales}) + 稅額 (${tax}) 應與總和 (${total}) 保持一致。請檢查後再存檔！`);
      return;
    }

    const payload: Partial<AccountingRecord> = {
      date: formDate || new Date().toISOString().split('T')[0],
      invoice_number: formInvoiceNumber,
      seller_name: formSellerName || '無名店家',
      seller_tax_id: formSellerTaxId,
      buyer_tax_id: formBuyerTaxId,
      summary: formSummary || '未填寫摘要',
      category: formCategory,
      amount_sales: sales,
      amount_tax: tax,
      amount_total: total,
      currency: formCurrency,
      notes: formNotes,
      billing_type: formBillingType,
      status: formStatus,
      approved_by: formApprovedBy,
      approved_at: formApprovedAt,
      imageUrl: formImageUrl || undefined,
      recorded_by: formRecordedBy.trim(),
    };

    setSaveLoading(true);
    try {
      if (editingRecordId) {
        // Update API
        const res = await fetch(`/api/records/${editingRecordId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'x-operation-password': operationPassword || ''
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('更新憑證紀錄失敗，密碼錯誤或權限不足');
      } else {
        // Create API
        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('新增憑證紀錄失敗');
      }

      // Refresh list
      await fetchRecords();
      resetForm();
      setShowFormModal(false);
    } catch (err: any) {
      alert(err.message || '儲存失敗，請重試');
    } finally {
      setSaveLoading(false);
    }
  };

  // Populate form with existing records for editing
  const initiateEdit = async (record: AccountingRecord) => {
    const pwd = await checkPassword('修改傳票資料');
    if (!pwd) return;
    setOperationPassword(pwd);
    setEditingRecordId(record.id);
    setFormDate(record.date);
    setFormInvoiceNumber(record.invoice_number);
    setFormSellerName(record.seller_name);
    setFormSellerTaxId(record.seller_tax_id);
    setFormBuyerTaxId(record.buyer_tax_id);
    setFormSummary(record.summary);
    setFormCategory(record.category);
    setFormAmountSales(record.amount_sales);
    setFormAmountTax(record.amount_tax);
    setFormAmountTotal(record.amount_total);
    setFormCurrency(record.currency);
    setFormNotes(record.notes || '');
    setFormBillingType(record.billing_type || '事後報帳');
    setFormStatus(record.status || '免簽核/待查閱');
    setFormApprovedBy(record.approved_by || '');
    setFormApprovedAt(record.approved_at || '');
    setFormRecordedBy(record.recorded_by || '');
    setAutoCalcTax(false); // Turn off auto-calc during edit to preserve custom inputted fields
    setFormImageUrl(record.imageUrl || null);
    setShowFormModal(true);
  };

  // Reset form helper
  const resetForm = () => {
    setEditingRecordId(null);
    setOperationPassword(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormInvoiceNumber('');
    setFormSellerName('');
    setFormSellerTaxId('');
    setFormBuyerTaxId('');
    setFormSummary('');
    setFormCategory('辦公用品');
    setFormAmountSales(0);
    setFormAmountTax(0);
    setFormAmountTotal(0);
    setFormCurrency('TWD');
    setFormNotes('');
    setFormBillingType('事後報帳');
    setFormStatus('免簽核/待查閱');
    setFormApprovedBy('');
    setFormApprovedAt('');
    setFormRecordedBy('');
    setAutoCalcTax(true);
    setUploadedImageBase64(null);
    setUploadedImageMimeType(null);
    setOcrSuccessMsg(null);
    setFormImageUrl(null);
  };

  // Triggers manual accounting record creation
  const handleOpenNewForm = () => {
    resetForm();
    setShowFormModal(true);
  };

  // Delete API Caller
  const handleDeleteRecord = async (id: string, vendor: string) => {
    const pwd = await checkPassword('刪除傳票資料');
    if (!pwd) return;
    if (!confirm(`確定要刪除該筆位於 「${vendor}」 且難以復原的會計記帳憑證與傳票嗎？`)) {
      return;
    }
    try {
      const res = await fetch(`/api/records/${id}`, { 
        method: 'DELETE',
        headers: { 'x-operation-password': pwd }
      });
      if (!res.ok) throw new Error('刪除失敗，密碼錯誤或權限不足');
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.message || '無法刪除紀錄');
    }
  };

  // Handle Drag Events for upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Process dropped/selected files
  const processUploadedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('請務必上傳圖片格式檔案 (PNG, JPG, JPEG 等)');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64Data = reader.result as string;
      const commaIdx = base64Data.indexOf(',');
      const actualBase64 = base64Data.substring(commaIdx + 1);
      
      setUploadedImageBase64(actualBase64);
      setUploadedImageMimeType(file.type);
      setOcrSuccessMsg(null);
      // Automatically run AI OCR right after upload (best UX)
      triggerOcrAnalysis(actualBase64, file.type, null);
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (ocrLoading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (ocrLoading) return;
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // OCR Service triggering Gemini API proxy
  const triggerOcrAnalysis = async (base64Img: string, mimeType: string, customInstruction: string | null) => {
    setOcrLoading(true);
    setOcrSuccessMsg(null);
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64Image: base64Img,
          mimeType: mimeType,
          description: customInstruction
        })
      });

      if (!res.ok) {
        let errMsg = 'Gemini 智能辨識連線失敗';
        try {
          const errorData = await res.json();
          errMsg = errorData.message || errorData.error || errMsg;
        } catch (e) {
          errMsg = `伺服器連線失敗 (HTTP ${res.status}): ${res.statusText || '無伺服器回應'}`;
        }
        throw new Error(errMsg);
      }

      const responseData = await res.json();
      if (responseData.success && responseData.result) {
        const parsed = responseData.result;
        
        // Feed into state
        setFormDate(parsed.date || new Date().toISOString().split('T')[0]);
        setFormInvoiceNumber(parsed.invoice_number || '');
        setFormSellerName(parsed.seller_name || '');
        setFormSellerTaxId(parsed.seller_tax_id || '');
        setFormBuyerTaxId(parsed.buyer_tax_id || '');
        setFormSummary(parsed.summary || '');
        setFormCategory((parsed.category as ExpenseCategory) || '辦公用品');
        
        const salesAmt = Number(parsed.amount_sales) || 0;
        const taxAmt = Number(parsed.amount_tax) || 0;
        const totalAmt = Number(parsed.amount_total) || 0;

        setFormAmountSales(salesAmt);
        setFormAmountTax(taxAmt);
        setFormAmountTotal(totalAmt);
        
        // Standardize Auto calculation matching
        if (salesAmt > 0 && Math.abs(salesAmt + taxAmt - totalAmt) <= 2) {
          setAutoCalcTax(false); // Keep original parsed values precisely
        } else {
          setAutoCalcTax(true); // fall back to auto
        }

        setFormCurrency(parsed.currency || 'TWD');
        setFormNotes(parsed.notes || '');
        setFormBillingType(parsed.billing_type || '事後報帳');
        setFormStatus(parsed.status || '免簽核/待查閱');
        setFormApprovedBy(parsed.approved_by || '');
        setFormApprovedAt(parsed.approved_at || '');
        setFormImageUrl(`data:${mimeType};base64,${base64Img}`); // Retain image for saving
        
        setOcrSuccessMsg('🎉 AI 雙效視覺辨識成功！請核對後方自動填單，無誤即可儲存入資料庫。');
        
        // Open form modal automatically to show results
        setShowFormModal(true);
      } else {
        throw new Error(responseData.message || '解析結果不符合預期資料格式');
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg = String(err.message || '');
      let friendlyMsg = '無法辨識該憑證，請確認照片清晰度並嘗試重新上傳。';

      if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota') || errorMsg.includes('429')) {
        friendlyMsg = 'AI 目前辨識量較大（額度已滿或請求過於頻繁），請稍候再試。';
      } else if (errorMsg.includes('overloaded') || errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('busy')) {
        friendlyMsg = 'AI 忙線中，請稍後再試。';
      } else if (errorMsg.includes('API_KEY') || errorMsg.includes('API key') || errorMsg.includes('金鑰')) {
        friendlyMsg = '系統 AI 金鑰設定失效，請聯絡系統管理員設定。';
      } else if (errorMsg.includes('413') || errorMsg.includes('large') || errorMsg.includes('limit')) {
        friendlyMsg = '上傳的圖片檔案過大，請壓縮圖片後重新嘗試。';
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('TypeError') || errorMsg.includes('連線失敗') || errorMsg.includes('502') || errorMsg.includes('504')) {
        friendlyMsg = '網路連線或伺服器異常，請檢查網路後重試。';
      } else if (errorMsg.includes('格式') || errorMsg.includes('json') || errorMsg.includes('parsed') || errorMsg.includes('Unexpected token')) {
        friendlyMsg = '解析發票憑證失敗，請嘗試手動輸入欄位內容。';
      } else if (errorMsg) {
        friendlyMsg = `${errorMsg}（請稍後再試或嘗試手動輸入）`;
      }

      alert(`⚠️ 辨識失敗：${friendlyMsg}`);
    } finally {
      setOcrLoading(false);
    }
  };

  // Fast approve / reject helper in-place for senior managers
  const handleFastApprove = async (record: AccountingRecord, actionStatus: '已核准' | '已退回' | '待簽核') => {
    const pwd = await checkPassword(`變更簽核狀態為「${actionStatus}」`);
    if (!pwd) return;
    const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const payload = {
      ...record,
      status: actionStatus,
      approved_by: actionStatus === '已核准' ? '主管張元啟' : '',
      approved_at: actionStatus === '已核准' ? formattedNow : ''
    };

    try {
      const res = await fetch(`/api/records/${record.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-operation-password': pwd
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('快速簽核處置失敗，密碼錯誤或權限不足');
      
      // Update state local first to prevent refetching delay, then sync
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...payload } : r));
    } catch (err: any) {
      alert(err.message || '主管操作失敗，請重新嘗試');
    }
  };

  // Filter logic application
  const filteredRecords = records.filter(record => {
    // Month filter
    if (selectedMonth !== 'all') {
      const recMonth = record.date ? record.date.substring(0, 7) : '';
      if (recMonth !== selectedMonth) return false;
    }

    // Category filter
    if (categoryFilter !== 'all' && record.category !== categoryFilter) {
      return false;
    }

    // Billing Type filter
    if (billingTypeFilter !== 'all' && record.billing_type !== billingTypeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && record.status !== statusFilter) {
      return false;
    }

    // Deductibility filter
    if (deductibleFilter !== 'all') {
      const isRecordDeductible = checkIsDeductible(record);
      if (deductibleFilter === 'yes' && !isRecordDeductible) return false;
      if (deductibleFilter === 'no' && isRecordDeductible) return false;
    }

    // Search Query (Invoice No, Vendor, Summary, Notes)
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchInvoice = record.invoice_number?.toLowerCase().includes(q);
      const matchSellerName = record.seller_name?.toLowerCase().includes(q);
      const matchSummary = record.summary?.toLowerCase().includes(q);
      const matchNotes = record.notes?.toLowerCase().includes(q);
      const matchCategory = record.category?.toLowerCase().includes(q);
      
      if (!matchInvoice && !matchSellerName && !matchSummary && !matchNotes && !matchCategory) {
        return false;
      }
    }

    return true;
  });

  // Calculate high-performance statistics dynamically
  const statsTotalExpense = filteredRecords.reduce((sum, r) => sum + r.amount_total, 0);
  const statsTotalSales = filteredRecords.reduce((sum, r) => sum + r.amount_sales, 0);
  const statsTotalTax = filteredRecords.reduce((sum, r) => sum + r.amount_tax, 0);

  // Total VAT eligible for refund (5% Input VAT)
  const statsDeductibleTax = filteredRecords
    .filter(checkIsDeductible)
    .reduce((sum, r) => sum + r.amount_tax, 0);

  // Categorized breakdown aggregate
  const categoryBreakdown: Record<ExpenseCategory, number> = {
    '辦公用品': 0,
    '交際費': 0,
    '旅費-國內': 0,
    '旅費-國外': 0,
    '修繕費': 0,
    '水電郵電費': 0,
    '雜項購置': 0,
    '國際貿易費用': 0,
    '其他支出': 0
  };

  filteredRecords.forEach(r => {
    if (categoryBreakdown[r.category] !== undefined) {
      categoryBreakdown[r.category] += r.amount_total;
    } else {
      categoryBreakdown['其他支出'] += r.amount_total;
    }
  });

  // Export to CSV helper
  const handleExportCSV = async () => {
    if (filteredRecords.length === 0) {
      alert('無任何資料可供匯出');
      return;
    }
    const pwd = await checkPassword('匯出 CSV 資料');
    if (!pwd) return;

    // UTF-8 with BOM for Excel compatibility
    let csvContent = "\uFEFF";
    csvContent += "消費日期,帳務類型,憑證/發票號碼,簽核狀態,核准主管,核准時間,賣方商號名稱,賣方統一編號,買方統一編號,品名摘要,會計科目分類,銷售金額(未稅),稅額,總金額(含稅),幣別,營業稅扣抵資格,備註說明,建檔時間\n";

    filteredRecords.forEach(r => {
      const isEligible = checkIsDeductible(r) ? '可扣抵外加5%' : '不予扣抵';
      const cleanSummary = (r.summary || '').replace(/"/g, '""');
      const cleanSeller = (r.seller_name || '').replace(/"/g, '""');
      const cleanNotes = (r.notes || '').replace(/"/g, '""');
      
      csvContent += `"${r.date}","${r.billing_type || '事後報帳'}","${r.invoice_number || ''}","${r.status || '免簽核/待查閱'}","${r.approved_by || ''}","${r.approved_at || ''}","${cleanSeller}","${r.seller_tax_id || ''}","${r.buyer_tax_id || ''}","${cleanSummary}","${r.category}",${r.amount_sales},${r.amount_tax},${r.amount_total},"${r.currency}","${isEligible}","${cleanNotes}","${r.createdAt || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const fileSuffix = selectedMonth === 'all' ? '全部年度份' : selectedMonth;
    link.setAttribute("download", `元啟實業有限公司_會計傳票明細_${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthorized) {
    return (
      <div className={`min-h-screen flex items-center justify-center font-sans antialiased transition-all duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-300 text-slate-650 hover:bg-slate-100 shadow-sm'
            }`}
          >
            {isDark ? '☀️ 淺色模式' : '🌙 深色模式'}
          </button>
        </div>
        
        <div className={`max-w-md w-full p-8 rounded-3xl border shadow-2xl backdrop-blur-md transition-all ${
          isDark ? 'bg-slate-900/60 border-slate-800/80 shadow-black/40' : 'bg-white border-slate-200 shadow-slate-200/80'
        }`}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-cyan-500 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-cyan-500/20">
              元
            </div>
            <div>
              <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>元啟實業有限公司</h2>
              <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500 font-medium'}`}>
                🗃️ 企業智慧型記帳與單據辨識系統
              </p>
            </div>
          </div>
          
          <form onSubmit={handleLoginSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold block ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                🔒 請輸入系統登入密碼：
              </label>
              <input
                type="password"
                required
                value={loginPasswordInput}
                onChange={(e) => setLoginPasswordInput(e.target.value)}
                placeholder="輸入登入密碼..."
                className={`w-full rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors border font-semibold ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-700' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm'
                }`}
              />
            </div>
            
            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold text-center">
                ⚠️ {loginError}
              </div>
            )}
            
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:bg-cyan-700 text-slate-950 py-3 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/10 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
            >
              {loginLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                '驗證密碼並進入系統 🚀'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans antialiased transition-all duration-200 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {/* Top Professional Corporate Banner */}
      <nav className={`border-b shadow-xl py-4 sticky top-0 z-40 px-4 lg:px-8 transition-all ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
              元
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>元啟實業有限公司</h1>
                <span className={`text-[10px] font-mono tracking-widest px-2 py-0.5 rounded border transition-all ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'}`}>
                  會計審計系統
                </span>
              </div>
              <p className={`text-xs transition-all ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>登載買受人統一編號：<span className="font-mono text-cyan-600 font-semibold">{yuanqiVatId}</span> | 智慧記帳與營業稅扣抵系統</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Theme switcher toggle button */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-1.5 px-3 rounded-lg border transition-all flex items-center gap-1.5 font-bold cursor-pointer hover:scale-[1.02] ${
                isDark 
                  ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800' 
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 shadow-sm'
              }`}
              title="切換深淺色風格"
            >
              {isDark ? '☀️ 淺色模式' : '🌙 深色模式'}
            </button>

            <div className={`border rounded px-3 py-1.5 flex items-center gap-2 transition-all ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-750'}`}>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              系統環境：
              <span className={`font-semibold transition-all ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Cloud Node Sandbox</span>
            </div>
            
            <button
              onClick={handleOpenNewForm}
              className="bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 px-4 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/10 cursor-pointer hover:scale-[1.02]"
            >
              <PlusCircle className="h-4 w-4" />
              <span>手動登錄傳票</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container Layout */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">

        {/* Dynamic Navigation Tabs between Auditing and Approval Workflow */}
        <div className={`flex border-b gap-1 pb-px select-none transition-all ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <button
            onClick={() => setActiveView('records')}
            className={`px-5 py-3 text-xs md:text-sm font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeView === 'records'
                ? isDark ? 'border-cyan-500 text-cyan-400 bg-cyan-950/10' : 'border-cyan-600 text-cyan-600 bg-cyan-50/50'
                : isDark ? 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 rounded-t-xl' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 rounded-t-xl'
            }`}
          >
            📊 雙向帳務審計與視覺辨識
          </button>
          <button
            onClick={() => {
              setActiveView('approval');
              // Automatically select the first pending record if available
              const pending = records.filter(r => r.status === '待簽核');
              if (pending.length > 0 && !selectedApprovalRecordId) {
                setSelectedApprovalRecordId(pending[0].id);
              } else if (records.length > 0 && !selectedApprovalRecordId) {
                setSelectedApprovalRecordId(records[0].id);
              }
            }}
            className={`px-5 py-3 text-xs md:text-sm font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeView === 'approval'
                ? isDark ? 'border-cyan-500 text-cyan-400 bg-cyan-950/10' : 'border-cyan-600 text-cyan-600 bg-cyan-50/50'
                : isDark ? 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 rounded-t-xl' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 rounded-t-xl'
            }`}
          >
            ⚖️ 傳票收支簽核管理中心
            {records.filter(r => r.status === '待簽核').length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500 text-slate-950 rounded-full font-black animate-pulse">
                {records.filter(r => r.status === '待簽核').length}
              </span>
            )}
          </button>
        </div>

        {activeView === 'records' && (
          <>
            {/* Top Split Area: OCR Drag Zone */}
            <div className="w-full">
              
              {/* Active Drop Upload Area */}
              <div className={`w-full flex flex-col justify-between rounded-3xl p-6 backdrop-blur transition-all ${isDark ? 'bg-slate-950/40 border border-slate-800/80 shadow-md shadow-black/20' : 'bg-white border border-slate-200 shadow-sm'}`}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-cyan-500/10 text-cyan-400">
                        <UploadCloud className="h-4 w-4" />
                      </div>
                      <h3 className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>實體驗證：上傳發票 / 憑證照片</h3>
                    </div>
                    <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>支援 JPG / PNG / WEBP 及最大 15MB</span>
                  </div>

                  {/* Upload Drag Area Container */}
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl py-10 px-6 text-center transition-all flex flex-col items-center justify-center gap-4 select-none ${
                      dragActive 
                        ? 'border-cyan-400 bg-cyan-950/20' 
                        : isDark ? 'border-slate-800 bg-slate-900/40 hover:border-slate-700/80 hover:bg-slate-900/60' : 'border-slate-300 bg-slate-50/50 hover:border-slate-400/80 hover:bg-slate-100/60'
                    }`}
                  >
                    {ocrLoading ? (
                      <div className="py-4 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
                        <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          AI 正在解碼影像辨識中...
                        </p>
                        <p className="text-xs text-slate-500">
                          這可能需要數秒，正在符合台灣進項扣抵與外銷零稅率稽核
                        </p>
                      </div>
                    ) : (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleFileChange}
                        />
                        <input
                          ref={cameraInputRef}
                          type="file"
                          className="hidden"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileChange}
                        />
                        <div className="flex flex-col items-center gap-3">
                          <p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            拖曳憑證相片至此，或點選下方按鈕上傳：
                          </p>
                          <div className="flex flex-wrap justify-center gap-3 mt-1">
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              className="bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/10 cursor-pointer hover:scale-[1.02]"
                            >
                              📸 拍照上傳憑證
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 border cursor-pointer hover:scale-[1.02] ${
                                isDark 
                                  ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200' 
                                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
                              }`}
                            >
                              📁 選擇相簿相片
                            </button>
                          </div>
                          <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-405' : 'text-slate-600'}`}>精準擷取台灣三聯式發票、免稅收據、國外 Commercial Invoice</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
  
                {/* Quick explanation tag */}
                <div className={`mt-4 pt-4 border-t text-xs flex items-center gap-2 transition-all ${isDark ? 'border-slate-800/60 text-slate-400' : 'border-slate-150 text-slate-600'}`}>
                  <span className={`font-semibold ${isDark ? 'text-slate-550' : 'text-slate-505'}`}>最新 AI 解析狀態:</span>
                  <span>{ocrSuccessMsg || '尚未上傳或擷取任何憑證檔案。'}</span>
                </div>
              </div>

            </div>

        {/* Dynamic Accounting Analytic Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className={`p-5 rounded-3xl relative overflow-hidden border transition-all ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm shadow-slate-100/40'}`}>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>當期總憑證支出 (含稅)</p>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-[13px] font-mono ${isDark ? 'text-slate-505' : 'text-slate-700 font-bold'}`}>TWD</span>
              <span className={`text-3xl font-black tracking-tight font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
                {statsTotalExpense.toLocaleString()}
              </span>
            </div>
            <div className={`mt-3 flex items-center justify-between text-[11px] border-t pt-2.5 ${isDark ? 'text-slate-500 border-slate-800/80' : 'text-slate-800 border-slate-200 font-bold'}`}>
              <span>未稅：NT$ {statsTotalSales.toLocaleString()}</span>
              <span>憑證數：{filteredRecords.length} 筆</span>
            </div>
            <div className={`absolute right-3 top-3 p-1.5 rounded-lg ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
              <DollarSign className="h-4 w-4" />
            </div>
          </div>

          <div className={`p-5 rounded-3xl relative overflow-hidden border transition-all ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm shadow-slate-100/40'}`}>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>可申報可扣抵 5% 進項稅額</p>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-[13px] font-mono ${isDark ? 'text-emerald-500' : 'text-emerald-800 font-bold'}`}>TWD</span>
              <span className={`text-3xl font-black tracking-tight font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                {statsDeductibleTax.toLocaleString()}
              </span>
            </div>
            <div className={`mt-3 flex items-center justify-between text-[11px] border-t pt-2.5 ${isDark ? 'text-slate-500 border-slate-800/80' : 'text-slate-800 border-slate-200 font-bold'}`}>
              <span className={`${isDark ? 'text-emerald-500/80' : 'text-emerald-700'} font-medium`}>★ 可全額扣抵營業稅</span>
              <span>符合扣抵：{filteredRecords.filter(checkIsDeductible).length} 筆</span>
            </div>
            <div className={`absolute right-3 top-3 p-1.5 rounded-lg border ${isDark ? 'bg-emerald-950 text-emerald-400 border-emerald-900/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>

          <div className={`p-5 rounded-3xl relative overflow-hidden border transition-all ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm shadow-slate-100/40'}`}>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>不予扣抵 / 限制扣抵稅費額</p>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-[13px] font-mono ${isDark ? 'text-amber-500' : 'text-amber-800 font-bold'}`}>TWD</span>
              <span className={`text-3xl font-black tracking-tight font-mono ${isDark ? 'text-amber-500' : 'text-amber-700'}`}>
                {(statsTotalTax - statsDeductibleTax).toLocaleString()}
              </span>
            </div>
            <div className={`mt-3 flex items-center justify-between text-[11px] border-t pt-2.5 ${isDark ? 'text-slate-500 border-slate-800/80' : 'text-slate-800 border-slate-200 font-bold'}`}>
              <span>無統編/非營業用/交際費</span>
              <span className={`${isDark ? 'text-amber-500' : 'text-amber-700'} font-mono`}>100% 入所得稅帳</span>
            </div>
            <div className={`absolute right-3 top-3 p-1.5 rounded-lg border ${isDark ? 'bg-amber-950 text-amber-500 border-amber-900/30' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>

          <div className={`p-5 rounded-3xl relative overflow-hidden border flex flex-col justify-between transition-all ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm shadow-slate-100/40'}`}>
            <div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>當期申報季折稅成效</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-xs border px-2 py-0.5 rounded font-bold ${isDark ? 'bg-cyan-955 text-cyan-400 border-cyan-900' : 'bg-cyan-50 text-cyan-800 border-cyan-200'}`}>
                  營業稅減免
                </span>
                <span className={`text-sm font-semibold font-mono ${isDark ? 'text-cyan-300' : 'text-cyan-800'}`}>
                  {statsTotalExpense > 0 
                    ? `${((statsDeductibleTax / statsTotalExpense) * 100).toFixed(1)}%` 
                    : '0%'}
                </span>
              </div>
            </div>
            <div className={`text-[10px] border-t pt-2.5 mt-3 ${isDark ? 'text-slate-505 border-slate-800/80' : 'text-slate-800 border-slate-200 font-bold'}`}>
              會計公式：(可抵扣稅額 / 總支出)*100%
            </div>
            <div className={`absolute right-3 top-3 p-1.5 rounded-lg border ${isDark ? 'bg-cyan-950 text-cyan-400 border-cyan-900/30' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
              <Calculator className="h-4 w-4" />
            </div>
          </div>

        </div>

        {/* Categories visual chart breakdown */}
        <div className={`p-6 rounded-3xl space-y-4 transition-all border ${isDark ? 'bg-slate-950/40 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <h4 className={`text-sm font-semibold transition-colors ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>會計科目當期支出占比分析</h4>
            <span className="text-xs text-slate-500">以總額 (含稅) 統計比例</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(categoryBreakdown).map(([cat, val]) => {
              const percentage = statsTotalExpense > 0 ? (val / statsTotalExpense) * 100 : 0;
              if (val === 0) return null; // Hide empty categories to save clutter

              return (
                <div key={cat} className={`p-3 rounded-xl space-y-1.5 border transition-all ${isDark ? 'bg-slate-900/80 border-slate-850' : 'bg-slate-50 border-slate-200 shadow-sm shadow-slate-100/50'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium transition-colors ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{cat}</span>
                    <span className={`font-semibold font-mono transition-colors ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      $ {val.toLocaleString()} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  
                  {/* Custom animated progress bar */}
                  <div className={`w-full rounded-full h-1.5 overflow-hidden transition-all ${isDark ? 'bg-slate-950' : 'bg-slate-200'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cat === '交際費' ? 'bg-amber-500' :
                        cat === '旅費-國內' ? 'bg-indigo-400' :
                        cat === '旅費-國外' ? 'bg-sky-400' :
                        cat === '辦公用品' ? 'bg-emerald-400' :
                        cat === '水電郵電費' ? 'bg-teal-400' :
                        cat === '修繕費' ? 'bg-orange-400' :
                        'bg-slate-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            
            {/* Show message if no expenses */}
            {statsTotalExpense === 0 && (
              <div className="col-span-full py-4 text-center text-xs text-slate-500">
                暫無分類支出統計。請先手動開立或上傳發票憑證。
              </div>
            )}
          </div>
        </div>

        {/* Core Records Ledger Section */}
        <div className={`rounded-3xl overflow-hidden backdrop-blur flex flex-col transition-all border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm shadow-slate-100'}`}>
          
          {/* Spreadsheet Monthly Page Sheet Controller Selector */}
          <div className={`border-b px-4 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 gap-y-2 transition-all ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-150'}`}>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span className={`text-xs font-semibold transition-all ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>月份對帳傳票分頁簿 (Sheets)：</span>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => fetchRecords(true)}
                disabled={loading}
                className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isDark 
                    ? 'bg-slate-900 hover:bg-slate-800 border border-slate-850 text-cyan-400 hover:text-cyan-300' 
                    : 'bg-white hover:bg-slate-100 border border-slate-200 text-cyan-750 hover:text-cyan-800 shadow-sm'
                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="強制從雲端 Google Sheets 獲取最新對帳資料"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                <span>同步更新</span>
              </button>

              <button
                onClick={() => setSelectedMonth('all')}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                  selectedMonth === 'all' 
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/10' 
                    : isDark ? 'bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200' : 'bg-slate-100 border border-slate-200 text-slate-800 hover:bg-slate-200 font-medium'
                }`}
              >
                全部月份對帳總表
              </button>
              {getAvailableMonths().map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1 text-xs rounded-lg font-mono transition-all cursor-pointer ${
                    selectedMonth === m 
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/10' 
                      : isDark ? 'bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200' : 'bg-slate-100 border border-slate-200 text-slate-850 hover:bg-slate-200 font-medium'
                  }`}
                >
                  📄 {m} 分頁
                </button>
              ))}
            </div>
          </div>

          {/* Filtering Controller Belt */}
          <div className={`p-4 md:p-6 border-b space-y-4 transition-all ${isDark ? 'border-slate-850 bg-slate-900/30' : 'border-slate-150 bg-slate-50/20'}`}>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Search inputs */}
              <div className="md:col-span-10 relative">
                <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋發票號碼、店家名稱、摘要或備註..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full border rounded-xl py-2 pl-9 pr-4 text-xs transition-colors focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-600' : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400 shadow-inner'}`}
                />
              </div>

              {/* Export actions */}
              <div className="md:col-span-2">
                <button
                  onClick={handleExportCSV}
                  className={`w-full border px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-slate-200 text-slate-800 shadow-sm'}`}
                  title="匯出符合當前篩選條件之 CSV 檔案"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                  <span>匯出試算表</span>
                </button>
              </div>
            </div>

            {/* Accounting Category Interactive Flat Badge Selector (ZERO HORIZONTAL SCROLLBAR BY FLUID WRAPPING) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold select-none text-slate-500">
                <span>📁 台灣企業級會計科目快速過濾 (橫向無卷軸設計)：</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    categoryFilter === 'all'
                      ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                      : isDark ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 border border-slate-200 text-slate-800 hover:bg-slate-200 font-semibold'
                  }`}
                >
                  🌐 顯示全部會計科目
                </button>
                {[
                  { id: '辦公用品', label: '📁 辦公用品', color: 'cyan' },
                  { id: '交際費', label: '🤝 交際費', color: 'amber' },
                  { id: '旅費-國內', label: '🚗 旅費-國內', color: 'indigo' },
                  { id: '旅費-國外', label: '✈️ 旅費-國外', color: 'sky' },
                  { id: '修繕費', label: '🔧 修繕費', color: 'orange' },
                  { id: '水電郵電費', label: '⚡ 水電郵電費', color: 'teal' },
                  { id: '雜項購置', label: '📦 雜項購置', color: 'emerald' },
                  { id: '國際貿易費用', label: '🚢 國際貿易費用', color: 'purple' },
                  { id: '其他支出', label: '📎 其他支出', color: 'rose' }
                ].map((item) => {
                  const isActive = categoryFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCategoryFilter(item.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1 cursor-pointer ${
                        isActive
                          ? item.color === 'cyan' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-bold shadow' :
                            item.color === 'amber' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50 font-bold shadow' :
                            item.color === 'indigo' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 font-bold shadow' :
                            item.color === 'sky' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50 font-bold shadow' :
                            item.color === 'orange' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50 font-bold shadow' :
                            item.color === 'teal' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50 font-bold shadow' :
                            item.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold shadow' :
                            item.color === 'purple' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50 font-bold shadow' :
                            'bg-rose-500/20 text-rose-455 border border-rose-500/50 font-bold shadow'
                          : isDark ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 border border-slate-200 text-slate-800 hover:bg-slate-150 font-semibold'
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Tax qualification deduction dropdown */}
              <div className="flex items-center gap-2">
                <span className={`text-[11px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>扣抵資格：</span>
                <select
                  value={deductibleFilter}
                  onChange={(e) => setDeductibleFilter(e.target.value)}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer transition-colors ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 shadow-sm font-semibold'}`}
                >
                  <option value="all">扣抵資格 (不限)</option>
                  <option value="yes">✅ 符資格 (可扣抵營業稅)</option>
                  <option value="no">❌ 不相符 (無統編 / 交際或免稅)</option>
                </select>
              </div>

              {/* Billing Type Filter */}
              <div className="flex items-center gap-2">
                <span className={`text-[11px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>帳務類型：</span>
                <select
                  value={billingTypeFilter}
                  onChange={(e) => setBillingTypeFilter(e.target.value)}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer transition-colors ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 shadow-sm font-semibold'}`}
                >
                  <option value="all">所有帳務類型 (不限)</option>
                  <option value="事前請款">📋 事前請款 (尚未支出)</option>
                  <option value="事後報帳">💰 事後報帳 (代墊/已支出)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className={`text-[11px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>簽核狀態：</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer transition-colors ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-900 shadow-sm font-semibold'}`}
                >
                  <option value="all">所有簽核狀態 (不限)</option>
                  <option value="免簽核/待查閱">⚪ 免簽核/待查閱</option>
                  <option value="待簽核">🟡 待簽核</option>
                  <option value="已核准">🟢 已核准</option>
                  <option value="已退回">🔴 已退回</option>
                </select>
              </div>
            </div>

          </div>

          {/* Actual Ledger Data Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
                <p className="text-xs text-slate-400">正在加載憑證與會計傳票...</p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center text-slate-500 space-y-2 flex flex-col items-center justify-center">
                <Clock className="h-8 w-8 text-slate-700" />
                <p className="text-sm font-semibold">無相符的會計交易憑證紀錄</p>
                <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                  沒有尋找到符合當前月份、搜尋內容、或篩選科目條件的單據。請調整搜尋條件或新建傳票。
                </p>
              </div>
            ) : (
              <>
              <table className={`w-full border-collapse text-left text-xs transition-colors hidden md:table ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider font-bold select-none transition-all ${isDark ? 'border-slate-800 bg-slate-950/80 text-slate-400' : 'border-slate-300 bg-slate-100 text-slate-850'}`}>
                    <th className="py-3.5 px-4 font-semibold text-center select-none">扣抵</th>
                    <th className="py-3.5 px-3 font-semibold">消費日期</th>
                    <th className="py-3.5 px-3 font-semibold">帳務類型</th>
                    <th className="py-3.5 px-3 font-semibold">發票/憑證編號</th>
                    <th className="py-3.5 px-3 font-semibold">簽核狀態</th>
                    <th className="py-3.5 px-3 font-semibold">登錄人</th>
                    <th className="py-3.5 px-4 font-semibold">賣方商號 / 統編</th>
                    <th className="py-3.5 px-4 font-semibold">品名摘要說明</th>
                    <th className="py-3.5 px-4 font-semibold">會計科目</th>
                    <th className="py-3.5 px-4 font-semibold text-right">銷售額(未稅)</th>
                    <th className="py-3.5 px-4 font-semibold text-right">稅額</th>
                    <th className="py-3.5 px-4 font-semibold text-right">總金額(含稅)</th>
                    <th className="py-3.5 px-4 font-semibold text-center">操作</th>
                  </tr>
                </thead>
                <tbody className={`divide-y transition-all ${isDark ? 'divide-slate-850/60 bg-slate-900/10' : 'divide-slate-200 bg-white'}`}>
                  {filteredRecords.map((rec) => {
                    const isDeductible = checkIsDeductible(rec);

                    return (
                      <tr key={rec.id} className={`transition-colors group ${isDark ? 'hover:bg-slate-850/40 text-slate-300' : 'hover:bg-slate-50 text-slate-900 border-slate-200'}`}>
                        
                        {/* Deductibility Badge */}
                        <td className="py-3.5 px-4 text-center font-mono">
                          {isDeductible ? (
                            <span
                              className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-250 shadow-sm'}`}
                              title={`可扣抵額: NT$ ${rec.amount_tax} (買方統編: ${rec.buyer_tax_id})`}
                            >
                              <Check className="h-3 w-3 inline" />
                              <span>可扣抵</span>
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? 'bg-slate-800 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-700 border-slate-250 shadow-sm'}`}
                              title={
                                !rec.buyer_tax_id 
                                  ? '其未載明買方統編，不符營業稅法規定' 
                                  : rec.category === '交際費' 
                                  ? '交際費依法不得扣抵營業稅' 
                                  : rec.amount_tax === 0 
                                  ? '免稅或無稅額單據' 
                                  : '未符扣抵規定'
                              }
                            >
                              <span>不扣抵</span>
                            </span>
                          )}
                        </td>

                        {/* Date */}
                        <td className={`py-3.5 px-3 font-mono font-medium select-all whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-900 font-bold'}`}>
                          {rec.date}
                        </td>

                        {/* Billing Type badge */}
                        <td className="py-3.5 px-3">
                          {rec.billing_type === '事前請款' ? (
                            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-955 text-indigo-300 border border-indigo-900/40 whitespace-nowrap" title="尚未出款支出，屬於前置請款預案">
                              📝 事前請款
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-955 text-emerald-300 border border-emerald-900/40 whitespace-nowrap" title="已代墊或完成之報銷/支出憑證">
                              💰 事後報帳
                            </span>
                          )}
                        </td>

                        {/* Invoice Number */}
                        <td className={`py-3.5 px-3 font-mono font-semibold uppercase tracking-wide select-all whitespace-nowrap ${isDark ? 'text-cyan-400' : 'text-cyan-800 font-bold'}`}>
                          <div className="flex items-center gap-1.5">
                            <span>
                              {rec.invoice_number || (
                                <span className={`${isDark ? 'text-slate-600' : 'text-slate-405'} italic`}>（非發票憑證）</span>
                              )}
                            </span>
                            {rec.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setSelectedFullscreenImage(rec.imageUrl || null)}
                                className={`text-[10px] scale-90 px-1 py-0.2 rounded transition-all flex items-center gap-0.5 cursor-pointer font-bold ${
                                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700' : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200'
                                }`}
                                title="此傳票附有憑證影像，點擊直接查看"
                              >
                                📎 照片
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Approval Status and actions badge */}
                        <td className="py-3.5 px-3 min-w-[120px]">
                          <div className="space-y-1">
                            {rec.status === '待簽核' ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-955 text-amber-400 border border-amber-800">
                                  🟡 待簽核
                                </span>
                                {/* Fast action for manager */}
                                <div className="flex gap-1 select-none">
                                  <button
                                    onClick={() => handleFastApprove(rec, '已核准')}
                                    className="text-[9px] bg-emerald-950 hover:bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800 cursor-pointer transition-colors"
                                    title="一秒點擊核准傳票"
                                  >
                                    核准
                                  </button>
                                  <button
                                    onClick={() => handleFastApprove(rec, '已退回')}
                                    className="text-[9px] bg-rose-955 hover:bg-rose-900 text-rose-305 px-1.5 py-0.5 rounded border border-rose-800 cursor-pointer transition-colors"
                                    title="一秒點擊退回傳票"
                                  >
                                    退回
                                  </button>
                                </div>
                              </div>
                            ) : rec.status === '已核准' ? (
                              <div className="flex flex-col">
                                <span 
                                  className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-905 text-emerald-300 border border-emerald-900/30 cursor-help"
                                  title={`核准人: ${rec.approved_by || '主管張元啟'} (${rec.approved_at || ''})`}
                                >
                                  🟢 已核准
                                </span>
                                {rec.approved_by && (
                                  <span className={`text-[9px] scale-90 -ml-1 whitespace-nowrap font-bold ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>
                                    👤 {rec.approved_by}
                                  </span>
                                )}
                              </div>
                            ) : rec.status === '已退回' ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-955 text-rose-300 border border-rose-900">
                                  🔴 已退回
                                </span>
                                <button
                                  onClick={() => handleFastApprove(rec, '待簽核')}
                                  className="text-[9px] bg-slate-800 hover:bg-slate-705 text-slate-305 px-1 py-0.5 rounded cursor-pointer"
                                  title="重新送審狀態"
                                >
                                  重審
                                </button>
                              </div>
                            ) : (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300 font-bold'}`}>
                                ⚪ 免簽核/待查閱
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Recorded By */}
                        <td className={`py-3.5 px-3 font-semibold whitespace-nowrap ${isDark ? 'text-slate-350' : 'text-slate-750'}`}>
                          {rec.recorded_by || <span className="text-slate-500 italic">—</span>}
                        </td>

                        {/* Seller Name / Tax ID */}
                        <td className="py-3.5 px-4 font-medium select-all">
                          <div className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            {rec.seller_name || '—'}
                          </div>
                          {rec.seller_tax_id && (
                            <div className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-505'}`}>
                              統編: {rec.seller_tax_id}
                            </div>
                          )}
                        </td>

                        {/* Summary */}
                        <td className={`py-3.5 px-4 max-w-[180px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`} title={rec.summary}>
                          {rec.summary}
                        </td>

                        {/* Category badge */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isDark 
                              ? rec.category === '辦公用品' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-900/50' :
                                rec.category === '交際費' ? 'bg-amber-900/30 text-amber-300 border border-amber-900/50' :
                                rec.category === '旅費-國內' ? 'bg-indigo-900/30 text-indigo-300 border border-indigo-900/50' :
                                rec.category === '旅費-國外' ? 'bg-sky-900/30 text-sky-300 border border-sky-900/50' :
                                rec.category === '修繕費' ? 'bg-orange-95/40 text-orange-400 border border-orange-900/40' :
                                rec.category === '水電郵電費' ? 'bg-teal-955 text-teal-300 border border-teal-900/50' :
                                rec.category === '雜項購置' ? 'bg-purple-955 text-purple-300 border border-purple-905' :
                                rec.category === '國際貿易費用' ? 'bg-pink-955 text-pink-300 border border-pink-905' :
                                'bg-slate-800 text-slate-400 border border-slate-700/50'
                              : rec.category === '辦公用品' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                rec.category === '交際費' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                rec.category === '旅費-國內' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                rec.category === '旅費-國外' ? 'bg-sky-50 text-sky-800 border border-sky-200' :
                                rec.category === '修繕費' ? 'bg-orange-50 text-orange-850 border border-orange-200' :
                                rec.category === '水電郵電費' ? 'bg-teal-50 text-teal-850 border border-teal-200' :
                                rec.category === '雜項購置' ? 'bg-purple-50 text-purple-850 border border-purple-200' :
                                rec.category === '國際貿易費用' ? 'bg-pink-50 text-pink-850 border border-pink-200' :
                                'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}>
                            {rec.category}
                          </span>
                        </td>

                        {/* Pricing columns */}
                        <td className={`py-3.5 px-4 text-right font-mono font-bold select-all ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>
                          {rec.amount_sales.toLocaleString()}
                        </td>

                        <td className={`py-3.5 px-4 text-right font-mono font-medium select-all ${isDark ? 'text-slate-400' : 'text-slate-705'}`}>
                          {rec.amount_tax > 0 ? rec.amount_tax.toLocaleString() : '-'}
                        </td>

                        <td className={`py-3.5 px-4 text-right font-mono font-black select-all ${isDark ? 'text-white' : 'text-slate-950 font-bold'}`}>
                          {rec.amount_total.toLocaleString()}
                          <span className={`text-[9px] font-normal ml-1 ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>{rec.currency}</span>
                        </td>

                        {/* Inline Actions */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {rec.imageUrl && (
                              <button
                                onClick={() => setSelectedFullscreenImage(rec.imageUrl || null)}
                                className={`p-1 px-1.5 rounded transition-colors cursor-pointer ${isDark ? 'bg-cyan-955 hover:bg-cyan-900 text-cyan-404 hover:text-white border border-cyan-900/60' : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-705 border border-cyan-200 shadow-sm'}`}
                                title="查閱留存的照片/發票憑證"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => initiateEdit(rec)}
                              className={`p-1 px-1.5 rounded transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-250 shadow-sm'}`}
                              title="編立、校對此筆記帳傳票"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(rec.id, rec.seller_name)}
                              className={`p-1 px-1.5 rounded transition-colors cursor-pointer ${isDark ? 'bg-red-955 hover:bg-red-900/80 text-red-400 hover:text-red-200' : 'bg-red-50 hover:bg-red-100 text-red-755 border border-red-205 shadow-sm'}`}
                              title="作廢、撤銷此筆傳票"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile view: Card List */}
              <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
                {filteredRecords.map((rec) => {
                  const isDeductible = checkIsDeductible(rec);
                  return (
                    <div 
                      key={rec.id}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isDark 
                          ? 'bg-slate-900/85 border-slate-800 text-slate-200' 
                          : 'bg-white border-slate-200 text-slate-800 shadow-sm shadow-slate-100'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-mono text-xs text-slate-505 font-semibold">{rec.date}</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {isDeductible ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-250 shadow-sm'}`}>
                              可扣抵
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isDark ? 'bg-slate-800 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-700 border-slate-250 shadow-sm'}`}>
                              不扣抵
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            {rec.category}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="font-bold text-sm leading-snug">{rec.seller_name || '—'}</div>
                        {rec.seller_tax_id && (
                          <div className="text-[10px] font-mono text-slate-500">統編: {rec.seller_tax_id}</div>
                        )}
                        <div className="text-xs text-slate-500 font-medium">摘要: {rec.summary}</div>
                      </div>

                      <div className={`flex justify-between items-baseline border-t border-b py-2 ${isDark ? 'border-slate-800/60' : 'border-slate-150'}`}>
                        <div className="text-[10px] text-slate-550 font-semibold">
                          {rec.billing_type} • {rec.status}
                          {rec.recorded_by && ` • 登錄: ${rec.recorded_by}`}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono mr-1 text-slate-500">{rec.currency}</span>
                          <span className="font-mono font-black text-base">{rec.amount_total.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          {rec.imageUrl && (
                            <button
                              onClick={() => setSelectedFullscreenImage(rec.imageUrl || null)}
                              className={`p-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                                isDark ? 'bg-cyan-955 hover:bg-cyan-900 text-cyan-400 hover:text-white border border-cyan-900/60' : 'bg-cyan-50 text-cyan-705 border border-cyan-200'
                              }`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>憑證</span>
                            </button>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => initiateEdit(rec)}
                            className={`p-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                              isDark ? 'bg-slate-800 text-slate-205 border border-slate-700' : 'bg-slate-105 text-slate-800 border border-slate-250 shadow-sm'
                            }`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>修改</span>
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(rec.id, rec.seller_name)}
                            className={`p-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                              isDark ? 'bg-red-955 text-red-400 border border-red-900/60' : 'bg-red-50 text-red-755 border border-red-200 shadow-sm'
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>刪除</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>

          {/* Table summary bar */}
          <div className={`p-4 border-t flex flex-col md:flex-row items-center justify-between text-xs transition-all ${isDark ? 'bg-slate-950 border-slate-850 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 font-semibold'}`}>
            <div>
              💡 <span className={isDark ? 'text-slate-300' : 'text-slate-900 font-bold'}>台灣所得稅申報法條提示：</span>此分頁表已針對民國年與西元年進行無縫對應。請確保年底對接查帳時，各單據「不予扣抵」者之進項稅額亦需計入當期交易科目費用。
            </div>
            <div className={`mt-2 md:mt-0 font-medium select-none ${isDark ? '' : 'text-slate-700'}`}>
              顯現單據：{filteredRecords.length} 筆 | 篩選後交易總額：<span className={`font-mono font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-600 font-black'}`}>NT$ {statsTotalExpense.toLocaleString()}</span>
            </div>
          </div>

        </div>
        </>
        )}

        {/* ========================================== */}
        {/* APPROVAL WORKFLOW SECTION (INDEPENDENT CO-PAGE) */}
        {/* ========================================== */}
        {activeView === 'approval' && (
          <div className="space-y-6">
            
            {/* Top Approval Banner & Approver Form Config */}
            <div className={`p-6 rounded-2xl backdrop-blur flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all border ${isDark ? 'bg-slate-950/40 border-slate-800/80 text-white' : 'bg-white border-slate-200 shadow-sm text-slate-900'}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-500/10 text-amber-600 border border-amber-200'}`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <h2 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900 font-black'}`}>⚖️ 財務聯署與簽核中心</h2>
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-650 font-semibold'}`}>
                  可在此進行「事前採購請款（預算編定）」與「事後代墊報銷」的線上審批，審准資料將自動落款並存入系統資料庫。
                </p>
              </div>
              
              {/* Approver Identity Input Box */}
              <div className={`p-3 rounded-xl flex items-center gap-3 shrink-0 border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`text-[11px] font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>✍️ 執行主管簽章：</span>
                <input
                  type="text"
                  value={currentApproverName}
                  onChange={(e) => setCurrentApproverName(e.target.value)}
                  placeholder="輸入簽署人職稱與姓名..."
                  className={`rounded-lg py-1 px-3 text-xs font-semibold focus:outline-none focus:border-cyan-500 transition-colors w-40 border ${isDark ? 'bg-slate-950 border-slate-750 hover:border-slate-700 text-white' : 'bg-white border-slate-300 hover:border-slate-400 text-slate-900'}`}
                />
              </div>
            </div>

            {/* Workflow stats indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className={`p-5 rounded-2xl relative overflow-hidden transition-all border ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>⏳ 待審批傳票總額 (含稅)</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>TWD</span>
                  <span className={`text-2xl font-black font-mono ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    {records
                      .filter(r => r.status === '待簽核')
                      .reduce((sum, r) => sum + r.amount_total, 0)
                      .toLocaleString()}
                  </span>
                </div>
                <p className={`text-[10px] mt-2 border-t pt-2 flex justify-between ${isDark ? 'text-slate-500 border-slate-900' : 'text-slate-600 border-slate-100'}`}>
                  <span className="font-semibold">待決傳票：</span>
                  <span className={`font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{records.filter(r => r.status === '待簽核').length} 筆</span>
                </p>
              </div>

              <div className={`p-5 rounded-2xl relative overflow-hidden transition-all border ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>🟢 本期已核准提款額</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>TWD</span>
                  <span className={`text-2xl font-black font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {records
                      .filter(r => r.status === '已核准')
                      .reduce((sum, r) => sum + r.amount_total, 0)
                      .toLocaleString()}
                  </span>
                </div>
                <p className={`text-[10px] mt-2 border-t pt-2 flex justify-between ${isDark ? 'text-slate-500 border-slate-900' : 'text-slate-600 border-slate-100'}`}>
                  <span className="font-semibold">放行傳票：</span>
                  <span className={`font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{records.filter(r => r.status === '已核准').length} 筆</span>
                </p>
              </div>

              <div className={`p-5 rounded-2xl relative overflow-hidden transition-all border ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>🔴 本期已駁回傳票筆數</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>TWD</span>
                  <span className={`text-2xl font-black font-mono ${isDark ? 'text-rose-500' : 'text-rose-600'}`}>
                    {records
                      .filter(r => r.status === '已退回')
                      .reduce((sum, r) => sum + r.amount_total, 0)
                      .toLocaleString()}
                  </span>
                </div>
                <p className={`text-[10px] mt-2 border-t pt-2 flex justify-between ${isDark ? 'text-slate-500 border-slate-900' : 'text-slate-600 border-slate-100'}`}>
                  <span className="font-semibold">已標示退回：</span>
                  <span className={`font-black ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{records.filter(r => r.status === '已退回').length} 筆</span>
                </p>
              </div>
            </div>

            {/* Split layout: Selector List (Left 7cols) + Interactive Voucher Board (Right 5cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column - Approval List Card Container */}
              <div className={`lg:col-span-7 rounded-2xl overflow-hidden backdrop-blur flex flex-col border transition-all ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                
                {/* Visual filter for status within the list */}
                <div className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isDark ? 'border-slate-850 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
                  <h3 className={`font-semibold text-xs ${isDark ? 'text-slate-300' : 'text-slate-800 font-bold'}`}>
                    📋 審查傳票清單 (共 {records.length} 筆)
                  </h3>
                  <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    {['all', '待簽核', '已核准', '已退回', '免簽核/待查閱'].map((st) => {
                      const count = st === 'all' 
                        ? records.length 
                        : records.filter(r => r.status === st).length;
                      return (
                        <button
                          key={st}
                          onClick={() => {
                            setWorkflowStatusFilter(st);
                            const nextFiltered = st === 'all' ? records : records.filter(r => r.status === st);
                            if (nextFiltered.length > 0) {
                              setSelectedApprovalRecordId(nextFiltered[0].id);
                            }
                          }}
                          className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                            workflowStatusFilter === st
                              ? isDark ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10' : 'bg-cyan-600 text-white font-bold shadow shadow-cyan-600/10'
                              : isDark ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white' : 'bg-white border-slate-250 text-slate-750 hover:bg-slate-100 hover:text-slate-900 shadow-sm'
                          }`}
                        >
                          {st === 'all' ? '全部' : st} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* List Body */}
                <div className={`divide-y max-h-[500px] overflow-y-auto scrollbar-thin ${isDark ? 'divide-slate-850' : 'divide-slate-150'}`}>
                  {records.filter(r => {
                    if (workflowStatusFilter === 'all') return true;
                    return r.status === workflowStatusFilter;
                  }).length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-xs">
                      目前此類別無任何收支傳票。<br />
                      您可在主要審計大盤上傳發票、點選仿真單據，或在手動記帳時提交「待簽核」傳票。
                    </div>
                  ) : (
                    records.filter(r => {
                      if (workflowStatusFilter === 'all') return true;
                      return r.status === workflowStatusFilter;
                    }).map((rec) => {
                      const isSelected = rec.id === selectedApprovalRecordId;
                      return (
                        <div
                          key={rec.id}
                          onClick={() => {
                            setSelectedApprovalRecordId(rec.id);
                            setCommentText(''); // Clear comment box on load
                          }}
                          className={`p-4 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 last:border-b-0 ${
                            isDark
                              ? `hover:bg-slate-900/50 border-slate-950 ${isSelected ? 'bg-cyan-950/20 border-l-4 border-cyan-500' : 'border-l-4 border-transparent'}`
                              : `hover:bg-slate-50/80 border-slate-105 ${isSelected ? 'bg-cyan-50/50 border-l-4 border-cyan-600' : 'border-l-4 border-transparent'}`
                          }`}
                        >
                          <div className="space-y-1 md:max-w-[70%]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-mono text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>{rec.date}</span>
                              {rec.billing_type === '事前請款' ? (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border transition-all ${isDark ? 'bg-indigo-950 text-indigo-300 border-indigo-900/40' : 'bg-indigo-50 text-indigo-700 border-indigo-250'}`}>
                                  📋 事前請款
                                </span>
                              ) : (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border transition-all ${isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-900/40' : 'bg-emerald-50 text-emerald-700 border-emerald-250'}`}>
                                  💰 事後報帳
                                </span>
                              )}
                              
                              {rec.status === '待簽核' ? (
                                <span className={`text-[9px] px-1 rounded font-bold border transition-all ${isDark ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-250'}`}>
                                  🟡 待簽核
                                </span>
                              ) : rec.status === '已核准' ? (
                                <span className={`text-[9px] px-1 rounded font-bold border transition-all ${isDark ? 'bg-emerald-950 text-emerald-400 border-emerald-900' : 'bg-emerald-50 text-emerald-700 border-emerald-250'}`} title={`核准主管: ${rec.approved_by}`}>
                                  🟢 已核准
                                </span>
                              ) : rec.status === '已退回' ? (
                                <span className={`text-[9px] px-1 rounded font-bold border transition-all ${isDark ? 'bg-rose-950 text-rose-400 border-rose-900' : 'bg-rose-50 text-rose-700 border-rose-250'}`}>
                                  🔴 已退回
                                </span>
                              ) : (
                                <span className={`text-[9px] px-1 rounded font-bold border transition-all ${isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-705 border-slate-250'}`}>
                                  ⚪ 免簽核
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-semibold ${isSelected ? (isDark ? 'text-cyan-400' : 'text-cyan-700 font-extrabold') : (isDark ? 'text-slate-200' : 'text-slate-900 font-bold')}`}>
                                {rec.seller_name || '無名商家'}
                              </p>
                              <span className={`text-[10px] font-mono font-bold ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>({rec.category})</span>
                            </div>
                            <p className={`text-[11px] line-clamp-1 ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>{rec.summary}</p>
                            {rec.approved_by && (
                              <p className={`text-[9px] flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-605 font-bold'}`}>
                                <span>👤 核決主管: {rec.approved_by}</span>
                                <span className="scale-75">•</span>
                                <span className="font-mono">{rec.approved_at}</span>
                              </p>
                            )}
                          </div>
                          
                          {/* Price & fast quick actionable tag */}
                          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 self-center">
                            <span className={`text-xs font-bold font-mono select-all ${isDark ? 'text-white' : 'text-slate-950 font-black'}`}>
                              {rec.currency} {rec.amount_total.toLocaleString()}
                            </span>
                            
                            {/* Fast Quick approve button directly on item for managers convenience */}
                            {rec.status === '待簽核' ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleFastApprove(rec, '已核准')}
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-850 border-emerald-250'}`}
                                >
                                  核准
                                </button>
                                <button
                                  onClick={() => handleFastApprove(rec, '已退回')}
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-800' : 'bg-rose-50 hover:bg-rose-100 text-rose-850 border-rose-250'}`}
                                >
                                  駁回
                                </button>
                              </div>
                            ) : rec.status === '已退回' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFastApprove(rec, '待簽核'); }}
                                className={`text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors border ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-750' : 'bg-slate-100 hover:bg-slate-200 text-slate-850 border-slate-250 shadow-sm'}`}
                              >
                                重新送審
                              </button>
                            ) : rec.status === '已核准' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFastApprove(rec, '待簽核'); }}
                                className={`text-[9px] underline cursor-pointer transition-colors font-bold ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}`}
                                title="撤回核准，恢復為待審状态"
                              >
                                取消審查
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFastApprove(rec, '待簽核'); }}
                                className={`text-[9px] font-bold border px-2 py-0.5 rounded cursor-pointer transition-colors ${isDark ? 'bg-slate-900 hover:bg-slate-850 text-indigo-400 border-slate-800' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-705 border-indigo-250'}`}
                                title="此項目通常免簽，點選此鈕將其推送至待簽核流程"
                              >
                                推送簽核
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column - Interactive Voucher Audit Board (Voucher UI style card) */}
              <div className="lg:col-span-5 space-y-4">
                
                {(() => {
                  const selectedRec = records.find(r => r.id === selectedApprovalRecordId);
                  
                  if (!selectedRec) {
                    return (
                      <div className={`border-2 border-dashed rounded-2xl p-12 text-center text-xs backdrop-blur ${isDark ? 'bg-slate-950/40 border-slate-850 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-650 font-medium shadow-sm'}`}>
                        🔍 請在左邊點選任何一筆傳票<br />展開「實時電子會計傳票核決看板」
                      </div>
                    );
                  }

                  const isDeductible = checkIsDeductible(selectedRec);

                  return (
                    <div className={`border rounded-2xl p-6 backdrop-blur space-y-5 shadow-xl relative overflow-hidden transition-all ${isDark ? 'bg-slate-950 border-slate-850 text-white shadow-black/30' : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'}`}>
                      
                      {/* Interactive Header */}
                      <div className={`pb-3 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <div>
                          <h4 className="text-[10px] font-bold text-cyan-500 font-mono tracking-wider">OFFICIAL ACCOUNTS</h4>
                          <h3 className={`text-sm font-black mt-1 ${isDark ? 'text-slate-200' : 'text-slate-905'}`}>元啟實業電子臨時傳票</h3>
                        </div>
                        <span className={`font-mono text-[9px] border px-2 py-0.5 rounded-md ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-700 font-bold shadow-sm'}`}>
                          單號: {selectedRec.id.split('-').pop()?.toUpperCase()}
                        </span>
                      </div>

                      {/* Voucher Main Specification */}
                      <div className="space-y-4 text-xs">
                        
                        <div className={`grid grid-cols-2 gap-3 p-2.5 rounded-xl border ${isDark ? 'bg-slate-900/30 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                          <div>
                            <span className={`text-[10px] block ${isDark ? 'text-slate-500' : 'text-slate-700 font-bold'}`}>消費或入帳日：</span>
                            <span className={`font-semibold font-mono text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-800 font-extrabold'}`}>{selectedRec.date}</span>
                          </div>
                          <div>
                            <span className={`text-[10px] block ${isDark ? 'text-slate-500' : 'text-slate-700 font-bold'}`}>當前簽署狀態：</span>
                            <span className={`font-bold ${
                              selectedRec.status === '已核准' ? (isDark ? 'text-emerald-500' : 'text-emerald-700 font-extrabold') :
                              selectedRec.status === '已退回' ? (isDark ? 'text-rose-500' : 'text-rose-600 font-extrabold') :
                              selectedRec.status === '待簽核' ? (isDark ? 'text-amber-500 animate-pulse font-bold' : 'text-amber-600 animate-pulse font-black') :
                              isDark ? 'text-slate-400' : 'text-slate-705'
                            }`}>{selectedRec.status}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className={`text-[10px] block ${isDark ? 'text-slate-500' : 'text-slate-700 font-bold'}`}>款項品摘要說明：</span>
                          <p className={`font-medium leading-relaxed px-2.5 py-2 rounded border select-all font-sans ${isDark ? 'text-slate-200 bg-slate-900/20 border-slate-900' : 'text-slate-950 bg-white border-slate-200 font-semibold shadow-sm'}`}>
                            {selectedRec.summary}
                          </p>
                        </div>

                        <div className={`grid grid-cols-2 gap-4 py-3 border-t border-b ${isDark ? 'border-slate-850/60' : 'border-slate-200'}`}>
                          <div>
                            <span className={`text-[10px] block ${isDark ? 'text-slate-500' : 'text-slate-700 font-bold'}`}>買方（本公司統一編號）：</span>
                            <span className={`font-mono font-bold text-xs ${selectedRec.buyer_tax_id === yuanqiVatId ? (isDark ? 'text-cyan-405' : 'text-cyan-700 font-extrabold') : 'text-rose-600 font-extrabold'}`}>
                              {selectedRec.buyer_tax_id || (
                                <span className={`block italic ${isDark ? 'text-slate-605' : 'text-slate-400'}`}>（無記載）</span>
                              )}
                            </span>
                            {selectedRec.buyer_tax_id && selectedRec.buyer_tax_id !== yuanqiVatId && (
                              <span className="text-[9px] text-rose-500 block font-bold leading-tight mt-1">⚠️ 統編不符：非本公司發票</span>
                            )}
                          </div>
                          <div>
                            <span className={`text-[10px] block ${isDark ? 'text-slate-500' : 'text-slate-700 font-bold'}`}>賣方商號 / 統一編號：</span>
                            <span className={`font-semibold block leading-snug truncate animate-none ${isDark ? 'text-slate-300' : 'text-slate-900 font-bold'}`} title={selectedRec.seller_name}>{selectedRec.seller_name || '無記載'}</span>
                            <span className={`font-mono text-[11px] block mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>{selectedRec.seller_tax_id || '（無統編）'}</span>
                          </div>
                        </div>

                        {/* Money figures */}
                        <div className={`space-y-2 p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex justify-between items-center text-xs">
                            <span className={isDark ? 'text-slate-500' : 'text-slate-600 font-semibold'}>銷售金額 (未稅 net)：</span>
                            <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-905 font-extrabold'}`}>{selectedRec.currency} {selectedRec.amount_sales.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className={isDark ? 'text-slate-500' : 'text-slate-600 font-semibold'}>加值營業稅額 (VAT)：</span>
                            <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-905 font-extrabold'}`}>{selectedRec.currency} {selectedRec.amount_tax.toLocaleString()}</span>
                          </div>
                          <div className={`flex justify-between items-center text-xs border-t pt-2 ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                            <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-800 font-bold'}`}>總金額代墊/應付 (Total)：</span>
                            <span className={`font-mono font-black text-sm ${isDark ? 'text-white' : 'text-emerald-700 font-black'}`}>{selectedRec.currency} {selectedRec.amount_total.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Audit Verification status */}
                        <div className={`text-[11px] p-2.5 rounded-lg border flex items-center justify-between animate-none ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200 text-slate-850'}`}>
                          <div>
                            <span className={`block font-bold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>合規扣抵進項稅額檢查：</span>
                            <span className={`font-mono text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-600 font-semibold'}`}>主體稅法第19條</span>
                          </div>
                          {isDeductible ? (
                            <span className={`border text-[10px] font-extrabold px-2 py-0.5 rounded transition-all ${isDark ? 'bg-emerald-950/60 text-emerald-300 border-emerald-900' : 'bg-emerald-50 text-emerald-700 border-emerald-250 shadow-sm'}`}>
                              ✅ 符資格・得扣
                            </span>
                          ) : (
                            <span className={`border text-[10px] font-extrabold px-2 py-0.5 rounded font-sans ${isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-slate-200 text-slate-700 border-slate-300 shadow-sm'}`} title="無本公司統編，或會計科目屬於不予扣抵者。會計做帳請全額認列費用。">
                              ❌ 不得扣抵・費用入帳
                            </span>
                          )}
                        </div>

                        {/* Notes addition */}
                        {selectedRec.notes && (
                          <div className={`text-[11px] p-2.5 rounded border max-h-20 overflow-y-auto select-all ${isDark ? 'text-slate-400 bg-slate-900/10 border-slate-900' : 'text-slate-800 bg-slate-50 border-slate-200'}`}>
                            <strong>原單據備註：</strong> {selectedRec.notes}
                          </div>
                        )}

                        {/* Supervisor Comments Input */}
                        <div className="space-y-1.5 pt-1">
                          <label className={`text-[11px] font-bold block ${isDark ? 'text-slate-400' : 'text-slate-755 font-bold'}`}>✍️ 主管核決批示意見 / 退回理由：</label>
                          <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="請在此輸入簽核意見（如：核准、發票不齊、請補摘要、同意此事前計畫請款...）"
                            rows={2}
                            className={`w-full hover:border-slate-400 rounded-xl p-2.5 text-xs focus:outline-none focus:border-cyan-500 transition-colors resize-none leading-relaxed font-sans ${isDark ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm'}`}
                          />
                        </div>

                      </div>

                      {/* Approval Execution Buttons */}
                      <div className="grid grid-cols-2 gap-3 pt-2 select-none">
                        
                        <button
                          onClick={async () => {
                            const pwd = await checkPassword('核准放行傳票');
                            if (!pwd) return;
                            const formattedNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
                            let finalNotes = selectedRec.notes || '';
                            if (commentText.trim()) {
                              finalNotes = `${finalNotes} [${currentApproverName}批示: ${commentText}]`.trim();
                            }

                            const payload = {
                              ...selectedRec,
                              status: '已核准' as ApprovalStatus,
                              approved_by: currentApproverName || '主管張元啟',
                              approved_at: formattedNow,
                              notes: finalNotes
                            };

                            try {
                              const res = await fetch(`/api/records/${selectedRec.id}`, {
                                method: 'PUT',
                                headers: { 
                                  'Content-Type': 'application/json',
                                  'x-operation-password': pwd
                                },
                                body: JSON.stringify(payload)
                              });
                              if (!res.ok) throw new Error('核准放行資料庫提交失敗，密碼錯誤或權限不足');
                              
                              setRecords(prev => prev.map(r => r.id === selectedRec.id ? { ...r, ...payload } : r));
                              setCommentText('');
                            } catch (err: any) {
                              alert(err.message || '操作錯誤');
                            }
                          }}
                          className={`hover:scale-[1.02] py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1 shadow-lg font-extrabold ${
                            isDark 
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/10' 
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/15'
                          }`}
                        >
                          <span>🟢 同意核銷/放行</span>
                        </button>
                        
                        <button
                          onClick={async () => {
                            const pwd = await checkPassword('駁回/退回傳票');
                            if (!pwd) return;
                            let finalNotes = selectedRec.notes || '';
                            if (commentText.trim()) {
                              finalNotes = `${finalNotes} [${currentApproverName}駁回理由: ${commentText}]`.trim();
                            }

                            const payload = {
                              ...selectedRec,
                              status: '已退回' as ApprovalStatus,
                              approved_by: '',
                              approved_at: '',
                              notes: finalNotes
                            };

                            try {
                              const res = await fetch(`/api/records/${selectedRec.id}`, {
                                method: 'PUT',
                                headers: { 
                                  'Content-Type': 'application/json',
                                  'x-operation-password': pwd
                                },
                                body: JSON.stringify(payload)
                              });
                              if (!res.ok) throw new Error('駁回退回資料庫提交失敗，密碼錯誤或權限不足');
                              
                              setRecords(prev => prev.map(r => r.id === selectedRec.id ? { ...r, ...payload } : r));
                              setCommentText('');
                            } catch (err: any) {
                              alert(err.message || '操作錯誤');
                            }
                          }}
                          className={`hover:scale-[1.02] py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1 border font-bold ${
                            isDark 
                              ? 'bg-rose-950 hover:bg-rose-900 border-rose-800 text-rose-300' 
                              : 'bg-rose-50 hover:bg-rose-100 border-rose-250 text-rose-700 shadow-sm'
                          }`}
                        >
                          <span>🔴 駁回 / 退回修正</span>
                        </button>

                      </div>

                    </div>
                  );
                })()}

              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER System Signature */}
      <footer className={`border-t py-8 text-center text-xs tracking-wide transition-colors ${
        isDark 
          ? 'border-slate-800/80 bg-slate-950/80 text-slate-600' 
          : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto px-4 space-y-2 font-sans md:px-8">
          <p className={`font-semibold ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>元啟實業股份有限公司 · 企業專屬自動化財務記帳平台</p>
          <p>© 2026 元啟實業有限公司 版權所有。配合最新台灣財政部加值型及非加值型營業稅法規範建置。</p>
          <p className="text-[10px]">系統核心：Node.js Express + React SPA, powered by Google Gemini 3.5 Flash</p>
        </div>
      </footer>

      {/* POPUP MODAL - Automatic OCR Editing / Manual Bill inputting template */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`relative rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl transition-all border ${isDark ? 'bg-slate-900 border-slate-800 shadow-cyan-950/10 text-white' : 'bg-white border-slate-300 shadow-slate-400/25 text-slate-900'}`}>
            
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded ${editingRecordId ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                   <FileText className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900 font-black'}`}>
                    {editingRecordId ? '✏️ 校對與調整現有記帳傳票' : '📝 新增/分析會計傳票憑證'}
                  </h3>
                  <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-600 font-medium'}`}>
                    {editingRecordId ? `編號: ${editingRecordId}` : '經 AI 即時視覺辨識之項目，在存檔時即時併入對帳分頁'}
                  </p>
                </div>
              </div>
              <button
                disabled={saveLoading}
                onClick={() => setShowFormModal(false)}
                className={`p-1 px-1.5 rounded transition-colors cursor-pointer ${saveLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRecord} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* Warn if Buyer Tax ID mismatch with Yuanqi Tax ID */}
              {formBuyerTaxId && formBuyerTaxId.trim() !== yuanqiVatId && (
                <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-2xl flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-red-300">警示：買受人非本公司統一編號！</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      此憑證所登載之買受人統編為 <span className="font-mono text-cyan-300 font-bold">"{formBuyerTaxId}"</span>，與公司約定統編 <span className="font-mono text-white font-bold">"{yuanqiVatId}"</span> 不吻合，依法**無法申報扣抵營業稅**。若此屬實，存檔後將自動判定為「不可扣抵」傳票。
                    </p>
                  </div>
                </div>
              )}

              {/* Taiwan Tax deductibility classification tips */}
              {checkIsDeductible({ buyer_tax_id: formBuyerTaxId, amount_tax: formAmountTax, category: formCategory, seller_tax_id: formSellerTaxId }) ? (
                <div className={`p-3 rounded-2xl flex items-start gap-2.5 border ${isDark ? 'bg-emerald-950/30 border-emerald-900/40' : 'bg-emerald-50 border-emerald-150'}`}>
                  <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700 font-extrabold'}`} />
                  <div className="space-y-0.5">
                    <p className={`text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-900 font-extrabold'}`}>合乎進項抵降標準</p>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-705 font-medium'}`}>
                      本單據具備買方公司統編（{yuanqiVatId}），且有合法提列之營業稅額（{formAmountTax}），會計科目符合日常維修與常規行政開銷，此筆稅額將自動計入**可扣抵進項**（折抵未來申報營利事業所得或營業稅）。
                    </p>
                  </div>
                </div>
              ) : formCategory === '交際費' ? (
                <div className={`p-3 rounded-2xl flex items-start gap-2.5 border ${isDark ? 'bg-amber-950/40 border-amber-900/40' : 'bg-amber-50 border-amber-150'}`}>
                  <HelpCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-700 font-extrabold'}`} />
                  <div className="space-y-0.5">
                    <p className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-900 font-extrabold'}`}>扣抵特殊限制：交際費用項目</p>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-705 font-medium'}`}>
                      雖然可能有指定統編並支付 5% 稅額，但根據台灣營業稅法第19條，**交際費屬限制扣抵項目**，稅額不可申報營業稅折讓，只能全額當作費用扣抵年終所得稅。
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`p-3 rounded-2xl flex items-start gap-2.5 border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <HelpCircle className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                  <div className="space-y-0.5">
                    <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-900 font-extrabold'}`}>自動判定為：不可扣抵營業稅項目</p>
                    <p className={`text-[10px] ${isDark ? 'text-slate-550' : 'text-slate-600 font-medium'}`}>
                      原因：
                      {!formBuyerTaxId || !formBuyerTaxId.trim()
                        ? '未填寫買方統一編號。'
                        : formBuyerTaxId.trim() !== yuanqiVatId
                        ? '買方統一編號非本公司統編。'
                        : (Number(formAmountTax) || 0) <= 0
                        ? '無營業稅額（免稅或收據）。'
                        : formCategory === '旅費-國外'
                        ? '國外旅費依法不得扣抵營業稅。'
                        : '未符合扣抵規定。'
                      }
                      此筆交易之進項稅額無法申報扣抵營業稅，將全額併入費用。
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Date */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>消費日期 (格式 YYYY-MM-DD) <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 font-mono ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  />
                </div>

                {/* Invoice Number */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>發票 / 收據憑證號碼</label>
                  <input
                    type="text"
                    placeholder="例如: AB-12345678"
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 uppercase font-mono tracking-wider ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-350 text-slate-900 placeholder-slate-400 font-bold'}`}
                  />
                </div>

                {/* Recorded By */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>登錄人 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="請輸入經辦/登錄人..."
                    value={formRecordedBy}
                    onChange={(e) => setFormRecordedBy(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-700' : 'bg-white border-slate-350 text-slate-900 placeholder-slate-400 font-bold'}`}
                  />
                </div>

              </div>

              {/* Billing Type & Approval Status Section */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Billing Type */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>帳務類型 <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={formBillingType}
                    onChange={(e) => setFormBillingType(e.target.value as BillingType)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  >
                    <option value="事後報帳">💰 事後報帳 (代墊、已付款核銷)</option>
                    <option value="事前請款">📋 事前請款 (預算核備、尚未實際支出)</option>
                  </select>
                </div>

                {/* Approval Status */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>簽核狀態 <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={formStatus}
                    onChange={(e) => {
                      const nextStatus = e.target.value as ApprovalStatus;
                      setFormStatus(nextStatus);
                      if (nextStatus === '已核准' && !formApprovedBy) {
                        setFormApprovedBy('主管張元啟');
                        setFormApprovedAt(new Date().toISOString().replace('T', ' ').slice(0, 19));
                      } else if (nextStatus !== '已核准') {
                        setFormApprovedBy('');
                        setFormApprovedAt('');
                      }
                    }}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  >
                    <option value="免簽核/待查閱">⚪ 免簽核/待查閱 (免簽核彈性帳)</option>
                    <option value="待簽核">🟡 待簽核 (需主管審查核銷)</option>
                    <option value="已核准">🟢 已核准 (完成主管手動簽核)</option>
                    <option value="已退回">🔴 已退回 (遭主管駁回退還)</option>
                  </select>
                </div>

              </div>

              {/* Conditional fields: Approved By / Approved At */}
              {(formStatus === '已核准') && (
                <div className={`p-4 rounded-2xl border grid grid-cols-2 gap-4 ${isDark ? 'bg-slate-955 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="space-y-1.5">
                    <label className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>核准的主管簽署名稱</label>
                    <input
                      type="text"
                      placeholder="如: 主管張元啟"
                      value={formApprovedBy}
                      onChange={(e) => setFormApprovedBy(e.target.value)}
                      className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>核准日期與時間</label>
                    <input
                      type="text"
                      placeholder="格式: YYYY-MM-DD HH:mm:ss"
                      value={formApprovedAt}
                      onChange={(e) => setFormApprovedAt(e.target.value)}
                      className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 font-mono ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                
                {/* Seller Name */}
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>銷售方名稱 (店家) <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="請輸入賣方店家名稱..."
                    value={formSellerName}
                    onChange={(e) => setFormSellerName(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-700 font-bold'}`}>會計科目性質分類 <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                    className={`w-full border rounded-xl py-2.5 px-3 text-xs focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  >
                    <option value="辦公用品">辦公用品</option>
                    <option value="交際費">交際費</option>
                    <option value="旅費-國內">旅費-國內</option>
                    <option value="旅費-國外">旅費-國外</option>
                    <option value="修繕費">修繕費</option>
                    <option value="水電郵電費">水電郵電費</option>
                    <option value="雜項購置">雜項購置</option>
                    <option value="國際貿易費用">國際貿易費用</option>
                    <option value="其他支出">其他支出</option>
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                
                {/* Seller Tax ID */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-705 font-bold'}`}>賣方統一編號 (8碼)</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="若有，請填入賣方商號統編"
                    value={formSellerTaxId}
                    onChange={(e) => setFormSellerTaxId(e.target.value.replace(/\D/g, ''))}
                    className={`w-full border rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                  />
                </div>

                {/* Buyer Tax ID */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-705 font-bold'}`}>買方統一編號 (公司統編)</label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="不抵查免填，合格請打公司統編"
                      value={formBuyerTaxId}
                      onChange={(e) => setFormBuyerTaxId(e.target.value.replace(/\D/g, ''))}
                      className={`w-full border rounded-xl py-2 pl-3 pr-16 text-xs font-mono focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setFormBuyerTaxId(yuanqiVatId)}
                      className={`absolute right-2 top-1.5 text-[10px] px-1.5 py-1 rounded transition-colors font-bold ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-cyan-400' : 'bg-slate-100 hover:bg-slate-200 text-cyan-800 border border-slate-200'}`}
                    >
                      帶入預設
                    </button>
                  </div>
                </div>

              </div>

              {/* Summary Description text */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-705 font-bold'}`}>消費品名與繁體中文摘要 (申報帳目審查用) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="例如: 原子筆、A4影印紙與會議餐盒..."
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-905 font-bold'}`}
                />
              </div>

              {/* Currencies, Auto-calculation and Amounts */}
              <div className={`p-4 rounded-2xl border space-y-4 ${isDark ? 'bg-slate-955 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-900 font-bold'}`}>💲 稅率金額核准與計算</span>
                  <label className={`flex items-center gap-2 cursor-pointer text-xs font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-800'}`}>
                    <input
                      type="checkbox"
                      checked={autoCalcTax}
                      onChange={(e) => setAutoCalcTax(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    <span>自動按 5% 計算加值稅 (台灣標準)</span>
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-4 items-end">
                  
                  {/* Currency */}
                  <div className="space-y-1.5 col-span-1">
                    <label className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>幣別</label>
                    <input
                      type="text"
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value.toUpperCase())}
                      className={`w-full border rounded-xl py-2 px-2 text-xs text-center font-mono ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                    />
                  </div>

                  {/* Sales amount */}
                  <div className="space-y-1.5 col-span-1.5">
                    <label className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>未稅金額 (銷售額) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formAmountSales || ''}
                      onChange={(e) => setFormAmountSales(Number(e.target.value))}
                      className={`w-full border rounded-xl py-2 px-2 text-xs text-right font-mono ${isDark ? 'bg-slate-905 border-slate-800 text-white' : 'bg-white border-slate-350 text-slate-900 font-bold'}`}
                    />
                  </div>

                  {/* Tax amount */}
                  <div className="space-y-1.5 col-span-1">
                    <label className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-700'}`}>稅額</label>
                    <input
                      type="number"
                      min={0}
                      disabled={autoCalcTax}
                      value={formAmountTax || ''}
                      onChange={(e) => setFormAmountTax(Number(e.target.value))}
                      className={`w-full border rounded-xl py-2 px-2 text-xs text-right font-mono ${
                        autoCalcTax 
                          ? (isDark ? 'bg-slate-950 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-500 border-slate-205') 
                          : (isDark ? 'bg-slate-905 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-350 font-bold')
                      }`}
                    />
                  </div>

                  {/* Total amount */}
                  <div className="space-y-1.5 col-span-1">
                    <label className={`text-[10px] font-bold ${isDark ? 'text-emerald-400 font-bold' : 'text-emerald-800'}`}>總金額 (含稅) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formAmountTotal || ''}
                      onChange={(e) => handleTotalChange(Number(e.target.value))}
                      className={`w-full border rounded-xl py-2 px-3 text-xs text-right font-bold font-mono focus:outline-none ${isDark ? 'bg-slate-905 border-emerald-900/40 text-emerald-300' : 'bg-white border-emerald-300 text-emerald-700 font-extrabold'}`}
                    />
                  </div>

                </div>

                <div className={`text-[10.5px] flex justify-between flex-wrap gap-2 ${isDark ? 'text-slate-500' : 'text-slate-600 font-semibold'}`}>
                  <span>台灣法律防呆公式：[未稅金額 {formAmountSales}] + [加值稅額 {formAmountTax}] = [申報金額 {formAmountSales + formAmountTax}]</span>
                  {autoCalcTax && <span className={`font-bold ${isDark ? 'text-cyan-500' : 'text-cyan-800'}`}>系統正自動計算 5% 營業稅</span>}
                </div>
              </div>

              {/* Extra comments / Notes */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-705 font-bold'}`}>
                  <span>備註事項 (Notes)</span>
                  {formCategory === '其他支出' && <span className="text-amber-500 text-[10px] font-bold">★ 費用科目歸類為「其他支出」時此備註為強制性必填</span>}
                </label>
                <textarea
                  placeholder={formCategory === '其他支出' ? '請詳細補述此支出用途及詳細性質（否則會計查帳將無法入帳）...' : '選填：請說明此項消費之專案背景或申報相關特定指引...'}
                  required={formCategory === '其他支出'}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-cyan-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-white border-slate-350 text-slate-900 placeholder-slate-400 font-bold'}`}
                />
              </div>

              {/* 憑證/發票照片留存 */}
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-705 font-bold'}`}>
                  <span>憑證/發票照片留存</span>
                  <span className="text-[10px] text-slate-500">（自動或手動上傳照片，以便查看與會計核對）</span>
                </label>
                {formImageUrl ? (
                  <div className={`relative border rounded-2xl p-3 flex flex-col items-center gap-3 ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="relative max-h-48 overflow-hidden rounded-xl border border-slate-700/50">
                      <img src={formImageUrl} alt="憑證照片" className="object-contain max-h-48 rounded-xl" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormImageUrl(null)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isDark ? 'bg-red-955/65 hover:bg-red-900 border border-red-900/60 text-red-200' : 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-700'
                      }`}
                    >
                      🗑️ 移除與更換憑證照片
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      const fileInputId = 'form-img-input';
                      document.getElementById(fileInputId)?.click();
                    }}
                    className={`border-2 border-dashed rounded-2xl py-6 px-4 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 select-none ${
                      isDark ? 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/80' : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      id="form-img-input"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          if (!file.type.startsWith('image/')) {
                            alert('請務必上傳圖片格式檔案 (PNG, JPG, JPEG 等)');
                            return;
                          }
                          const reader = new FileReader();
                          reader.readAsDataURL(file);
                          reader.onload = () => {
                            setFormImageUrl(reader.result as string);
                          };
                        }
                      }}
                    />
                    <div className="flex flex-col items-center gap-1">
                      <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                        點選此處「手動上傳憑證照片」
                      </p>
                      <p className="text-[10px] text-slate-500">支援手機拍照直接上傳或發票截圖</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className={`pt-4 border-t flex justify-end gap-3 select-none ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={() => setShowFormModal(false)}
                  className={`px-5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${saveLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 shadow-sm'}`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className={`bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-500/10 cursor-pointer ${saveLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {saveLoading ? '儲存中...' : '確認傳票登載存檔'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 憑證照片全螢幕檢視彈窗 (Lightbox Modal) */}
      {selectedFullscreenImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm transition-all"
          onClick={() => setSelectedFullscreenImage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedFullscreenImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 font-bold text-sm bg-slate-900/80 hover:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50 cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              ✕ 關閉全螢幕
            </button>
            <div className="relative border border-slate-800 bg-slate-950 p-2 rounded-2xl max-w-full overflow-auto">
              <img 
                src={selectedFullscreenImage} 
                alt="會計申報憑證照片" 
                className="max-h-[75vh] object-contain rounded-xl shadow-2xl" 
              />
            </div>
            <p className="text-xs text-slate-400 font-mono text-center">
              會計傳票影像存檔 ｜ 請核對原始發票品名與未稅計算金額
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
