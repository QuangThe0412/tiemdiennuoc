export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  price2?: number;
  cost: number;
  stock: number;
  unit: string;
  link?: string;
  available?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount?: number;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

export interface Invoice {
  id: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  amountPaid: number;
}

export interface AppData {
  products: Product[];
  invoices: Invoice[];
  electricityRateType: 'flat' | 'tiers';
  waterRateType: 'flat' | 'tiers';
  electricityFlatRate: number;
  waterFlatRate: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
}
