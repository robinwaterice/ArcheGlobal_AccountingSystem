export type ExpenseCategory =
  | '辦公用品'
  | '交際費'
  | '旅費-國內'
  | '旅費-國外'
  | '修繕費'
  | '水電郵電費'
  | '雜項購置'
  | '國際貿易費用'
  | '其他支出';

export type BillingType = '事前請款' | '事後報帳';

export type ApprovalStatus = '免簽核/待查閱' | '待簽核' | '已核准' | '已退回';

export interface AccountingRecord {
  id: string;
  date: string; // YYYY-MM-DD
  invoice_number: string;
  seller_name: string;
  seller_tax_id: string;
  buyer_tax_id: string;
  summary: string;
  category: ExpenseCategory;
  amount_sales: number;
  amount_tax: number;
  amount_total: number;
  currency: string;
  notes: string;
  createdAt?: string;
  imageUrl?: string;
  recorded_by: string;
  // 新增欄位
  billing_type: BillingType;
  status: ApprovalStatus;
  approved_by: string;
  approved_at: string;
}

export interface ParseResult {
  date: string;
  invoice_number: string;
  seller_name: string;
  seller_tax_id: string;
  buyer_tax_id: string;
  summary: string;
  category: ExpenseCategory;
  amount_sales: number;
  amount_tax: number;
  amount_total: number;
  currency: string;
  notes: string;
  recorded_by?: string;
  // 新增欄位
  billing_type: BillingType;
  status: ApprovalStatus;
  approved_by: string;
  approved_at: string;
}
