import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Product, CartItem } from "./types";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { removeAccents, formatVND, getFormattedDate, getFormattedTime, isRetailCustomer, getDisplayImageLink } from './utils';
import { formatReceiptForNetworkPrinter, getLabelPreviewText, formatLabelForNetworkPrinter } from './printerServices';

const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

const tauriInvoke = async (cmd: string, args: any = {}): Promise<any> => {
  if (isTauri) {
    return invoke(cmd, args);
  }
  // Mock implementations for web browser
  if (cmd === "load_settings") {
    const saved = localStorage.getItem("setting.json");
    return saved || "{}";
  }
  if (cmd === "save_settings") {
    localStorage.setItem("setting.json", args.settings);
    return;
  }
  if (cmd === "get_config_path") {
    return "Trình duyệt (localStorage: setting.json)";
  }
  if (cmd === "open_config_folder") {
    alert("Thư mục cấu hình chỉ mở được khi chạy trên Ứng dụng Desktop!");
    return;
  }
  if (cmd === "test_mssql_connection") {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!args.server || !args.user) {
          reject("Thiếu thông tin kết nối (Server hoặc Username)!");
        } else {
          resolve(`Kết nối thành công (giả lập) tới Database '${args.dbName}' trên Server '${args.server}'!`);
        }
      }, 800);
    });
  }
  if (cmd === "save_file_to_downloads") {
    const blob = new Blob([args.content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", args.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return `Thư mục tải xuống của Trình duyệt (${args.fileName})`;
  }
  if (cmd === "scan_network_printers") {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(["192.168.1.100", "192.168.1.250"]);
      }, 1000);
    });
  }
  if (cmd === "print_bill_network") {
    console.log("Mock network print to IP:", args.ip, "Payload:\n", args.payload);
    return `Gửi lệnh in thành công tới ${args.ip} (giả lập trình duyệt)`;
  }
  if (cmd === "fetch_invoices_db") {
    const mockInvoices = [
      {
        IDHoaDon: 101,
        MaHoaDon: "HD-83921",
        NgayHDStr: "2026-05-22",
        GioHDStr: "15:30:00",
        PTKhuyenMai: 0.0,
        TienKhuyenMai: 0.0,
        GhiChu: "Giao hàng tận nơi",
        IDKhachHang: 1,
        TenKhachHang: "Nguyễn Văn A",
        DienThoaiKH: "0909123456",
        TongTien: 450000.0
      },
      {
        IDHoaDon: 102,
        MaHoaDon: "HD-48210",
        NgayHDStr: "2026-05-23",
        GioHDStr: "10:15:00",
        PTKhuyenMai: 5.0,
        TienKhuyenMai: 25000.0,
        GhiChu: "Mua trực tiếp tại quầy",
        IDKhachHang: 2,
        TenKhachHang: "Khách lẻ",
        DienThoaiKH: "",
        TongTien: 500000.0
      }
    ];
    // Filter the mock data
    const filtered = mockInvoices.filter(h => {
      const matchCust = !args.customerQuery || h.TenKhachHang.toLowerCase().includes(args.customerQuery.toLowerCase());
      const matchDate = h.NgayHDStr >= args.fromDate && h.NgayHDStr <= args.toDate;
      return matchCust && matchDate;
    });
    return JSON.stringify(filtered);
  }
  if (cmd === "fetch_invoice_details_db") {
    const mockDetails: Record<number, any[]> = {
      101: [
        { id: 1, productId: 1, productName: "Ổ cắm điện Lioa 4 lỗ", unit: "Cái", quantity: 2, price: 150000, discount: 0, total: 300000 },
        { id: 2, productId: 2, productName: "Dây điện Cadivi 2.5", unit: "Mét", quantity: 15, price: 10000, discount: 0, total: 150000 }
      ],
      102: [
        { id: 3, productId: 3, productName: "Bóng đèn LED Philips 12W", unit: "Cái", quantity: 5, price: 100000, discount: 5, total: 475000 }
      ]
    };
    return JSON.stringify(mockDetails[args.invoiceId] || []);
  }
  if (cmd === "save_invoice_db") {
    console.log("Mock saved invoice:", args);
    return Math.floor(100 + Math.random() * 900);
  }
  return null;
};

interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  debt: number;
}

interface PendingInvoice {
  invoiceNo: string;
  dateTime: string;
  customer: Customer;
  items: CartItem[];
  notes: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<"pos" | "inventory" | "customers" | "invoices">("pos");

  // Invoices State
  const getFirstDayOfMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };
  const getTodayStr = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [invoiceFromDate, setInvoiceFromDate] = useState(getFirstDayOfMonthStr());
  const [invoiceToDate, setInvoiceToDate] = useState(getTodayStr());
  const [invoiceCustomerQuery, setInvoiceCustomerQuery] = useState("");
  const [invoiceCodeQuery, setInvoiceCodeQuery] = useState("");
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printJob, setPrintJob] = useState<any | null>(null);
  const [invoiceDetailWidth, setInvoiceDetailWidth] = useState(580);
  const [isDraggingInvWidth, setIsDraggingInvWidth] = useState(false);
  const dragStartInvX = useRef(0);
  const dragStartInvWidth = useRef(580);
  const barcodeBuffer = useRef("");
  const lastBarcodeKeyTime = useRef(0);

  // Data State
  const [products, setProducts] = useState<Product[]>([]);

  // Customer State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIdx, setSelectedCustomerIdx] = useState<number | null>(null);

  // Modal for Add/Edit Customer
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<{ name: string; phone: string; address: string; debt: number }>({
    name: "",
    phone: "",
    address: "",
    debt: 0
  });

  // Modal for Thu nợ
  const [isPayDebtModalOpen, setIsPayDebtModalOpen] = useState(false);
  const [payDebtAmount, setPayDebtAmount] = useState(0);

  // Modal for Thêm nợ
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState(false);
  const [addDebtAmount, setAddDebtAmount] = useState(0);

  // Pending Invoices State
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);

  // Modal for Checkout Review
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isUnitManagerOpen, setIsUnitManagerOpen] = useState(false);

  const [customAlert, setCustomAlert] = useState<{ message: string; title: string; type: 'info' | 'warning' | 'error' } | null>(null);
  const [customConfirm, setCustomConfirm] = useState<{ message: string; title: string; onConfirm: () => void } | null>(null);

  const showAlert = useCallback((message: string, title?: string, type?: 'info' | 'warning' | 'error') => {
    let resolvedTitle = title || "";
    let resolvedType = type;

    const lowerMessage = String(message).toLowerCase();

    // Automatically detect type if not provided
    if (!resolvedType) {
      if (lowerMessage.includes("lỗi") || lowerMessage.includes("thất bại") || lowerMessage.includes("không đúng") || lowerMessage.includes("trống") || lowerMessage.includes("trùng") || lowerMessage.includes("sai")) {
        resolvedType = "error";
      } else if (lowerMessage.includes("cảnh báo") || lowerMessage.includes("chú ý") || lowerMessage.includes("cẩn thận") || lowerMessage.includes("không thể") || lowerMessage.includes("chưa")) {
        resolvedType = "warning";
      } else {
        resolvedType = "info";
      }
    }

    if (!resolvedTitle) {
      if (resolvedType === "error") resolvedTitle = "Lỗi";
      else if (resolvedType === "warning") resolvedTitle = "Cảnh báo";
      else resolvedTitle = "Thông tin";
    }

    setCustomAlert({ message: String(message), title: resolvedTitle, type: resolvedType });
  }, []);

  useEffect(() => {
    window.alert = (message: any) => {
      showAlert(message);
    };
  }, [showAlert]);

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posSearch, setPosSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState(() => "HĐ-" + Math.floor(10000 + Math.random() * 90000));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>({
    id: '',
    name: 'Chọn khách hàng...',
    phone: '',
    address: '',
    debt: 0
  });
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [posNotes, setPosNotes] = useState("");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("");
  const [units, setUnits] = useState<string[]>(["Cuộn", "Cái", "Cây", "Bộ", "Mét", "Thùng"]);
  const [newUnitName, setNewUnitName] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [imageEditProduct, setImageEditProduct] = useState<Product | null>(null);
  const [imageEditLink, setImageEditLink] = useState("");
  const [sessionUploadedImages, setSessionUploadedImages] = useState<string[]>([]);
  const [posImageWidth, setPosImageWidth] = useState(200);
  const [editForm, setEditForm] = useState<{ sku: string; name: string; unit: string; price: number; price2: number; link?: string; available?: boolean } | null>(null);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'advanced'>('general');
  const [zoom, setZoom] = useState(100);
  const [tempZoom, setTempZoom] = useState(100);
  const [mssqlServer, setMssqlServer] = useState("");
  const [mssqlDbName, setMssqlDbName] = useState("tiemdiennuoc");
  const [mssqlUser, setMssqlUser] = useState("sa");
  const [mssqlPass, setMssqlPass] = useState("");
  const [mssqlTestResult, setMssqlTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [configFilePath, setConfigFilePath] = useState("");
  const [dbLocked, setDbLocked] = useState(true);
  const [shopName, setShopName] = useState("Điện nước Tâm Nhi");
  const [shopAddress, setShopAddress] = useState("Khu phố 3, TT. Củ Chi, Củ Chi, TP.HCM");
  const [shopPhone, setShopPhone] = useState("0908 123 456");
  const [gasUrl, setGasUrl] = useState("");
  const [gasToken, setGasToken] = useState("tiem_dien_nuoc_secret_key_2026");

  const [iphoneSessionId, setIphoneSessionId] = useState("");
  const [printMethod, setPrintMethod] = useState("browser");
  const [networkPrinterIp, setNetworkPrinterIp] = useState("");
  const [labelPrintMethod, setLabelPrintMethod] = useState("browser");
  const [labelNetworkPrinterIp, setLabelNetworkPrinterIp] = useState("");
  const [scanningTarget, setScanningTarget] = useState<'receipt' | 'label' | null>(null);
  const [lastScanTarget, setLastScanTarget] = useState<'receipt' | 'label' | null>(null);
  const [scannedPrinters, setScannedPrinters] = useState<string[]>([]);
  const [customScanIp, setCustomScanIp] = useState("");
  const [customScanPort, setCustomScanPort] = useState("");
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  const [isLabelPrintModalOpen, setIsLabelPrintModalOpen] = useState(false);
  const [labelPrintProduct, setLabelPrintProduct] = useState<any>(null);
  const [labelPrintQuantity, setLabelPrintQuantity] = useState(1);

  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [invoiceDateTime, setInvoiceDateTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);


  // Inventory State
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySearchDebounced, setInventorySearchDebounced] = useState("");
  const [customerSearchDebounced, setCustomerSearchDebounced] = useState("");
  const [posSearchDebounced, setPosSearchDebounced] = useState("");
  const [inventoryUnitFilter, setInventoryUnitFilter] = useState("");
  const [inventoryAvailableFilter, setInventoryAvailableFilter] = useState("all");
  const [posLimit, setPosLimit] = useState(100);
  const [inventoryLimit, setInventoryLimit] = useState(100);
  const [customerLimit, setCustomerLimit] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inventorySearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const lastInventoryEscPress = useRef(0);
  const lastCustomerEscPress = useRef(0);

  // Resize State for middle section
  const [middleHeight, setMiddleHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Selection state for upper grid
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  const lastEscPress = useRef<number>(0);

  // Debounce: delay filter calculations by 150ms to reduce lag on fast typing
  useEffect(() => {
    const t = setTimeout(() => setPosSearchDebounced(posSearch), 150);
    return () => clearTimeout(t);
  }, [posSearch]);

  useEffect(() => {
    const t = setTimeout(() => setInventorySearchDebounced(inventorySearch), 150);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  useEffect(() => {
    const t = setTimeout(() => setCustomerSearchDebounced(customerSearch), 150);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Reset pagination limits when filters or search queries change
  useEffect(() => {
    setPosLimit(100);
  }, [posSearchDebounced]);

  useEffect(() => {
    setInventoryLimit(100);
  }, [inventorySearchDebounced, inventoryUnitFilter, inventoryAvailableFilter]);

  useEffect(() => {
    setCustomerLimit(100);
  }, [customerSearchDebounced]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = middleHeight;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientY - dragStartY.current;
      const zFactor = zoom / 100;
      const maxH = (window.innerHeight / zFactor) * 0.75;
      setMiddleHeight(Math.max(150, Math.min(dragStartHeight.current + delta, maxH)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, zoom]);

  // refreshRef allows keydown effect to call refresh without circular dep ordering
  const refreshRef = useRef<() => Promise<void>>(async () => { });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (customAlert) {
          setCustomAlert(null);
          return;
        }
        if (customConfirm) {
          setCustomConfirm(null);
          return;
        }
        if (productToDelete) {
          setProductToDelete(null);
          return;
        }
        if (imageEditProduct) {
          setImageEditProduct(null);
          return;
        }
        if (editingProduct || isSystemModalOpen || isCustomerModalOpen || isPayDebtModalOpen || isAddDebtModalOpen || isPendingModalOpen || isCheckoutModalOpen) {
          setEditingProduct(null);
          setIsSystemModalOpen(false);
          setIsCustomerModalOpen(false);
          setIsPayDebtModalOpen(false);
          setIsAddDebtModalOpen(false);
          setIsPendingModalOpen(false);
          setIsCheckoutModalOpen(false);
          return;
        }
        const now = Date.now();
        if (activeTab === 'pos') {
          if (now - lastEscPress.current < 500) {
            setPosSearch("");
          } else {
            if (searchInputRef.current) {
              searchInputRef.current.focus();
              if (searchInputRef.current.value) {
                searchInputRef.current.select();
              }
            }
          }
          lastEscPress.current = now;
        } else if (activeTab === 'inventory') {
          if (now - lastInventoryEscPress.current < 500) {
            setInventorySearch("");
          } else {
            if (inventorySearchRef.current) {
              inventorySearchRef.current.focus();
              if (inventorySearchRef.current.value) {
                inventorySearchRef.current.select();
              }
            }
          }
          lastInventoryEscPress.current = now;
        } else if (activeTab === 'customers') {
          if (now - lastCustomerEscPress.current < 500) {
            setCustomerSearch("");
          } else {
            if (customerSearchRef.current) {
              customerSearchRef.current.focus();
              if (customerSearchRef.current.value) {
                customerSearchRef.current.select();
              }
            }
          }
          lastCustomerEscPress.current = now;
        }
      }

      if (e.key === 'F5') {
        e.preventDefault();
        refreshRef.current();
      }

      if (activeTab === 'pos') {
        const now = Date.now();
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          if (now - lastBarcodeKeyTime.current > 50) {
            barcodeBuffer.current = "";
          }
          barcodeBuffer.current += e.key;
          lastBarcodeKeyTime.current = now;
        } else if (e.key === 'Enter' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          if (now - lastBarcodeKeyTime.current < 50 && barcodeBuffer.current.length >= 1) {
            const testSku = barcodeBuffer.current;
            barcodeBuffer.current = "";
            const foundProduct = products.find(p => p.sku && p.sku.trim() !== "" && p.sku.trim().toLowerCase() === testSku.trim().toLowerCase());
            if (foundProduct) {
              setCart(prev => {
                const existingIdx = prev.findIndex(item => item.product.id === foundProduct.id);
                if (existingIdx >= 0) {
                  const newCart = [...prev];
                  newCart[existingIdx].quantity += 1;
                  return newCart;
                }
                return [...prev, { product: foundProduct, quantity: 1, discount: 0 }];
              });
              setPosSearch("");
            } else {
              showAlert(`Không tìm thấy sản phẩm với mã vạch: ${testSku}`, "Lỗi quét mã", "error");
            }
            e.preventDefault();
            return;
          }
          barcodeBuffer.current = "";
        } else if (e.key !== 'Shift') {
          barcodeBuffer.current = "";
        }

        if (e.key === 'F1') {
          e.preventDefault();
          handleSaveTemporary();
        }
        if (e.key === 'F2') {
          e.preventDefault();
          handleCheckout();
        }
        if (e.key === 'F3') {
          e.preventDefault();
          handleSellOnDebt();
        }
        if (e.key === 'F9') {
          e.preventDefault();
          setIsPendingModalOpen(true);
        }
        if (e.key === 'Delete' && selectedCartIndex !== null && document.activeElement?.tagName !== 'INPUT') {
          setCart(prev => prev.filter((_, i) => i !== selectedCartIndex));
          setSelectedCartIndex(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedCartIndex, editingProduct, isSystemModalOpen, isCustomerModalOpen, isPayDebtModalOpen, isAddDebtModalOpen, isPendingModalOpen, isCheckoutModalOpen, cart, invoiceNo, selectedCustomer, posNotes, customers, customAlert, customConfirm, productToDelete, imageEditProduct, products, showAlert]);
  const loadDataFromMSSQL = async (serverVal = mssqlServer, dbVal = mssqlDbName, userVal = mssqlUser, passVal = mssqlPass) => {
    if (!serverVal || !userVal) {
      setProducts([]);
      setCustomers([]);
      return;
    }
    try {
      const rawProds = await tauriInvoke("fetch_products_db", {
        server: serverVal,
        dbName: dbVal,
        user: userVal,
        pass: passVal
      }) as string;
      const parsedProds = JSON.parse(rawProds);
      if (Array.isArray(parsedProds)) {
        setProducts(parsedProds);
      } else {
        setProducts([]);
      }

      const rawCusts = await tauriInvoke("fetch_customers_db", {
        server: serverVal,
        dbName: dbVal,
        user: userVal,
        pass: passVal
      }) as string;
      const parsedCusts = JSON.parse(rawCusts);
      if (Array.isArray(parsedCusts)) {
        setCustomers(parsedCusts);
        if (parsedCusts.length > 0) {
          setSelectedCustomer(prev => {
            const exists = parsedCusts.find(c => c.id === prev.id);
            if (exists) {
              setCustomerSearchQuery(exists.name);
              return exists;
            }
            setCustomerSearchQuery(parsedCusts[0].name);
            return parsedCusts[0];
          });
        }
      } else {
        setCustomers([]);
      }
    } catch (err) {
      console.warn("Could not connect to MSSQL, fallback to empty/default arrays:", err);
      setProducts([]);
      setCustomers([]);
    }
  };

  const loadInvoicesFromDB = useCallback(async () => {
    if (!mssqlServer) return;
    setLoadingInvoices(true);
    try {
      const dataStr = await tauriInvoke("fetch_invoices_db", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass,
        fromDate: invoiceFromDate,
        toDate: invoiceToDate,
        customerQuery: invoiceCustomerQuery,
        invoiceCodeQuery: invoiceCodeQuery
      });
      const data = JSON.parse(dataStr);
      setInvoicesList(data);
    } catch (err: any) {
      console.error(err);
      showAlert("Lỗi khi tải danh sách hóa đơn từ CSDL: " + err.toString(), "Lỗi", "error");
    } finally {
      setLoadingInvoices(false);
    }
  }, [mssqlServer, mssqlDbName, mssqlUser, mssqlPass, invoiceFromDate, invoiceToDate, invoiceCustomerQuery, invoiceCodeQuery, showAlert]);

  const loadInvoiceDetailsFromDB = useCallback(async (invoiceId: number) => {
    try {
      const dataStr = await tauriInvoke("fetch_invoice_details_db", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass,
        invoiceId: invoiceId
      });
      const data = JSON.parse(dataStr);
      setSelectedInvoiceDetails(data);
    } catch (err: any) {
      console.error(err);
      showAlert("Lỗi khi tải chi tiết hóa đơn: " + err.toString(), "Lỗi", "error");
    }
  }, [mssqlServer, mssqlDbName, mssqlUser, mssqlPass, showAlert]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (activeTab === 'invoices') {
        await loadInvoicesFromDB();
      } else {
        await loadDataFromMSSQL();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, isRefreshing, loadInvoicesFromDB]);

  // Keep ref in sync so keydown effect can call refresh without it being in dep array
  useEffect(() => {
    refreshRef.current = handleRefresh;
  }, [handleRefresh]);

  const printViaNetwork = async (
    invoiceNo: string,
    dateTimeStr: string,
    customerName: string,
    customerPhone: string,
    notes: string,
    items: Array<{ productName: string; quantity: number; price: number; total: number }>,
    baseTotal: number,
    discountTotal: number,
    invoiceDiscountPercent: number,
    finalTotal: number,
    isReprint: boolean = false
  ) => {
    if (!networkPrinterIp) {
      alert("Chưa cấu hình địa chỉ IP máy in mạng! Hãy vào mục Cài đặt để thiết lập.");
      return;
    }
    try {
      const payload = formatReceiptForNetworkPrinter(
        shopName,
        shopAddress,
        shopPhone,
        isReprint,
        invoiceNo,
        dateTimeStr,
        customerName,
        customerPhone,
        notes,
        items,
        baseTotal,
        discountTotal,
        invoiceDiscountPercent,
        finalTotal
      );
      const res = await tauriInvoke("print_bill_network", { ip: networkPrinterIp, payload });
      console.log("Kết quả in hóa đơn mạng:", res);
    } catch (err: any) {
      alert("Lỗi kết nối hoặc gửi lệnh tới máy in mạng: " + err.toString());
    }
  };

  const printLabelViaNetwork = async (productName: string, price: number, quantity: number, sku?: string) => {
    if (!labelNetworkPrinterIp) {
      alert(labelPrintMethod === "usb" ? "Chưa cấu hình tên máy in tem USB! Hãy vào mục Cài đặt để thiết lập." : "Chưa cấu hình địa chỉ IP máy in tem mạng! Hãy vào mục Cài đặt để thiết lập.");
      return;
    }
    try {
      const payload = formatLabelForNetworkPrinter(productName, price, shopName, sku, quantity);
      if (labelPrintMethod === "usb") {
        const res = await tauriInvoke("print_raw_usb", { printerName: labelNetworkPrinterIp, payload: Array.from(payload) });
        console.log("Kết quả in tem USB:", res);
      } else {
        const res = await tauriInvoke("print_raw_network", { ip: labelNetworkPrinterIp, payload: Array.from(payload) });
        console.log("Kết quả in tem mạng:", res);
      }
      alert(`Đã gửi lệnh in ${quantity} tem thành công!`);
    } catch (err: any) {
      alert("Lỗi kết nối hoặc gửi lệnh tới máy in tem: " + err.toString());
    }
  };

  const handleReprint = useCallback(() => {
    if (!selectedInvoice) return;
    const baseTotal = selectedInvoiceDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemDiscountTotal = selectedInvoiceDetails.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0) / 100), 0);
    const invoiceDiscountAmt = selectedInvoice.TienKhuyenMai || 0;
    const finalTotal = selectedInvoice.TongTien;

    setPrintJob({
      invoiceNo: selectedInvoice.MaHoaDon,
      dateTimeStr: `${selectedInvoice.NgayHDStr} ${selectedInvoice.GioHDStr}`,
      customerName: selectedInvoice.TenKhachHang,
      customerPhone: selectedInvoice.DienThoaiKH,
      notes: selectedInvoice.GhiChu,
      items: selectedInvoiceDetails.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        total: item.total
      })),
      baseTotal: baseTotal,
      discountTotal: itemDiscountTotal + invoiceDiscountAmt,
      finalTotal: finalTotal,
      invoiceDiscountPercent: selectedInvoice.PTKhuyenMai
    });
  }, [selectedInvoice, selectedInvoiceDetails]);

  useEffect(() => {
    if (printJob) {
      if (printMethod === "network") {
        printViaNetwork(
          printJob.invoiceNo,
          printJob.dateTimeStr,
          printJob.customerName,
          printJob.customerPhone,
          printJob.notes,
          printJob.items,
          printJob.baseTotal,
          printJob.discountTotal,
          printJob.invoiceDiscountPercent,
          printJob.finalTotal,
          true
        );
        setPrintJob(null);
      } else {
        const timer = setTimeout(() => {
          window.print();
          setPrintJob(null);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [printJob, printMethod, networkPrinterIp]);

  const handleMouseDownInvWidth = (e: React.MouseEvent) => {
    setIsDraggingInvWidth(true);
    dragStartInvX.current = e.clientX;
    dragStartInvWidth.current = invoiceDetailWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingInvWidth) return;
      const delta = dragStartInvX.current - e.clientX;
      const zFactor = zoom / 100;
      const newWidth = dragStartInvWidth.current + (delta / zFactor);
      setInvoiceDetailWidth(Math.max(350, Math.min(newWidth, 900)));
    };

    const handleMouseUp = () => {
      setIsDraggingInvWidth(false);
    };

    if (isDraggingInvWidth) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingInvWidth, zoom]);

  useEffect(() => {
    if (activeTab === "invoices") {
      loadInvoicesFromDB();
    }
  }, [activeTab, invoiceFromDate, invoiceToDate, invoiceCustomerQuery, invoiceCodeQuery, loadInvoicesFromDB]);

  useEffect(() => {
    if (editingProduct) {
      setEditForm({
        sku: editingProduct.sku,
        name: editingProduct.name,
        unit: editingProduct.unit,
        price: editingProduct.price,
        price2: editingProduct.price2 || 0,
        link: editingProduct.link || "",
        available: editingProduct.available !== false,
      });
    } else {
      setEditForm(null);
    }
  }, [editingProduct]);

  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    const loadSettingsOnInit = async () => {
      try {
        const path = await tauriInvoke("get_config_path") as string;
        setConfigFilePath(path);

        const rawSettings = await tauriInvoke("load_settings") as string;
        const settings = JSON.parse(rawSettings);
        if (settings.zoom) {
          setZoom(settings.zoom);
          setTempZoom(settings.zoom);
        }
        const sServer = settings.mssqlServer || "";
        const sDb = settings.mssqlDbName || "tiemdiennuoc";
        const sUser = settings.mssqlUser || "";
        const sPass = settings.mssqlPass || "";
        const sShopName = settings.shopName || "Điện nước Tâm Nhi";
        const sShopAddress = settings.shopAddress || "Khu phố 3, TT. Củ Chi, Củ Chi, TP.HCM";
        const sShopPhone = settings.shopPhone || "0908 123 456";
        const sGasUrl = settings.gasUrl || "";
        const sGasToken = settings.gasToken || "tiem_dien_nuoc_secret_key_2026";
        const sIphoneSessionId = settings.iphoneSessionId || `sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const sPrintMethod = settings.printMethod || "browser";
        const sNetworkPrinterIp = settings.networkPrinterIp || "";
        const sLabelPrintMethod = settings.labelPrintMethod || "browser";
        const sLabelNetworkPrinterIp = settings.labelNetworkPrinterIp || "";
        const sCustomScanIp = settings.customScanIp || "";
        const sCustomScanPort = settings.customScanPort || "";

        if (sServer) setMssqlServer(sServer);
        if (sDb) setMssqlDbName(sDb);
        if (sUser) setMssqlUser(sUser);
        if (sPass) setMssqlPass(sPass);
        setShopName(sShopName);
        setShopAddress(sShopAddress);
        setShopPhone(sShopPhone);
        setGasUrl(sGasUrl);
        setGasToken(sGasToken);
        setIphoneSessionId(sIphoneSessionId);
        setPrintMethod(sPrintMethod);
        setNetworkPrinterIp(sNetworkPrinterIp);
        setLabelPrintMethod(sLabelPrintMethod);
        setLabelNetworkPrinterIp(sLabelNetworkPrinterIp);
        setCustomScanIp(sCustomScanIp);
        setCustomScanPort(sCustomScanPort);

        await loadDataFromMSSQL(sServer, sDb, sUser, sPass);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setProducts([]);
      }
    };
    loadSettingsOnInit();
  }, []);

  useEffect(() => {
    document.documentElement.style.zoom = '100%';
    const appEl = appContainerRef.current;
    if (appEl) {
      const zFactor = zoom / 100;
      appEl.style.zoom = zFactor.toString();
      appEl.style.width = `calc(100vw / ${zFactor})`;
      appEl.style.height = `calc(100vh / ${zFactor})`;
    }
  }, [zoom]);

  useEffect(() => {
    if (isSystemModalOpen) {
      setTempZoom(zoom);
      setMssqlTestResult(null);
      setDbLocked(true);
    }
  }, [isSystemModalOpen, zoom]);

  const handleScanPrinters = async (target: 'receipt' | 'label') => {
    setScanningTarget(target);
    setLastScanTarget(target);
    setScannedPrinters([]);
    setIsScanModalOpen(true);
    try {
      if (target === 'receipt') {
        let parsedIp: string | null = customScanIp.trim() || null;
        let parsedPort: string | null = customScanPort.trim() || null;
        const result = await tauriInvoke("scan_network_printers", { customIp: parsedIp, customPort: parsedPort }) as string[];
        setScannedPrinters(result);
      } else {
        const result = await tauriInvoke("get_usb_printers") as string[];
        setScannedPrinters(result);
      }
      setIsScanModalOpen(true);
    } catch (err: any) {
      alert("Lỗi khi quét máy in: " + err.toString());
      setIsScanModalOpen(false);
    } finally {
      setScanningTarget(null);
    }
  };

  const handleTestPrintNetwork = async () => {
    if (!networkPrinterIp) {
      alert("Vui lòng nhập IP máy in mạng trước!");
      return;
    }
    try {
      const testPayload = formatReceiptForNetworkPrinter(
        shopName,
        shopAddress,
        shopPhone,
        false,
        "TEST-0001",
        getFormattedDate(new Date()) + " " + getFormattedTime(new Date()),
        "KHACH TEST MAY IN",
        "0999888777",
        "In kiem tra thiet bi",
        [
          { productName: "San pham in thu 1", quantity: 1, price: 50000, total: 50000 },
          { productName: "San pham in thu 2 Cadivi", quantity: 2, price: 15000, total: 30000 }
        ],
        80000,
        0,
        0,
        80000
      );
      const res = await tauriInvoke("print_bill_network", { ip: networkPrinterIp, payload: testPayload });
      alert("Lệnh in thử đã được gửi: " + res);
    } catch (err: any) {
      alert("Lỗi in thử: " + err.toString());
    }
  };

  const handleTestPrintLabelNetwork = async () => {
    if (!labelNetworkPrinterIp) {
      alert(labelPrintMethod === "usb" ? "Vui lòng nhập/chọn tên máy in tem USB trước!" : "Vui lòng nhập IP máy in tem mạng trước!");
      return;
    }
    try {
      const testPayload = formatLabelForNetworkPrinter("San pham tem thu (Test)", 99000, shopName, "TEST1234", 2);
      if (labelPrintMethod === "usb") {
        const res = await tauriInvoke("print_raw_usb", { printerName: labelNetworkPrinterIp, payload: Array.from(testPayload) });
        alert("Lệnh in tem thử USB đã được gửi: " + res);
      } else {
        const res = await tauriInvoke("print_raw_network", { ip: labelNetworkPrinterIp, payload: Array.from(testPayload) });
        alert("Lệnh in tem thử mạng đã được gửi: " + res);
      }
    } catch (err: any) {
      alert("Lỗi in thử tem: " + err.toString());
    }
  };

  const handleSaveSettings = async () => {
    try {
      const settingsObj = {
        zoom: tempZoom,
        mssqlServer,
        mssqlDbName,
        mssqlUser,
        mssqlPass,
        shopName,
        shopAddress,
        shopPhone,
        gasUrl,
        gasToken,
        iphoneSessionId,
        printMethod,
        networkPrinterIp,
        labelPrintMethod,
        labelNetworkPrinterIp,
        customScanIp,
        customScanPort
      };
      await tauriInvoke("save_settings", { settings: JSON.stringify(settingsObj) });
      setZoom(tempZoom);
      setIsSystemModalOpen(false);
      setMssqlTestResult(null);
      await loadDataFromMSSQL(mssqlServer, mssqlDbName, mssqlUser, mssqlPass);
      alert("Đã lưu thành công");
    } catch (err: any) {
      alert("Lỗi khi lưu cấu hình: " + err.toString());
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setMssqlTestResult(null);
    try {
      const res = await tauriInvoke("test_mssql_connection", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass
      });
      setMssqlTestResult({ success: true, msg: res });
    } catch (err: any) {
      setMssqlTestResult({ success: false, msg: err.toString() });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleOpenConfigFolder = async () => {
    try {
      await tauriInvoke("open_config_folder");
    } catch (err: any) {
      alert("Không thể mở thư mục cấu hình: " + err.toString());
    }
  };

  const handleBackupDatabase = async () => {
    if (!mssqlServer || !mssqlDbName || !mssqlUser) {
      alert("Vui lòng cấu hình đầy đủ thông tin kết nối CSDL trước khi backup!");
      return;
    }

    setCustomConfirm({
      title: "Xác nhận sao lưu",
      message: `Bạn có chắc chắn muốn sao lưu cơ sở dữ liệu "${mssqlDbName}"?\nTên file sao lưu sẽ có dạng yyyyMMdd_${mssqlDbName}.bak và được lưu ở thư mục chứa setting.json.`,
      onConfirm: async () => {
        try {
          const res = await tauriInvoke("backup_database", {
            server: mssqlServer,
            dbName: mssqlDbName,
            user: mssqlUser,
            pass: mssqlPass
          });
          alert(res);
        } catch (err: any) {
          alert("Lỗi sao lưu database: " + err.toString());
        }
      }
    });
  };

  const handleFixInit = async () => {
    if (!mssqlServer || !mssqlDbName || !mssqlUser) {
      alert("Vui lòng cấu hình đầy đủ thông tin kết nối CSDL trước khi fix init!");
      return;
    }
    try {
      const res = await tauriInvoke("fix_init_db", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass
      });
      alert(res);
      await loadDataFromMSSQL(mssqlServer, mssqlDbName, mssqlUser, mssqlPass);
    } catch (err: any) {
      alert("Lỗi sửa cấu trúc CSDL (Fix Init): " + err.toString());
    }
  };

  useEffect(() => {
    if (editingProduct || isSystemModalOpen || isCustomerModalOpen || isPayDebtModalOpen || isPendingModalOpen || isCheckoutModalOpen || isUnitManagerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [editingProduct, isSystemModalOpen, isCustomerModalOpen, isPayDebtModalOpen, isPendingModalOpen, isCheckoutModalOpen, isUnitManagerOpen]);

  const getCartBaseTotal = () => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  };

  const getCartDiscountTotal = () => {
    return cart.reduce((sum, item) => {
      const amount = item.product.price * item.quantity;
      const discount = item.discount || 0;
      return sum + amount * (discount / 100);
    }, 0);
  };

  const getCartFinalTotal = () => {
    return getCartBaseTotal() - getCartDiscountTotal();
  };

  const saveProductToDbOnly = useCallback((p: Product) => {
    if (mssqlServer && mssqlUser) {
      tauriInvoke("save_product_db", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass,
        product: JSON.stringify({
          id: Number(p.id) || 0,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          price: p.price,
          price2: p.price2 || 0,
          cost: 0,
          stock: p.stock,
          available: p.available !== false,
          link: p.link || ""
        })
      }).catch((err: any) => {
        console.error("Lỗi khi lưu mặt hàng: " + err.toString());
      });
    }
  }, [mssqlServer, mssqlUser, mssqlDbName, mssqlPass]);

  const saveCustomerToDbOnly = useCallback((c: Customer) => {
    if (mssqlServer && mssqlUser) {
      const today = new Date();
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      tauriInvoke("save_customer_db", {
        server: mssqlServer,
        dbName: mssqlDbName,
        user: mssqlUser,
        pass: mssqlPass,
        customer: JSON.stringify({
          id: c.id,
          name: c.name,
          phone: c.phone,
          address: c.address,
          debt: c.debt
        }),
        month,
        year
      }).catch((err: any) => {
        console.error("Lỗi khi lưu khách hàng: " + err.toString());
      });
    }
  }, [mssqlServer, mssqlUser, mssqlDbName, mssqlPass]);

  const updateProductField = useCallback((productId: string, field: keyof Product, value: any, saveToDb = false) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const updated = { ...p, [field]: value };
        if (saveToDb) {
          saveProductToDbOnly(updated);
        }
        return updated;
      }
      return p;
    }));
    setSelectedProduct(prevSel => {
      if (prevSel?.id === productId) {
        return { ...prevSel, [field]: value };
      }
      return prevSel;
    });
  }, [saveProductToDbOnly]);

  const updateCustomerField = useCallback((customerId: string, field: keyof Customer, value: any, saveToDb = false) => {
    setCustomers(prev => prev.map(c => {
      if (c.id === customerId) {
        const updated = { ...c, [field]: value };
        if (saveToDb) {
          saveCustomerToDbOnly(updated);
        }
        return updated;
      }
      return c;
    }));
  }, [saveCustomerToDbOnly]);

  const handleAddUnitInline = () => {
    if (!newUnitName || !newUnitName.trim()) {
      alert("Vui lòng nhập tên ĐVT!");
      return;
    }
    const unitTrim = newUnitName.trim();
    if (units.includes(unitTrim)) {
      alert("ĐVT này đã tồn tại!");
      return;
    }
    setUnits(prev => [...prev, unitTrim]);
    setNewUnitName("");
  };

  const handleRenameUnitInline = (oldName: string) => {
    const newName = prompt(`Nhập tên mới cho ĐVT "${oldName}":`, oldName);
    if (!newName || !newName.trim()) return;
    const newNameTrim = newName.trim();
    if (newNameTrim === oldName) return;
    if (units.includes(newNameTrim)) {
      alert("ĐVT mới này đã tồn tại!");
      return;
    }

    // Update units list
    setUnits(prev => prev.map(u => u === oldName ? newNameTrim : u));

    // Update all products belonging to the old unit
    setProducts(prev => prev.map(p => p.unit === oldName ? { ...p, unit: newNameTrim } : p));

    // Update selected filter if active
    if (selectedUnitFilter === oldName) {
      setSelectedUnitFilter(newNameTrim);
    }
    if (inventoryUnitFilter === oldName) {
      setInventoryUnitFilter(newNameTrim);
    }

    alert(`Đã đổi tên ĐVT thành "${newNameTrim}" thành công!`);
  };

  const handleDeleteUnitInline = (unitToDelete: string) => {
    // Count products using this unit
    const productCount = products.filter(p => p.unit === unitToDelete).length;
    let confirmMsg = `Bạn có chắc muốn xóa ĐVT "${unitToDelete}"?`;
    if (productCount > 0) {
      confirmMsg = `ĐVT "${unitToDelete}" đang được sử dụng cho ${productCount} mặt hàng. Nếu xóa, các mặt hàng này sẽ được chuyển sang ĐVT "Cái". Bạn vẫn muốn xóa?`;
    }

    if (confirm(confirmMsg)) {
      // Remove from units list
      setUnits(prev => prev.filter(u => u !== unitToDelete));

      // Update products' unit
      setProducts(prev => prev.map(p => p.unit === unitToDelete ? { ...p, unit: "Cái" } : p));

      // Add "Cái" to units if not already present
      setUnits(prev => {
        if (!prev.includes("Cái")) {
          return [...prev, "Cái"];
        }
        return prev;
      });

      // Reset filters if they were set to the deleted unit
      if (selectedUnitFilter === unitToDelete) {
        setSelectedUnitFilter("");
      }
      if (inventoryUnitFilter === unitToDelete) {
        setInventoryUnitFilter("");
      }

      alert(`Đã xóa ĐVT "${unitToDelete}" thành công.`);
    }
  };

  const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let col = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            col += '"';
            i++; // Skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          col += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(col);
          col = "";
        } else if (char === '\r' || char === '\n') {
          row.push(col);
          col = "";
          if (row.some(c => c.trim() !== "")) {
            result.push(row);
          }
          row = [];
          if (char === '\r' && nextChar === '\n') {
            i++; // Skip LF if CRLF
          }
        } else {
          col += char;
        }
      }
    }
    if (col !== "" || row.length > 0) {
      row.push(col);
      if (row.some(c => c.trim() !== "")) {
        result.push(row);
      }
    }
    return result;
  };

  const handleExportCSV = async () => {
    const headers = ["Mã hàng", "Tên M.Hàng", "ĐVT", "Đơn giá", "Đơn giá 2", "Kho", "Hình ảnh", "Còn bán"];
    const rows = products.map(p => [
      p.sku,
      p.name,
      p.unit,
      p.price.toString(),
      (p.price2 || 0).toString(),
      p.stock.toString(),
      p.link || "",
      p.available !== false ? "1" : "0"
    ]);
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    try {
      const savedPath = await tauriInvoke("save_file_to_downloads", {
        fileName: `danh_sach_san_pham_${new Date().toISOString().slice(0, 10)}.csv`,
        content: csvContent
      });
      showAlert(`Đã xuất file thành công tại thư mục Downloads:\n${savedPath}`, "Xuất file", "info");
    } catch (err: any) {
      showAlert(`Lỗi xuất file: ${err.toString()}`, "Lỗi", "error");
    }
  };

  const handleDownloadTemplate = async () => {
    const headers = ["Mã hàng", "Tên M.Hàng", "ĐVT", "Đơn giá", "Đơn giá 2", "Kho", "Hình ảnh", "Còn bán"];
    const sampleRow = ["P001", "Ong nuoc Tien Phong", "Cuộn", "50000", "46000", "10", "https://example.com/image.jpg", "1"];
    const csvContent = "\uFEFF" + [
      headers.join(","),
      sampleRow.map(val => `"${val.replace(/"/g, '""')}"`).join(",")
    ].join("\n");

    try {
      const savedPath = await tauriInvoke("save_file_to_downloads", {
        fileName: `template_import_san_pham.csv`,
        content: csvContent
      });
      showAlert(`Đã tải file mẫu thành công tại thư mục Downloads:\n${savedPath}`, "Tải file mẫu", "info");
    } catch (err: any) {
      showAlert(`Lỗi tải file mẫu: ${err.toString()}`, "Lỗi", "error");
    }
  };

  const triggerImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const parsedRows = parseCSV(text);
      if (parsedRows.length <= 1) {
        alert("Tệp CSV rỗng hoặc không có dữ liệu!");
        return;
      }

      const headers = parsedRows[0].map(h => h.trim().toLowerCase());
      const skuIdx = headers.indexOf("mã hàng");
      const nameIdx = headers.indexOf("tên m.hàng");
      const unitIdx = headers.indexOf("đvt");
      const priceIdx = headers.indexOf("đơn giá");
      const stockIdx = headers.indexOf("kho");
      const linkIdx = headers.indexOf("hình ảnh");
      const availableIdx = headers.indexOf("còn bán");

      if (skuIdx === -1 || nameIdx === -1) {
        alert("File CSV không đúng định dạng. Cần có ít nhất cột 'Mã hàng' và 'Tên M.Hàng'!");
        return;
      }

      let addedCount = 0;
      let updatedCount = 0;
      const importedProducts = [...products];
      const newlyDiscoveredUnits = new Set<string>();

      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        if (row.length === 0) continue;

        const sku = row[skuIdx]?.trim();
        const name = row[nameIdx]?.trim();

        if (!sku || !name) continue;

        const unit = unitIdx !== -1 ? row[unitIdx]?.trim() || "Cái" : "Cái";
        const price = priceIdx !== -1 ? Number(row[priceIdx]) || 0 : 0;
        const stock = stockIdx !== -1 ? Number(row[stockIdx]) || 0 : 0;
        const link = linkIdx !== -1 ? row[linkIdx]?.trim() || "" : "";

        let available = true;
        if (availableIdx !== -1) {
          const val = row[availableIdx]?.trim().toLowerCase();
          available = val === "1" || val === "true" || val === "còn bán" || val === "";
        }

        // Add unit to discovered list if not already in global list
        if (unit && !units.includes(unit)) {
          newlyDiscoveredUnits.add(unit);
        }

        const existingIdx = importedProducts.findIndex(p => p.sku.toLowerCase() === sku.toLowerCase());
        if (existingIdx !== -1) {
          // Update existing
          importedProducts[existingIdx] = {
            ...importedProducts[existingIdx],
            name,
            unit,
            price,
            stock,
            link,
            available
          };
          updatedCount++;
        } else {
          // Add new
          const newId = (Math.max(...importedProducts.map(p => Number(p.id) || 0)) + 1).toString();
          importedProducts.push({
            id: newId,
            sku,
            name,
            unit,
            price,
            cost: 0,
            stock,
            link,
            available,
            category: "Khác"
          });
          addedCount++;
        }
      }

      setProducts(importedProducts);

      if (newlyDiscoveredUnits.size > 0) {
        setUnits(prev => {
          const combined = [...prev];
          newlyDiscoveredUnits.forEach(u => {
            if (!combined.includes(u)) {
              combined.push(u);
            }
          });
          return combined;
        });
      }

      alert(`Nhập dữ liệu thành công!\n- Thêm mới: ${addedCount} mặt hàng\n- Cập nhật: ${updatedCount} mặt hàng`);
    };
    reader.readAsText(file, "UTF-8");
  };

  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === p.id);
      if (existing) {
        return prev.map(c => c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };



  // Memoized filtered lists — only recompute when dependencies change
  const posFilteredProducts = useMemo(() => {
    const lowerSearch = removeAccents(posSearchDebounced.toLowerCase());
    return products.filter(p => {
      const nameNorm = removeAccents(p.name.toLowerCase());
      const skuNorm = removeAccents(p.sku.toLowerCase());
      return nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch);
    });
  }, [products, posSearchDebounced]);

  const inventoryFilteredProducts = useMemo(() => {
    const lowerSearch = removeAccents(inventorySearchDebounced.toLowerCase());
    return products.filter(p => {
      const matchesUnit = !inventoryUnitFilter || p.unit === inventoryUnitFilter;
      let matchesAvailable = true;
      if (inventoryAvailableFilter === "active") {
        matchesAvailable = p.available !== false;
      } else if (inventoryAvailableFilter === "inactive") {
        matchesAvailable = p.available === false;
      }
      const nameNorm = removeAccents(p.name.toLowerCase());
      const skuNorm = removeAccents(p.sku.toLowerCase());
      return matchesUnit && matchesAvailable && (nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch));
    });
  }, [products, inventorySearchDebounced, inventoryUnitFilter, inventoryAvailableFilter]);

  const filteredCustomers = useMemo(() => {
    const query = removeAccents(customerSearchDebounced.toLowerCase());
    return customers.filter(c => {
      const nameNorm = removeAccents(c.name.toLowerCase());
      return nameNorm.includes(query) || c.phone.includes(query);
    });
  }, [customers, customerSearchDebounced]);

  const handleSearchSubmit = () => {
    const lowerSearch = removeAccents(posSearch.toLowerCase());
    const match = products.find(p => {
      const nameNorm = removeAccents(p.name.toLowerCase());
      const skuNorm = removeAccents(p.sku.toLowerCase());
      return nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch);
    });
    if (match && match.available !== false) {
      addToCart(match);
      setPosSearch("");
    }
  };

  const handleSaveProductEdit = async () => {
    if (!editingProduct || !editForm) return;

    if (editingProduct.id === "NEW") {
      // Adding a new product
      if (!editForm.name.trim()) {
        alert("Tên mặt hàng không được để trống!");
        return;
      }
      if (!editForm.sku.trim()) {
        alert("Mã hàng không được để trống!");
        return;
      }
      // Check if SKU already exists
      if (products.some(p => p.sku.toLowerCase() === editForm.sku.toLowerCase())) {
        alert(`Mã hàng "${editForm.sku}" đã tồn tại!`);
        return;
      }

      let newId = (Math.max(...products.map(p => Number(p.id) || 0)) + 1).toString();

      const newProd: Product = {
        id: newId,
        sku: editForm.sku,
        name: editForm.name,
        category: "Khác",
        price: editForm.price,
        price2: editForm.price2,
        cost: 0,
        stock: 0,
        unit: editForm.unit,
        link: editForm.link,
        available: editForm.available !== false,
      };

      if (mssqlServer && mssqlUser) {
        try {
          const dbId = await tauriInvoke("save_product_db", {
            server: mssqlServer,
            dbName: mssqlDbName,
            user: mssqlUser,
            pass: mssqlPass,
            product: JSON.stringify({
              id: 0,
              sku: editForm.sku,
              name: editForm.name,
              unit: editForm.unit,
              price: editForm.price,
              price2: editForm.price2 || 0,
              cost: 0,
              stock: 0,
              available: editForm.available !== false,
              link: editForm.link || ""
            })
          }) as string;
          if (dbId) {
            newProd.id = dbId;
          }
        } catch (err: any) {
          alert("Lỗi lưu mặt hàng vào CSDL: " + err.toString());
          return;
        }
      }

      setProducts(prev => [...prev, newProd]);
      alert(`Đã thêm mặt hàng "${editForm.name}" thành công.`);
    } else {
      // Editing existing product
      if (mssqlServer && mssqlUser) {
        try {
          await tauriInvoke("save_product_db", {
            server: mssqlServer,
            dbName: mssqlDbName,
            user: mssqlUser,
            pass: mssqlPass,
            product: JSON.stringify({
              id: Number(editingProduct.id) || 0,
              sku: editForm.sku,
              name: editForm.name,
              unit: editForm.unit,
              price: editForm.price,
              price2: editForm.price2 || 0,
              cost: 0,
              stock: 0,
              available: editForm.available !== false,
              link: editForm.link || ""
            })
          });
        } catch (err: any) {
          alert("Lỗi lưu mặt hàng vào CSDL: " + err.toString());
          return;
        }
      }

      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...editForm } : p));

      if (selectedProduct && selectedProduct.id === editingProduct.id) {
        setSelectedProduct(prev => prev ? { ...prev, ...editForm } : null);
      }

      setCart(prev => prev.map(item => {
        if (item.product.id === editingProduct.id) {
          return {
            ...item,
            product: { ...item.product, ...editForm }
          };
        }
        return item;
      }));
      alert(`Đã sửa mặt hàng "${editForm.name}" thành công.`);
    }

    setEditingProduct(null);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const p = productToDelete;
    if (mssqlServer && mssqlUser) {
      try {
        await tauriInvoke("delete_product_db", {
          server: mssqlServer,
          dbName: mssqlDbName,
          user: mssqlUser,
          pass: mssqlPass,
          id: Number(p.id) || 0
        });
      } catch (err: any) {
        showAlert("Lỗi khi xóa mặt hàng khỏi CSDL: " + err.toString(), "Lỗi", "error");
        setProductToDelete(null);
        return;
      }
    }
    if (p.link) {
      deleteGoogleDriveImage(p.link);
    }
    setProducts(prev => prev.filter(item => item.id !== p.id));
    if (selectedProduct?.id === p.id) {
      setSelectedProduct(null);
    }
    showAlert(`Đã xóa mặt hàng "${p.name}" thành công.`, "Thành công", "info");
    setProductToDelete(null);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (target.src.includes("lh3.googleusercontent.com/d/")) {
      const parts = target.src.split("/d/");
      const fileId = parts[parts.length - 1];
      target.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
    } else if (target.src.includes("drive.google.com/uc?export=view")) {
      try {
        const urlParams = new URLSearchParams(new URL(target.src).search);
        const fileId = urlParams.get("id");
        if (fileId) {
          target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
        }
      } catch (err) {
        console.error("Lỗi parse URL trong handleImageError:", err);
      }
    }
  };

  const handleImagePanelWheel = (e: React.WheelEvent) => {
    setPosImageWidth(prev => {
      const delta = e.deltaY < 0 ? 15 : -15;
      const newWidth = prev + delta;
      return Math.max(100, Math.min(600, newWidth));
    });
  };

  const deleteGoogleDriveImage = async (imageUrl: string) => {
    if (!imageUrl || !gasUrl || !gasToken) return;
    const isGoogleDriveLink = imageUrl.includes("googleusercontent.com") || imageUrl.includes("drive.google.com");
    if (!isGoogleDriveLink) return;

    try {
      const deleteUrl = `${gasUrl}?action=delete&token=${gasToken}&url=${encodeURIComponent(imageUrl)}`;
      const resStr: string = await tauriInvoke("delete_drive_image_rust", { deleteUrl });
      console.log("Kết quả xóa ảnh trên Drive từ Rust:", resStr);
    } catch (err) {
      console.error("Lỗi khi gửi yêu cầu xóa ảnh trên Drive qua Rust:", err);
    }
  };

  const handleSaveProductImage = async () => {
    if (!imageEditProduct) return;
    const p = imageEditProduct;
    const updatedProduct = { ...p, link: imageEditLink };

    if (mssqlServer && mssqlUser) {
      try {
        await tauriInvoke("save_product_db", {
          server: mssqlServer,
          dbName: mssqlDbName,
          user: mssqlUser,
          pass: mssqlPass,
          product: JSON.stringify({
            id: Number(updatedProduct.id) || 0,
            sku: updatedProduct.sku,
            name: updatedProduct.name,
            unit: updatedProduct.unit,
            price: updatedProduct.price,
            price2: updatedProduct.price2 || 0,
            cost: 0,
            stock: updatedProduct.stock,
            available: updatedProduct.available !== false,
            link: imageEditLink || ""
          })
        });
      } catch (err: any) {
        showAlert("Lỗi lưu hình ảnh mặt hàng vào CSDL: " + err.toString(), "Lỗi", "error");
        return;
      }
    }

    if (p.link && imageEditLink !== p.link) {
      deleteGoogleDriveImage(p.link);
    }

    // Delete any other discarded session images (that weren't saved)
    sessionUploadedImages.forEach(url => {
      if (url !== imageEditLink) {
        deleteGoogleDriveImage(url);
      }
    });
    setSessionUploadedImages([]);

    setProducts(prev => prev.map(item => item.id === p.id ? updatedProduct : item));
    if (selectedProduct?.id === p.id) {
      setSelectedProduct(updatedProduct);
    }
    setCart(prev => prev.map(item => {
      if (item.product.id === p.id) {
        return {
          ...item,
          product: updatedProduct
        };
      }
      return item;
    }));
    showAlert(`Đã cập nhật hình ảnh cho mặt hàng "${p.name}" thành công.`, "Thành công", "info");
    setImageEditProduct(null);
  };

  const closeImageEditModal = () => {
    // Delete any session-uploaded images from Google Drive on cancel
    sessionUploadedImages.forEach(url => {
      if (url !== imageEditProduct?.link) {
        deleteGoogleDriveImage(url);
      }
    });
    setSessionUploadedImages([]);
    setImageEditProduct(null);
  };

  // Hook xử lý Đồng bộ Camera iPhone khi mở modal sửa ảnh
  const batchPollingIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (!imageEditProduct) {
      if (batchPollingIntervalRef.current) {
        clearInterval(batchPollingIntervalRef.current);
        batchPollingIntervalRef.current = null;
      }
      if (gasUrl) {
        fetch(`${gasUrl}?action=set_active&session=${iphoneSessionId}&token=${gasToken}&sku=&name=`)
          .catch(err => console.error("Lỗi xóa active product:", err));
      }
      return;
    }

    if (!gasUrl) return;

    fetch(`${gasUrl}?action=set_active&session=${iphoneSessionId}&token=${gasToken}&sku=${encodeURIComponent(imageEditProduct.sku)}&name=${encodeURIComponent(imageEditProduct.name)}`)
      .catch(err => console.error("Lỗi set active product:", err));

    if (batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current);
    }

    const targetSku = imageEditProduct.sku;
    const targetProduct = imageEditProduct;

    batchPollingIntervalRef.current = setInterval(async () => {
      try {
        const checkUrl = `${gasUrl}?action=check&session=${iphoneSessionId}&token=${gasToken}&sku=${encodeURIComponent(targetSku)}`;
        const res = await fetch(checkUrl);
        const data = await res.json();

        if (data.status === "success" && data.imageUrl) {
          // Update the preview link
          setImageEditLink(prevLink => {
            // If we have an unsaved image from this session, delete it from Google Drive to avoid clutter
            if (prevLink && prevLink !== targetProduct.link) {
              deleteGoogleDriveImage(prevLink);
            }
            return data.imageUrl;
          });

          // Add the new imageUrl to the sessionUploadedImages list
          setSessionUploadedImages(prev => [...prev, data.imageUrl]);

          showAlert(`Đã nhận hình ảnh mới từ iPhone cho mặt hàng "${targetProduct.name}"! Nhấn "Lưu" để hoàn tất.`, "Đồng bộ ảnh", "info");
        }
      } catch (err) {
        console.error("Lỗi polling đồng bộ camera:", err);
      }
    }, 2000);

    return () => {
      if (batchPollingIntervalRef.current) {
        clearInterval(batchPollingIntervalRef.current);
      }
    };
  }, [imageEditProduct?.id, gasUrl, gasToken, iphoneSessionId]);

  const handleSaveTemporary = () => {
    if (cart.length === 0) {
      alert("Không có sản phẩm nào trong giỏ hàng để tạm lưu!");
      return;
    }
    const newPending: PendingInvoice = {
      invoiceNo,
      dateTime: new Date().toLocaleString("vi-VN"),
      customer: selectedCustomer,
      items: [...cart],
      notes: posNotes,
    };
    setPendingInvoices(prev => [...prev, newPending]);
    alert(`Đã tạm lưu hóa đơn ${invoiceNo} thành công!`);

    // Reset POS
    setCart([]);
    setInvoiceNo("HĐ-" + Math.floor(10000 + Math.random() * 90000));
    const defaultCust = customers[0] || { id: '', name: 'Chọn khách hàng...', phone: '', address: '', debt: 0 };
    setSelectedCustomer(defaultCust);
    setCustomerSearchQuery(customers[0] ? customers[0].name : "");
    setPosNotes("");
    setSelectedCartIndex(null);
  };

  const handleSaveSaleToDB = async () => {
    if (cart.length === 0) return;
    if (mssqlServer && mssqlUser) {
      try {
        const formattedItems = cart.map(item => ({
          productId: Number(item.product.id) || 0,
          quantity: item.quantity,
          price: item.product.price,
          discount: item.discount || 0
        }));

        await tauriInvoke("save_invoice_db", {
          server: mssqlServer,
          dbName: mssqlDbName,
          user: mssqlUser,
          pass: mssqlPass,
          invoiceNo,
          customerId: selectedCustomer.id || "1",
          discountPct: 0.0,
          discountVal: getCartDiscountTotal(),
          notes: posNotes,
          items: formattedItems
        });
      } catch (err: any) {
        alert("Lỗi lưu hóa đơn vào CSDL: " + err.toString());
        throw err;
      }
    }
  };

  const handleSellOnDebt = async () => {
    if (cart.length === 0) {
      alert("Không có sản phẩm nào trong giỏ hàng để ghi nợ!");
      return;
    }
    if (!selectedCustomer.id || isRetailCustomer(selectedCustomer.name)) {
      alert("Không thể ghi nợ cho Khách lẻ hoặc chưa chọn khách hàng. Vui lòng chọn khách hàng cụ thể hoặc thêm khách hàng mới!");
      return;
    }

    // Save invoice to CSDL first!
    try {
      await handleSaveSaleToDB();
    } catch (e) {
      return;
    }

    const totalToPay = getCartFinalTotal();
    const newDebt = selectedCustomer.debt + totalToPay;

    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    if (mssqlServer && mssqlUser) {
      try {
        await tauriInvoke("save_customer_db", {
          server: mssqlServer,
          dbName: mssqlDbName,
          user: mssqlUser,
          pass: mssqlPass,
          customer: JSON.stringify({
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            address: selectedCustomer.address,
            debt: newDebt
          }),
          month,
          year
        });
      } catch (err: any) {
        alert("Lỗi khi ghi nợ vào CSDL: " + err.toString());
        return;
      }
    }

    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, debt: newDebt } : c));
    setSelectedCustomer(prev => ({ ...prev, debt: newDebt }));
    alert(`Hóa đơn ${invoiceNo} bán nợ thành công cho ${selectedCustomer.name}.\nSố tiền ghi nợ: ${formatVND(totalToPay)}đ.\nCông nợ: ${formatVND(newDebt)}đ.`);

    resetPOSAfterSale();
  };

  const resetPOSAfterSale = () => {
    setCart([]);
    setInvoiceNo("HĐ-" + Math.floor(10000 + Math.random() * 90000));
    const defaultCust = customers[0] || { id: '', name: 'Chọn khách hàng...', phone: '', address: '', debt: 0 };
    setSelectedCustomer(defaultCust);
    setCustomerSearchQuery(customers[0] ? customers[0].name : "");
    setPosNotes("");
    setSelectedCartIndex(null);
    setIsCheckoutModalOpen(false);
    setInvoiceDateTime(null);
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      alert("Không có sản phẩm nào trong giỏ hàng để thanh toán!");
      return;
    }
    setInvoiceDateTime(new Date());
    setIsCheckoutModalOpen(true);
  };

  const updateCartItem = (index: number, field: 'quantity' | 'price' | 'discount', value: number) => {
    const cleanValue = Math.max(0, value);
    if (field === 'quantity' && cleanValue <= 0) {
      setCart(prev => prev.filter((_, i) => i !== index));
      if (selectedCartIndex === index) setSelectedCartIndex(null);
      return;
    }
    const newCart = [...cart];
    if (field === 'quantity') {
      newCart[index].quantity = cleanValue;
    } else if (field === 'price') {
      newCart[index].product = { ...newCart[index].product, price: cleanValue };
    } else if (field === 'discount') {
      newCart[index].discount = Math.min(99, cleanValue);
    }
    setCart(newCart);
  };


  return (
    <div ref={appContainerRef} className="app-container">
      {/* Menu Bar */}
      <div className="menu-bar">
        <div className="menu-item" onClick={() => setActiveTab("pos")} style={{ fontWeight: activeTab === 'pos' ? 'bold' : 'normal' }}>Bán Hàng</div>
        <div className="menu-item" onClick={() => setActiveTab("inventory")} style={{ fontWeight: activeTab === 'inventory' ? 'bold' : 'normal' }}>Sản phẩm</div>
        <div className="menu-item" onClick={() => setActiveTab("customers")} style={{ fontWeight: activeTab === 'customers' ? 'bold' : 'normal' }}>Khách hàng</div>
        <div className="menu-item" onClick={() => setActiveTab("invoices")} style={{ fontWeight: activeTab === 'invoices' ? 'bold' : 'normal' }}>Hóa đơn</div>
        <div style={{ flex: 1 }}></div>
        <div
          className="menu-item"
          onClick={handleRefresh}
          title="Làm mới dữ liệu (F5)"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isRefreshing ? '#aaa' : undefined, cursor: isRefreshing ? 'wait' : 'pointer' }}
        >
          <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>🔄</span>
          {isRefreshing ? 'Đang tải...' : 'Làm mới (F5)'}
        </div>

        {activeTab === "pos" && (
          <>
            <div className="menu-item" onClick={handleSaveTemporary} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>💾</span>Tạm lưu(F1)
            </div>
            <div className="menu-item" onClick={handleSellOnDebt} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>📝</span>Bán nợ(F3)
            </div>
            <div className="menu-item" onClick={() => setIsPendingModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>📄</span>HĐ tạm lưu(F9)
            </div>
            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', borderLeft: '1px solid var(--border-dark)', margin: '2px 6px' }}></div>
          </>
        )}

        <div className="menu-item" onClick={() => setIsSystemModalOpen(true)}>Hệ thống</div>
      </div>

      <div className="main-content">
        {activeTab === "pos" && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Top Section: Invoice Info */}
            <div className="pos-top-section" style={{ display: 'flex', gap: '8px', padding: '4px 6px', alignItems: 'stretch' }}>
              <fieldset className="classic-fieldset" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center', padding: '4px 8px' }}>
                <legend>Thông tin phiếu</legend>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Số HĐ:</span>
                  <input className="classic-input" value={invoiceNo} readOnly style={{ width: '85px', textAlign: 'center', fontWeight: 'bold' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Ngày:</span>
                  <input className="classic-input" value={getFormattedDate(currentDateTime)} readOnly style={{ width: '80px', textAlign: 'center' }} />
                  <input className="classic-input" value={getFormattedTime(currentDateTime)} readOnly style={{ width: '55px', textAlign: 'center' }} />
                </div>
              </fieldset>

              <fieldset className="classic-fieldset" style={{ flex: '2 1 auto', display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center', padding: '4px 8px' }}>
                <legend>Khách hàng & Ghi chú</legend>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, position: 'relative' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Khách hàng:</span>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                      className="classic-input"
                      style={{ flex: 1, minWidth: '100px', paddingRight: '16px' }}
                      value={customerSearchQuery}
                      onFocus={(e) => {
                        e.target.select();
                        setIsCustomerDropdownOpen(true);
                        setCustomerSearchQuery("");
                      }}
                      onChange={e => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setIsCustomerDropdownOpen(false);
                          setCustomerSearchQuery(selectedCustomer.name);
                        }, 200);
                      }}
                      placeholder="Tìm khách hàng..."
                    />
                    <span style={{
                      position: 'absolute',
                      right: '4px',
                      pointerEvents: 'none',
                      fontSize: '8px',
                      color: '#555'
                    }}>▼</span>
                    {isCustomerDropdownOpen && (
                      <div className="classic-dropdown-list" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#fff',
                        border: '1.5px solid var(--border-dark)',
                        zIndex: 1000,
                        maxHeight: '150px',
                        overflowY: 'auto',
                        boxShadow: '2px 2px 5px rgba(0,0,0,0.2)'
                      }}>
                        {customers.filter(c => {
                          const query = removeAccents(customerSearchQuery.toLowerCase());
                          return removeAccents(c.name.toLowerCase()).includes(query) || c.phone.includes(query);
                        }).map(c => (
                          <div
                            key={c.id}
                            className="dropdown-item"
                            style={{
                              padding: '4px 6px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              borderBottom: '1px solid #eee'
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCustomer(c);
                              setCustomerSearchQuery(c.name);
                              setIsCustomerDropdownOpen(false);
                            }}
                          >
                            <span>{c.name} {c.phone ? `(${c.phone})` : ''}</span>
                            <span style={{ color: c.debt > 0 ? 'var(--text-red)' : 'var(--text-blue)', fontWeight: 'bold' }}>
                              Nợ: {formatVND(c.debt)}đ
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 2 }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Ghi chú:</span>
                  <input
                    className="classic-input"
                    value={posNotes}
                    onChange={e => setPosNotes(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    style={{ flex: 1, minWidth: '180px' }}
                  />
                </div>
              </fieldset>
            </div>

            {/* Middle Section: Selected Items Grid & Totals */}
            <div className="pos-middle-section-wrapper" style={{ height: `${middleHeight}px` }}>
              <div className="pos-middle-section">
                <div className="grid-container" style={{ flex: 1, margin: '0 4px 0 4px' }}>
                  <table className="data-grid">
                    <thead>
                      <tr>
                        <th style={{ width: '10%' }}>Mã Hàng</th>
                        <th style={{ width: '22%' }}>Tên M.Hàng</th>
                        <th style={{ width: '5%' }}>ĐVT</th>
                        <th style={{ width: '7%' }}>S.Lg</th>
                        <th style={{ width: '11%' }}>Đơn Giá</th>
                        <th style={{ width: '11%' }}>Cộng</th>
                        <th style={{ width: '6%' }}>Km%</th>
                        <th style={{ width: '11%' }}>Tiền Giảm</th>
                        <th style={{ width: '12%' }}>Thành Tiền</th>
                        <th style={{ width: '5%' }}>Xóa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, idx) => {
                        const amount = item.product.price * item.quantity;
                        const discount = item.discount || 0;
                        const discountAmount = amount * (discount / 100);
                        const finalAmount = amount - discountAmount;

                        return (
                          <tr
                            key={idx}
                            className={selectedCartIndex === idx ? "selected" : ""}
                            onMouseDown={() => {
                              setSelectedCartIndex(idx);
                              setSelectedProduct(item.product);
                            }}
                          >
                            <td className="grid-readonly-cell">{item.product.sku}</td>
                            <td className="grid-readonly-cell" title={item.product.name}>{item.product.name}</td>
                            <td className="grid-readonly-cell text-center">{item.product.unit}</td>
                            <td className="text-center" style={{ padding: 0 }}>
                              <input
                                type="number"
                                className="grid-input text-center"
                                value={item.quantity}
                                onChange={(e) => updateCartItem(idx, 'quantity', Number(e.target.value))}
                                onMouseDown={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  e.target.select();
                                  setSelectedProduct(item.product);
                                  setSelectedCartIndex(idx);
                                }}
                              />
                            </td>
                            <td className="text-right" style={{ padding: 0 }}>
                              <input
                                type="number"
                                className="grid-input text-right"
                                value={item.product.price}
                                onChange={(e) => updateCartItem(idx, 'price', Number(e.target.value))}
                                onMouseDown={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  e.target.select();
                                  setSelectedProduct(item.product);
                                  setSelectedCartIndex(idx);
                                }}
                              />
                            </td>
                            <td className="text-right grid-readonly-cell">{formatVND(amount)}</td>
                            <td className="text-right" style={{ padding: 0 }}>
                              <input
                                type="number"
                                className="grid-input text-right"
                                value={discount}
                                onChange={(e) => updateCartItem(idx, 'discount', Number(e.target.value))}
                                onMouseDown={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  e.target.select();
                                  setSelectedProduct(item.product);
                                  setSelectedCartIndex(idx);
                                }}
                              />
                            </td>
                            <td className="text-right grid-readonly-cell" style={{ color: 'var(--text-red)' }}>{formatVND(discountAmount)}</td>
                            <td className="text-right grid-readonly-cell">{formatVND(finalAmount)}</td>
                            <td className="text-center grid-readonly-cell">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCart(cart.filter((_, i) => i !== idx));
                                  if (selectedCartIndex === idx) setSelectedCartIndex(null);
                                }}
                                style={{ color: 'red', cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 'bold' }}
                                title="Xóa dòng"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {/* Empty rows to fill space simulating classic grid */}
                      {[...Array(1)].map((_, i) => (
                        <tr key={`empty-${i}`}>
                          <td className="grid-readonly-cell" style={{ height: '22px' }}></td>
                          <td className="grid-readonly-cell"></td>
                          <td className="grid-readonly-cell"></td>
                          <td></td>
                          <td></td>
                          <td className="grid-readonly-cell"></td>
                          <td></td>
                          <td className="grid-readonly-cell"></td>
                          <td className="grid-readonly-cell"></td>
                          <td className="grid-readonly-cell"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Panel & Checkout */}
                <div className="pos-totals-container">
                  <div className="pos-totals-panel">
                    <div className="total-row-sub">
                      <span>Cộng tiền hàng</span>
                      <span>{formatVND(getCartBaseTotal())}</span>
                    </div>
                    <div className="total-row-discount">
                      <span>Giảm giá</span>
                      <span>{getCartDiscountTotal() > 0 ? `-${formatVND(getCartDiscountTotal())}` : '0'}</span>
                    </div>
                    <div className="total-row-final">
                      <span>Tổng cộng</span>
                      <span>{formatVND(getCartFinalTotal())}</span>
                    </div>
                  </div>
                  <button className="checkout-btn" onClick={handleCheckout}>
                    <span className="tool-icon" style={{ marginBottom: 0 }}>💰</span> Tính tiền (F2)
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Horizontal Resizer */}
            <div className="resizer-horizontal" onMouseDown={handleMouseDown} title="Kéo thả để thay đổi chiều cao" />

            {/* Bottom Section: Search & Product List */}
            <div className="pos-bottom-section">
              <div className="pos-search-bar">
                <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '10px' }}>Mã/tên (Esc)</span>
                <input
                  ref={searchInputRef}
                  className="classic-input"
                  style={{ flex: '1 1 200px', maxWidth: '300px', backgroundColor: '#ffe4e1', minWidth: 0 }}
                  value={posSearch}
                  onChange={e => setPosSearch(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSearchSubmit();
                    }
                  }}
                />
                <button
                  className="classic-btn"
                  style={{ marginLeft: '4px' }}
                  onClick={handleSearchSubmit}
                >
                  Tìm
                </button>
                <button
                  className="classic-btn"
                  style={{ marginLeft: '4px', backgroundColor: '#e6f3ff', borderColor: '#b3d7ff' }}
                  onClick={() => {
                    const testSku = prompt("Nhập mã vạch để giả lập máy quét (VD: 12345678):");
                    if (testSku) {
                      const foundProduct = products.find(p => p.sku && p.sku.trim() !== "" && p.sku.trim().toLowerCase() === testSku.trim().toLowerCase());
                      if (foundProduct) {
                        addToCart(foundProduct);
                        setPosSearch("");
                      } else {
                        showAlert(`Không tìm thấy sản phẩm với mã vạch: ${testSku}`, "Lỗi quét mã", "error");
                      }
                    }
                  }}
                  title="Kiểm tra chức năng bắn mã vạch"
                >
                  Test Scan
                </button>
                <div style={{ flex: 1 }}></div>
                <span style={{ fontSize: '11px', color: 'var(--text-blue)', marginRight: '10px', fontWeight: 'bold' }}>
                  Đã hiển thị: {Math.min(posLimit, posFilteredProducts.length)}/{posFilteredProducts.length} mặt hàng
                </span>
              </div>
              <div style={{ display: 'flex', flex: 1, padding: '0 4px 4px 4px', minHeight: 0 }}>
                {/* Search List Grid */}
                <div
                  className="grid-container"
                  style={{ flex: 1, margin: '0 4px 0 0' }}
                  onScroll={e => {
                    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                    if (scrollHeight - scrollTop - clientHeight < 150) {
                      setPosLimit(prev => Math.min(prev + 100, posFilteredProducts.length));
                    }
                  }}
                >
                  <table className="data-grid">
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Mã hàng</th>
                        <th style={{ width: '50%' }}>Tên M.Hàng</th>
                        <th style={{ width: '10%' }}>ĐVT</th>
                        <th style={{ width: '15%' }}>Đơn giá</th>
                        <th style={{ width: '10%' }}>Giá 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posFilteredProducts.slice(0, posLimit).map(p => {
                        const isAvailable = p.available !== false;
                        const isSelected = selectedProduct?.id === p.id && isAvailable;
                        return (
                          <tr
                            key={p.id}
                            tabIndex={isAvailable ? 0 : -1}
                            className={isSelected ? "selected" : ""}
                            onClick={() => {
                              if (isAvailable) {
                                setSelectedProduct(p);
                              }
                            }}
                            onDoubleClick={() => {
                              if (isAvailable) {
                                addToCart(p);
                              }
                            }}
                            onKeyDown={e => {
                              if (isAvailable && e.key === 'Enter') {
                                addToCart(p);
                              }
                            }}
                            style={isAvailable ? { cursor: 'pointer' } : {
                              opacity: 0.55,
                              backgroundColor: '#f5f5f5',
                              color: '#888',
                              cursor: 'not-allowed',
                              textDecoration: 'line-through'
                            }}
                          >
                            <td>{p.sku}</td>
                            <td>{p.name}</td>
                            <td>{p.unit}</td>
                            <td className="text-right">{formatVND(p.price)}</td>
                            <td className="text-right">0</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Product Image Panel */}
                <div
                  className="pos-image-panel"
                  onWheel={handleImagePanelWheel}
                  style={{
                    margin: 0,
                    width: `${posImageWidth}px`,
                    minWidth: `${posImageWidth}px`,
                    maxWidth: `${posImageWidth}px`,
                    height: '100%',
                    flexDirection: 'column',
                    cursor: 'ew-resize'
                  }}
                  title="Cuộn chuột (Scroll) trên đây để đổi độ rộng"
                >
                  <div style={{ flex: 1, width: '100%', overflow: 'hidden', padding: '4px' }}>
                    {selectedProduct ? (
                      selectedProduct.link ? (
                        <img src={getDisplayImageLink(selectedProduct.link)} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={handleImageError} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          <div className="default-image-placeholder" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line x1="10" y1="10" x2="90" y2="90" stroke="red" strokeWidth="2" />
                              <line x1="90" y1="10" x2="10" y2="90" stroke="red" strokeWidth="2" />
                            </svg>
                          </div>
                          <button
                            className="classic-btn"
                            style={{
                              position: 'relative',
                              zIndex: 10,
                              padding: '4px 8px',
                              backgroundColor: '#e6f3ff',
                              borderColor: '#b3d7ff',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                            onClick={() => {
                              setImageEditProduct(selectedProduct);
                              setImageEditLink("");
                            }}
                            title="Thêm ảnh cho sản phẩm này"
                          >
                            📷 Chụp ảnh
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="default-image-placeholder">
                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <line x1="10" y1="10" x2="90" y2="90" stroke="red" strokeWidth="2" />
                          <line x1="90" y1="10" x2="10" y2="90" stroke="red" strokeWidth="2" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div style={{ height: '30px', backgroundColor: '#e0dfdf', width: '100%', borderTop: '1px solid #808080', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', textAlign: 'center', padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedProduct ? selectedProduct.name : "Chưa chọn mặt hàng"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "inventory" && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Hidden Input for CSV Import */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv"
              onChange={handleImportCSV}
            />

            {/* Inventory Toolbar */}
            <div className="toolbar">
              <button className="tool-btn" onClick={() => {
                setEditingProduct({
                  id: "NEW",
                  sku: "",
                  name: "",
                  category: "Khác",
                  price: 0,
                  cost: 0,
                  stock: 0,
                  unit: units[0] || "Cái",
                });
              }}>
                <span className="tool-icon">➕</span>Thêm mặt hàng
              </button>
              <button className="tool-btn" onClick={() => setIsUnitManagerOpen(true)}>
                <span className="tool-icon">📁</span>Đơn Vị Tính
              </button>

              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Trạng thái:</span>
                <select
                  className="classic-input"
                  style={{ width: '110px' }}
                  value={inventoryAvailableFilter}
                  onChange={e => setInventoryAvailableFilter(e.target.value)}
                >
                  <option value="active">Hàng còn bán</option>
                  <option value="inactive">Không còn bán</option>
                  <option value="all">Tất cả</option>
                </select>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>ĐVT:</span>
                <select
                  className="classic-input"
                  style={{ width: '90px' }}
                  value={inventoryUnitFilter}
                  onChange={e => setInventoryUnitFilter(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  {units.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Tìm (Esc):</span>
                <input
                  ref={inventorySearchRef}
                  className="classic-input"
                  style={{ width: '150px', backgroundColor: '#ffe4e1' }}
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                  placeholder="Mã hoặc tên..."
                  onFocus={(e) => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      const now = Date.now();
                      if (now - lastInventoryEscPress.current < 500) {
                        setInventorySearch("");
                      } else {
                        e.currentTarget.focus();
                        e.currentTarget.select();
                      }
                      lastInventoryEscPress.current = now;
                      e.stopPropagation();
                    }
                  }}
                />
              </div>
              <div style={{ flex: 1 }}></div>
              <button className="tool-btn" onClick={triggerImportClick}>
                <span className="tool-icon">📥</span>Import
              </button>
              <button className="tool-btn" onClick={handleExportCSV}>
                <span className="tool-icon">📤</span>Export
              </button>
              <button className="tool-btn" onClick={handleDownloadTemplate}>
                <span className="tool-icon">📋</span>Tải mẫu
              </button>
            </div>

            {/* Main Inventory Layout with optional Batch Capture Sidebar */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', margin: '4px' }}>
              <div
                className="grid-container"
                style={{ flex: 1, margin: 0 }}
                onMouseDown={e => {
                  if ((e.target as HTMLElement).tagName === 'TD' || (e.target as HTMLElement).tagName === 'TR') return;
                  if ((e.target as HTMLElement).closest('tr[data-product-row]')) return;
                  setSelectedProduct(null);
                }}
                onScroll={e => {
                  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                  if (scrollHeight - scrollTop - clientHeight < 150) {
                    setInventoryLimit(prev => Math.min(prev + 100, inventoryFilteredProducts.length));
                  }
                }}
              >
                <table className="data-grid">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Hình ảnh</th>
                      <th style={{ width: '15%' }}>Mã hàng</th>
                      <th style={{ width: '30%' }}>Tên M.Hàng</th>
                      <th style={{ width: '8%' }}>ĐVT</th>
                      <th style={{ width: '12%' }}>Đơn giá</th>
                      <th style={{ width: '10%' }}>Đ.giá 2</th>
                      <th style={{ width: '7%' }}>Còn bán</th>
                      <th style={{ width: '8%' }}>Kho</th>
                      <th style={{ width: '6%', textAlign: 'center' }}>In tem</th>
                      <th style={{ width: '5%', textAlign: 'center' }}>Xóa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryFilteredProducts.slice(0, inventoryLimit).map((p) => {
                      const isSelected = selectedProduct?.id === p.id;
                      return (
                        <tr
                          key={p.id}
                          data-product-row="true"
                          className={isSelected ? "selected-row" : ""}
                          onClick={() => setSelectedProduct(p)}
                          style={{
                            cursor: 'pointer',
                            color: isSelected ? undefined : (p.available === false ? '#777' : undefined),
                            backgroundColor: isSelected ? undefined : (p.available === false ? '#f2f2f2' : undefined)
                          }}
                        >
                          {isSelected ? (
                            <>
                              <td
                                className="text-center"
                                style={{ padding: '2px', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProduct(p);
                                  setImageEditProduct(p);
                                  setImageEditLink(p.link || "");
                                }}
                                title="Click để sửa hình ảnh"
                              >
                                {p.link ? (
                                  <img src={p.link} alt={p.name} style={{ height: '20px', width: '20px', objectFit: 'contain', border: '1px solid #0056b3' }} onError={handleImageError} />
                                ) : (
                                  <span style={{ color: '#0056b3', fontSize: '10px', textDecoration: 'underline' }}>[Sửa ảnh]</span>
                                )}
                              </td>
                              <td style={{ padding: '1px' }}>
                                <input
                                  className="classic-input"
                                  style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                  value={p.sku}
                                  onChange={e => updateProductField(p.id, 'sku', e.target.value)}
                                  onBlur={e => updateProductField(p.id, 'sku', e.target.value, true)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td style={{ padding: '1px' }}>
                                <input
                                  className="classic-input"
                                  style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                  value={p.name}
                                  onChange={e => updateProductField(p.id, 'name', e.target.value)}
                                  onBlur={e => updateProductField(p.id, 'name', e.target.value, true)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td style={{ padding: '1px' }}>
                                <select
                                  className="classic-input"
                                  style={{ width: '100%', height: '22px', padding: '0 2px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                  value={p.unit}
                                  onChange={e => updateProductField(p.id, 'unit', e.target.value, true)}
                                  onClick={e => e.stopPropagation()}
                                >
                                  {units.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '1px' }}>
                                <input
                                  type="number"
                                  className="classic-input"
                                  style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', textAlign: 'right', background: '#fff', color: '#000' }}
                                  value={p.price}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    if (val >= 0) {
                                      updateProductField(p.id, 'price', val);
                                    }
                                  }}
                                  onBlur={e => {
                                    const val = Number(e.target.value);
                                    if (val >= 0) {
                                      updateProductField(p.id, 'price', val, true);
                                    }
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td style={{ padding: '1px' }}>
                                <input
                                  type="number"
                                  className="classic-input"
                                  style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', textAlign: 'right', background: '#fff', color: '#000' }}
                                  value={p.price2 || 0}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    if (val >= 0) {
                                      updateProductField(p.id, 'price2', val);
                                    }
                                  }}
                                  onBlur={e => {
                                    const val = Number(e.target.value);
                                    if (val >= 0) {
                                      updateProductField(p.id, 'price2', val, true);
                                    }
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                className="text-center"
                                style={{ padding: '2px', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProduct(p);
                                  setImageEditProduct(p);
                                  setImageEditLink(p.link || "");
                                }}
                                title="Click để sửa hình ảnh"
                              >
                                {p.link ? (
                                  <img src={p.link} alt={p.name} style={{ height: '20px', width: '20px', objectFit: 'contain', border: '1px solid #808080' }} onError={handleImageError} />
                                ) : (
                                  <span style={{ color: '#808080', fontSize: '10px' }}>[Không ảnh]</span>
                                )}
                              </td>
                              <td>{p.sku}</td>
                              <td>{p.name}</td>
                              <td>{p.unit}</td>
                              <td className="text-right">{formatVND(p.price)}</td>
                              <td className="text-right">{formatVND(p.price2 || 0)}</td>
                            </>
                          )}
                          <td className="text-center" style={{ padding: '2px' }}>
                            <input
                              type="checkbox"
                              style={{ cursor: 'pointer' }}
                              checked={p.available !== false}
                              onChange={e => updateProductField(p.id, 'available', e.target.checked, true)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          {isSelected ? (
                            <td style={{ padding: '1px' }}>
                              <input
                                type="number"
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', textAlign: 'right', background: '#fff', color: '#000' }}
                                value={p.stock}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  if (val >= 0) {
                                    updateProductField(p.id, 'stock', val);
                                  }
                                }}
                                onBlur={e => {
                                  const val = Number(e.target.value);
                                  if (val >= 0) {
                                    updateProductField(p.id, 'stock', val, true);
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                          ) : (
                            <td className="text-right">{p.stock}</td>
                          )}
                          <td className="text-center" style={{ padding: '2px 0' }}>
                            <button
                              className="classic-btn"
                              style={{ padding: '2px 6px', fontSize: '10px', minWidth: '40px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLabelPrintProduct(p);
                                setLabelPrintQuantity(2);
                                setIsLabelPrintModalOpen(true);
                              }}
                              title="In tem nhãn cho mặt hàng này"
                            >
                              🖨️ In
                            </button>
                          </td>
                          <td className="text-center" style={{ padding: '2px 0' }}>
                            <button
                              className="classic-btn"
                              style={{ color: 'red', padding: '2px 6px', fontSize: '10px', minWidth: '40px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductToDelete(p);
                              }}
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


            </div>

            <div style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--text-blue)' }}>
              Đã hiển thị: {Math.min(inventoryLimit, inventoryFilteredProducts.length)}/{inventoryFilteredProducts.length} mặt hàng (Tổng số mặt hàng: {products.length})
            </div>
          </div>
        )}

        {activeTab === "customers" && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Customer Toolbar */}
            <div className="toolbar">
              <button className="tool-btn" onClick={() => {
                setEditingCustomer(null);
                setCustomerForm({ name: "", phone: "", address: "", debt: 0 });
                setIsCustomerModalOpen(true);
              }}><span className="tool-icon">➕</span>Thêm KH</button>



              <button className="tool-btn" onClick={() => {
                if (selectedCustomerIdx === null) {
                  alert("Vui lòng chọn khách hàng cần thêm nợ!");
                  return;
                }
                const cust = customers[selectedCustomerIdx];
                if (isRetailCustomer(cust.name)) {
                  alert("Khách lẻ không thể ghi nợ!");
                  return;
                }
                setAddDebtAmount(0);
                setIsAddDebtModalOpen(true);
              }}><span className="tool-icon">📝</span>Thêm nợ</button>

              <button className="tool-btn" onClick={() => {
                if (selectedCustomerIdx === null) {
                  alert("Vui lòng chọn khách hàng cần thu nợ!");
                  return;
                }
                const cust = customers[selectedCustomerIdx];
                if (isRetailCustomer(cust.name)) {
                  alert("Khách lẻ không có công nợ cần thu!");
                  return;
                }
                if (cust.debt <= 0) {
                  alert(`Khách hàng ${cust.name} hiện tại không có nợ.`);
                  return;
                }
                setPayDebtAmount(cust.debt);
                setIsPayDebtModalOpen(true);
              }}><span className="tool-icon">💵</span>Thu nợ</button>

              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', gap: '4px' }}>
                <span>Tìm kiếm (Esc):</span>
                <input
                  ref={customerSearchRef}
                  className="classic-input"
                  style={{ width: '150px' }}
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Tên hoặc SĐT..."
                  onFocus={(e) => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      const now = Date.now();
                      if (now - lastCustomerEscPress.current < 500) {
                        setCustomerSearch("");
                      } else {
                        e.currentTarget.focus();
                        e.currentTarget.select();
                      }
                      lastCustomerEscPress.current = now;
                      e.stopPropagation();
                    }
                  }}
                />
              </div>
            </div>

            {/* Customer Data Grid */}
            <div
              className="grid-container"
              style={{ margin: '4px', flex: 1, overflowY: 'auto' }}
              onMouseDown={e => {
                // Deselect if clicking the container background (not a row)
                if ((e.target as HTMLElement).tagName === 'TD' || (e.target as HTMLElement).tagName === 'TR') return;
                if ((e.target as HTMLElement).closest('tr[data-customer-row]')) return;
                setSelectedCustomerIdx(null);
              }}
              onScroll={e => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                if (scrollHeight - scrollTop - clientHeight < 150) {
                  setCustomerLimit(prev => Math.min(prev + 100, filteredCustomers.length));
                }
              }}
            >
              <table className="data-grid">
                <thead>
                  <tr>
                    <th style={{ width: '10%' }}>Mã KH</th>
                    <th style={{ width: '30%' }}>Tên Khách Hàng</th>
                    <th style={{ width: '18%' }}>Số điện thoại</th>
                    <th style={{ width: '27%' }}>Địa chỉ</th>
                    <th style={{ width: '10%' }}>Công nợ</th>
                    <th style={{ width: '5%', textAlign: 'center' }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.slice(0, customerLimit).map((c) => {
                    const globalIdx = customers.findIndex(cust => cust.id === c.id);
                    const isSelected = selectedCustomerIdx === globalIdx && !isRetailCustomer(c.name);
                    return (
                      <tr
                        key={c.id}
                        data-customer-row="true"
                        className={selectedCustomerIdx === globalIdx ? "selected-row" : ""}
                        onClick={() => setSelectedCustomerIdx(globalIdx)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>KH-{c.id.padStart(4, '0')}</td>
                        {isSelected ? (
                          <>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={c.name}
                                onChange={e => updateCustomerField(c.id, 'name', e.target.value)}
                                onBlur={e => updateCustomerField(c.id, 'name', e.target.value, true)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={c.phone}
                                onChange={e => updateCustomerField(c.id, 'phone', e.target.value)}
                                onBlur={e => updateCustomerField(c.id, 'phone', e.target.value, true)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={c.address}
                                onChange={e => updateCustomerField(c.id, 'address', e.target.value)}
                                onBlur={e => updateCustomerField(c.id, 'address', e.target.value, true)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td className="text-right" style={{ color: c.debt > 0 ? 'var(--text-red)' : 'var(--text-blue)', fontWeight: c.debt > 0 ? 'bold' : 'normal' }}>
                              {formatVND(c.debt)}đ
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.name}</td>
                            <td>{c.phone}</td>
                            <td>{c.address}</td>
                            <td className="text-right" style={{ color: c.debt > 0 ? 'var(--text-red)' : 'var(--text-blue)', fontWeight: c.debt > 0 ? 'bold' : 'normal' }}>
                              {formatVND(c.debt)}đ
                            </td>
                          </>
                        )}
                        <td className="text-center" style={{ padding: '2px 0' }}>
                          <button
                            className="classic-btn"
                            style={{ color: 'red', padding: '2px 6px', fontSize: '10px', minWidth: '40px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (isRetailCustomer(c.name)) {
                                alert("Không thể xóa Khách lẻ mặc định!");
                                return;
                              }
                              if (confirm(`Bạn có chắc chắn muốn xóa khách hàng "${c.name}"?`)) {
                                if (mssqlServer && mssqlUser) {
                                  try {
                                    await tauriInvoke("delete_customer_db", {
                                      server: mssqlServer,
                                      dbName: mssqlDbName,
                                      user: mssqlUser,
                                      pass: mssqlPass,
                                      id: c.id
                                    });
                                  } catch (err: any) {
                                    alert("Lỗi khi xóa khách hàng từ CSDL: " + err.toString());
                                    return;
                                  }
                                }
                                setCustomers(prev => prev.filter(cust => cust.id !== c.id));
                                setSelectedCustomerIdx(null);
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--text-blue)' }}>
              Đã hiển thị: {Math.min(customerLimit, filteredCustomers.length)}/{filteredCustomers.length} khách hàng (Tổng số khách hàng: {customers.length})
            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '4px' }}>

            {/* Filter Bar */}
            <fieldset className="classic-fieldset" style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '4px 10px', flexWrap: 'wrap', margin: '4px 4px 0 4px' }}>
              <legend>Bộ lọc Hóa đơn</legend>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Từ ngày:</span>
                <input type="date" className="classic-input" style={{ width: '130px', height: '22px' }}
                  value={invoiceFromDate} onChange={e => setInvoiceFromDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Đến ngày:</span>
                <input type="date" className="classic-input" style={{ width: '130px', height: '22px' }}
                  value={invoiceToDate} onChange={e => setInvoiceToDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 180px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Khách hàng:</span>
                <input className="classic-input" style={{ flex: 1, height: '22px' }}
                  placeholder="Tìm tên hoặc SĐT..." value={invoiceCustomerQuery}
                  onChange={e => setInvoiceCustomerQuery(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 150px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Số HĐ:</span>
                <input className="classic-input" style={{ flex: 1, height: '22px' }}
                  placeholder="Tìm mã hóa đơn..." value={invoiceCodeQuery}
                  onChange={e => setInvoiceCodeQuery(e.target.value)} />
              </div>
              <button className="classic-btn" style={{ height: '22px', gap: '4px' }} onClick={loadInvoicesFromDB}>
                🔍 Tìm kiếm
              </button>
            </fieldset>

            {/* Split View */}
            <div style={{ display: 'flex', flex: 1, gap: '4px', minHeight: 0, padding: '0 4px 4px 4px' }}>

              {/* Left: Invoice List Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: selectedInvoice ? '1.3 1 0' : '1 1 0', minWidth: 0 }}>
                <div className="grid-container" style={{ flex: 1, overflow: 'auto', margin: 0 }}>
                  <table className="data-grid" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '100px' }}>Số HĐ</th>
                        <th style={{ width: '145px' }}>Ngày giờ</th>
                        <th style={{ width: '150px' }}>Khách hàng</th>
                        <th style={{ width: '110px', textAlign: 'right' }}>Tổng tiền</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingInvoices ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Đang tải...</td></tr>
                      ) : invoicesList.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Không tìm thấy hóa đơn nào.</td></tr>
                      ) : (
                        invoicesList.map(inv => (
                          <tr
                            key={inv.IDHoaDon}
                            className={selectedInvoice?.IDHoaDon === inv.IDHoaDon ? 'selected' : ''}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedInvoice(inv);
                              loadInvoiceDetailsFromDB(inv.IDHoaDon);
                            }}
                          >
                            <td style={{ fontWeight: 'bold' }}>{inv.MaHoaDon}</td>
                            <td>{inv.NgayHDStr} {inv.GioHDStr}</td>
                            <td>{inv.TenKhachHang}{inv.DienThoaiKH ? ` (${inv.DienThoaiKH})` : ''}</td>
                            <td style={{ textAlign: 'right', color: selectedInvoice?.IDHoaDon === inv.IDHoaDon ? 'inherit' : 'red', fontWeight: 'bold' }}>
                              {formatVND(inv.TongTien)}đ
                            </td>
                            <td style={{ fontSize: '11px', color: selectedInvoice?.IDHoaDon === inv.IDHoaDon ? 'inherit' : '#666' }}>{inv.GhiChu}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--text-blue)', borderTop: '1px solid var(--border-dark)', background: 'var(--bg-toolbar)' }}>
                  Tổng số hóa đơn: <strong>{invoicesList.length}</strong>
                </div>
              </div>

              {/* Right: Invoice Detail Panel */}
              {selectedInvoice && (
                <>
                  <div className="resizer-vertical" onMouseDown={handleMouseDownInvWidth} title="Kéo thả để thay đổi chiều rộng" />
                  <div style={{ flex: `0 0 ${invoiceDetailWidth}px`, display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-panel)' }}>
                    {/* Detail Header */}
                    <div style={{ background: 'linear-gradient(90deg,#000080,#1084d0)', color: '#fff', padding: '3px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '11px' }}>CHI TIẾT HÓA ĐƠN — {selectedInvoice.MaHoaDon}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button className="classic-btn" style={{ minWidth: 'auto', padding: '1px 8px', height: '18px', color: '#000', fontSize: '10px', fontWeight: 'bold' }} onClick={handleReprint}>🖨️ In lại</button>
                        <button className="dialog-close-btn" onClick={() => { setSelectedInvoice(null); setSelectedInvoiceDetails([]); }}>✕</button>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div style={{ padding: '6px 8px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', borderBottom: '1px solid var(--border-dark)' }}>
                      <div><strong>Khách hàng:</strong> {selectedInvoice.TenKhachHang}{selectedInvoice.DienThoaiKH ? ` (${selectedInvoice.DienThoaiKH})` : ''}</div>
                      <div><strong>Ngày bán:</strong> {selectedInvoice.NgayHDStr} {selectedInvoice.GioHDStr}</div>
                      {selectedInvoice.GhiChu && <div><strong>Ghi chú:</strong> {selectedInvoice.GhiChu}</div>}
                    </div>

                    {/* Detail Grid */}
                    <div className="grid-container" style={{ flex: 1, overflow: 'auto', margin: 0, borderLeft: 'none', borderRight: 'none' }}>
                      <table className="data-grid" style={{ fontSize: '11px', tableLayout: 'fixed', width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Tên hàng</th>
                            <th style={{ width: '38px', textAlign: 'center' }}>ĐVT</th>
                            <th style={{ width: '42px', textAlign: 'right' }}>SL</th>
                            <th style={{ width: '78px', textAlign: 'right' }}>Đơn giá</th>
                            <th style={{ width: '38px', textAlign: 'right' }}>KM%</th>
                            <th style={{ width: '85px', textAlign: 'right' }}>Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedInvoiceDetails.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '12px', color: '#999' }}>Đang tải chi tiết...</td></tr>
                          ) : (
                            selectedInvoiceDetails.map(item => (
                              <tr key={item.id}>
                                <td>{item.productName}</td>
                                <td>{item.unit}</td>
                                <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right' }}>{formatVND(item.price)}</td>
                                <td style={{ textAlign: 'right' }}>{item.discount > 0 ? `${item.discount}%` : ''}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'red' }}>{formatVND(item.total)}đ</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals footer */}
                    <div style={{ padding: '6px 8px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid var(--border-dark)', background: 'var(--bg-toolbar)' }}>
                      {selectedInvoice.PTKhuyenMai > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'blue' }}>
                          <span>Khuyến mại (%):</span><span>{selectedInvoice.PTKhuyenMai}%</span>
                        </div>
                      )}
                      {selectedInvoice.TienKhuyenMai > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'blue' }}>
                          <span>Tiền khuyến mại:</span><span>-{formatVND(selectedInvoice.TienKhuyenMai)}đ</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', color: 'red', borderTop: '1px solid var(--border-dark)', paddingTop: '6px', marginTop: '2px' }}>
                        <span>TỔNG THANH TOÁN:</span>
                        <span>{formatVND(selectedInvoice.TongTien)}đ</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        {scanningTarget !== null && (
          <div 
            className="status-panel" 
            style={{ cursor: 'pointer', backgroundColor: '#e2f0d9', color: '#385723', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            onClick={() => setIsScanModalOpen(true)}
            title="Nhấp để mở lại cửa sổ trạng thái quét"
          >
            <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid #385723', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            🔍 Đang dò máy in...
          </div>
        )}
        <div className="status-panel" style={{ flex: 1, textAlign: 'right' }}>{shopName} - 2026</div>
      </div>

      {editingProduct && editForm && (
        <div className="modal-overlay">
          <div className="classic-dialog">
            <div className="dialog-title-bar">
              <span className="dialog-title">{editingProduct.id === "NEW" ? "Thêm Mặt Hàng mới" : "Cập nhật thông tin mặt hàng"}</span>
              <button className="dialog-close-btn" onClick={() => setEditingProduct(null)}>✕</button>
            </div>
            <div className="dialog-body">
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Mã hàng:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.sku}
                  onChange={e => setEditForm({ ...editForm, sku: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Tên mặt hàng:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>ĐVT:</span>
                <select
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.unit}
                  onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                >
                  {units.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  {!units.includes(editForm.unit) && editForm.unit ? (
                    <option value={editForm.unit}>{editForm.unit}</option>
                  ) : null}
                </select>
                <button
                  className="classic-btn"
                  style={{ marginLeft: '4px', padding: '0 6px', height: '21px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => {
                    const newU = prompt("Nhập tên ĐVT mới:");
                    if (newU && newU.trim()) {
                      const uTrim = newU.trim();
                      if (!units.includes(uTrim)) {
                        setUnits(prev => [...prev, uTrim]);
                      }
                      setEditForm({ ...editForm, unit: uTrim });
                    }
                  }}
                  type="button"
                  title="Thêm ĐVT mới"
                >
                  ➕
                </button>
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Hình ảnh (URL):</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.link || ""}
                  onChange={e => setEditForm({ ...editForm, link: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  placeholder="Nhập link hình ảnh..."
                />
              </div>
              <div className="form-row" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Còn bán:</span>
                <input
                  type="checkbox"
                  style={{ cursor: 'pointer', margin: 0 }}
                  checked={editForm.available !== false}
                  onChange={e => setEditForm({ ...editForm, available: e.target.checked })}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Đơn giá:</span>
                <input
                  type="number"
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.price}
                  onChange={e => setEditForm({ ...editForm, price: Math.max(0, Number(e.target.value)) })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Đơn giá 2:</span>
                <input
                  type="number"
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={editForm.price2 || 0}
                  onChange={e => setEditForm({ ...editForm, price2: Math.max(0, Number(e.target.value)) })}
                  onFocus={(e) => e.target.select()}
                />
              </div>

              <div className="dialog-buttons">
                <button className="classic-btn" onClick={handleSaveProductEdit}>Lưu</button>
                <button className="classic-btn" onClick={() => setEditingProduct(null)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSystemModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '480px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Cấu hình Hệ thống</span>
              <button className="dialog-close-btn" onClick={() => setIsSystemModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body" style={{ padding: '0' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-dark)', backgroundColor: '#e0dfdf' }}>
                <div
                  style={{ padding: '6px 12px', cursor: 'pointer', borderRight: '1px solid var(--border-dark)', backgroundColor: settingsTab === 'general' ? '#fff' : 'transparent', fontWeight: settingsTab === 'general' ? 'bold' : 'normal', borderBottom: settingsTab === 'general' ? '1px solid #fff' : 'none', marginBottom: settingsTab === 'general' ? '-1px' : '0', fontSize: '12px' }}
                  onClick={() => setSettingsTab('general')}
                >
                  Cấu hình chung
                </div>
                <div
                  style={{ padding: '6px 12px', cursor: 'pointer', borderRight: '1px solid var(--border-dark)', backgroundColor: settingsTab === 'advanced' ? '#fff' : 'transparent', fontWeight: settingsTab === 'advanced' ? 'bold' : 'normal', borderBottom: settingsTab === 'advanced' ? '1px solid #fff' : 'none', marginBottom: settingsTab === 'advanced' ? '-1px' : '0', fontSize: '12px' }}
                  onClick={() => setSettingsTab('advanced')}
                >
                  Nâng cao
                </div>
              </div>

              <div style={{ padding: '10px' }}>
                {settingsTab === 'general' && (
                  <>
                    {/* Lưu trữ & Cấu hình File */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Đường dẫn Cấu hình</legend>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: '#f0f0f0', fontSize: '10px' }}
                          value={configFilePath}
                          readOnly
                        />
                        <button
                          className="classic-btn"
                          style={{ minWidth: '85px', height: '22px' }}
                          onClick={handleOpenConfigFolder}
                          title="Mở thư mục chứa file cấu hình"
                        >
                          📁 Mở thư mục
                        </button>
                      </div>
                    </fieldset>

                    {/* Hiển thị & Thu phóng */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Hiển thị & Thu phóng</legend>
                      <div style={{ fontSize: '11px', marginBottom: '2px' }}>Tỷ lệ thu phóng ứng dụng:</div>
                      <select
                        className="classic-input"
                        style={{ width: '100%', height: '22px' }}
                        value={tempZoom}
                        onChange={e => setTempZoom(Number(e.target.value))}
                      >
                        <option value={80}>80% (Nhỏ)</option>
                        <option value={90}>90%</option>
                        <option value={100}>100% (Mặc định)</option>
                        <option value={110}>110%</option>
                        <option value={120}>120%</option>
                        <option value={130}>130%</option>
                        <option value={140}>140%</option>
                        <option value={150}>150% (Lớn)</option>
                        <option value={175}>175%</option>
                        <option value={200}>200% (Rất lớn)</option>
                      </select>
                    </fieldset>

                    {/* Thông tin Cửa hàng */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Thông tin Cửa hàng (In hóa đơn)</legend>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Tên cửa hàng:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1 }}
                          value={shopName}
                          onChange={e => setShopName(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Địa chỉ:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1 }}
                          value={shopAddress}
                          onChange={e => setShopAddress(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Số điện thoại:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1 }}
                          value={shopPhone}
                          onChange={e => setShopPhone(e.target.value)}
                        />
                      </div>
                    </fieldset>
                  </>
                )}

                {settingsTab === 'advanced' && (
                  <>
                    {/* Cấu hình Chụp ảnh iPhone (Google Drive) */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Cấu hình Chụp ảnh iPhone (Google Drive)</legend>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '100px' }}>Google Script URL:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1 }}
                          value={gasUrl}
                          onChange={e => setGasUrl(e.target.value)}
                          placeholder="Dán Web App URL của Google Apps Script"
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '100px' }}>Khóa bảo mật:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1 }}
                          value={gasToken}
                          onChange={e => setGasToken(e.target.value)}
                          placeholder="Mã bí mật xác thực kết nối điện thoại"
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '100px' }}>Mã kết nối:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: '#f0f0f0' }}
                          value={iphoneSessionId}
                          readOnly
                        />
                        <button className="classic-btn" style={{ minWidth: '60px', height: '22px' }} onClick={() => {
                          const newSess = `sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                          setIphoneSessionId(newSess);
                        }} title="Tạo mã kết nối mới cho iPhone">
                          Tạo mới
                        </button>
                      </div>
                    </fieldset>

                    {/* Cấu hình Máy in Hóa đơn */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Cấu hình Máy in Hóa đơn</legend>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '100px' }}>Kiểu in hóa đơn:</span>
                        <select
                          className="classic-input"
                          style={{ flex: 1, height: '22px' }}
                          value={printMethod}
                          onChange={e => setPrintMethod(e.target.value)}
                        >
                          <option value="browser">In qua trình duyệt (OS Print)</option>
                          <option value="network">In qua máy in mạng (TCP/IP)</option>
                        </select>
                      </div>
                      {printMethod === "network" && (
                        <>
                          <div className="form-row">
                            <span className="form-label-fixed" style={{ minWidth: '100px' }}>IP máy in mạng:</span>
                            <input
                              className="classic-input"
                              style={{ flex: 1 }}
                              value={networkPrinterIp}
                              onChange={e => setNetworkPrinterIp(e.target.value)}
                              placeholder="Ví dụ: 192.168.1.100"
                            />
                          </div>
                          <div className="form-row">
                            <span className="form-label-fixed" style={{ minWidth: '100px' }}>IP/Dải IP cần dò:</span>
                            <input
                              className="classic-input"
                              style={{ flex: 1 }}
                              value={customScanIp}
                              onChange={e => setCustomScanIp(e.target.value)}
                              placeholder="Ví dụ: 192.168.1.55 hoặc 192.168.1 (Tùy chọn)"
                            />
                          </div>
                          <div className="form-row">
                            <span className="form-label-fixed" style={{ minWidth: '100px' }}>Port cần dò:</span>
                            <input
                              className="classic-input"
                              style={{ flex: 1 }}
                              value={customScanPort}
                              onChange={e => setCustomScanPort(e.target.value)}
                              placeholder="Ví dụ: 9100, 8080 (Tùy chọn)"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {scanningTarget === 'receipt' ? (
                              <button
                                className="classic-btn"
                                style={{ flex: 1, height: '22px', backgroundColor: 'var(--text-red)', color: '#fff', borderColor: 'var(--text-red)' }}
                                onClick={async (e) => { e.preventDefault(); await tauriInvoke("cancel_printer_scan"); }}
                              >
                                ⏹️ Hủy quét mạng
                              </button>
                            ) : (
                              <button
                                className="classic-btn"
                                style={{ flex: 1, height: '22px' }}
                                onClick={(e) => { e.preventDefault(); handleScanPrinters('receipt'); }}
                                disabled={scanningTarget !== null}
                              >
                                🔍 Dò tìm máy in tự động
                              </button>
                            )}
                            <button
                              className="classic-btn"
                              style={{ flex: 1, height: '22px' }}
                              onClick={(e) => { e.preventDefault(); handleTestPrintNetwork(); }}
                            >
                              🖨️ In thử (Test)
                            </button>
                          </div>
                          {/* (Inline scan results for receipt printer removed in favor of modal) */}
                        </>
                      )}
                    </fieldset>

                    {/* Cấu hình Máy in Tem */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <legend>Cấu hình Máy in Tem</legend>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '100px' }}>Kiểu in tem:</span>
                        <select
                          className="classic-input"
                          style={{ flex: 1, height: '22px' }}
                          value={labelPrintMethod}
                          onChange={e => setLabelPrintMethod(e.target.value)}
                        >
                          <option value="browser">Không sử dụng / Chưa có</option>
                          <option value="usb">In trực tiếp qua USB (Windows Spooler)</option>
                        </select>
                      </div>
                      {labelPrintMethod === "usb" && (
                        <>
                          <div className="form-row">
                            <span className="form-label-fixed" style={{ minWidth: '100px' }}>Tên máy in USB:</span>
                            <input
                              className="classic-input"
                              style={{ flex: 1 }}
                              value={labelNetworkPrinterIp}
                              onChange={e => setLabelNetworkPrinterIp(e.target.value)}
                              placeholder="Ví dụ: Xprinter XP-350B"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            <button
                              className="classic-btn"
                              style={{ flex: 1, height: '22px' }}
                              onClick={(e) => { e.preventDefault(); handleScanPrinters('label'); }}
                              disabled={scanningTarget !== null}
                            >
                              🔍 Liệt kê máy in USB
                            </button>
                            <button
                              className="classic-btn"
                              style={{ flex: 1, height: '22px' }}
                              onClick={(e) => { e.preventDefault(); handleTestPrintLabelNetwork(); }}
                            >
                              🖨️ In thử Tem
                            </button>
                          </div>
                          {/* (Inline scan results for label printer removed in favor of modal) */}
                        </>
                      )}
                    </fieldset>

                    {/* Kết nối MSSQL Database */}
                    <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <legend style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '92%', margin: 0, padding: '0 4px' }}>
                        <span style={{ fontWeight: 'bold' }}>Kết nối CSDL MSSQL</span>
                        <button
                          className="classic-btn"
                          style={{
                            height: '18px',
                            lineHeight: '16px',
                            padding: '0 6px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            backgroundColor: dbLocked ? '#fff3cd' : '#d4edda',
                            borderColor: dbLocked ? '#ffeeba' : '#c3e6cb',
                            color: dbLocked ? '#856404' : '#155724',
                            fontWeight: 'normal'
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            setDbLocked(!dbLocked);
                          }}
                        >
                          {dbLocked ? "🔓 Mở khóa" : "🔒 Khóa lại"}
                        </button>
                      </legend>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Server IP/Name:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: dbLocked ? '#f5f5f5' : '#ffffff' }}
                          value={mssqlServer}
                          onChange={e => setMssqlServer(e.target.value)}
                          placeholder="Ví dụ: localhost hoặc 192.168.1.10"
                          disabled={dbLocked}
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Tên Database:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: dbLocked ? '#f5f5f5' : '#ffffff' }}
                          value={mssqlDbName}
                          onChange={e => setMssqlDbName(e.target.value)}
                          disabled={dbLocked}
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Tài khoản:</span>
                        <input
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: dbLocked ? '#f5f5f5' : '#ffffff' }}
                          value={mssqlUser}
                          onChange={e => setMssqlUser(e.target.value)}
                          disabled={dbLocked}
                        />
                      </div>
                      <div className="form-row">
                        <span className="form-label-fixed" style={{ minWidth: '90px' }}>Mật khẩu:</span>
                        <input
                          type="password"
                          className="classic-input"
                          style={{ flex: 1, backgroundColor: dbLocked ? '#f5f5f5' : '#ffffff' }}
                          value={mssqlPass}
                          onChange={e => setMssqlPass(e.target.value)}
                          disabled={dbLocked}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                        <button
                          className="classic-btn"
                          style={{ minWidth: '120px' }}
                          onClick={handleTestConnection}
                          disabled={testingConnection}
                        >
                          {testingConnection ? "Đang kết nối..." : "🔌 Kiểm tra kết nối"}
                        </button>

                        <button
                          className="classic-btn"
                          style={{ minWidth: '90px', backgroundColor: '#e6f3ff', borderColor: '#b3d7ff' }}
                          onClick={handleBackupDatabase}
                          title="Sao lưu database hiện tại"
                        >
                          💾 Backup DB
                        </button>

                        <button
                          className="classic-btn"
                          style={{ minWidth: '90px', backgroundColor: '#fff0f5', borderColor: '#ffc0cb' }}
                          onClick={handleFixInit}
                          title="Kiểm tra và sửa cấu trúc bảng AnhMon (thêm cột URL)"
                        >
                          🛠️ Fix Init
                        </button>

                        {mssqlTestResult && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: mssqlTestResult.success ? '#006400' : '#8b0000',
                            wordBreak: 'break-word',
                            flex: '1 1 100%'
                          }}>
                            {mssqlTestResult.msg}
                          </span>
                        )}
                      </div>
                    </fieldset>
                  </>
                )}
              </div>

              <div className="dialog-buttons" style={{ marginTop: '12px' }}>
                <button className="classic-btn" onClick={handleSaveSettings}>Lưu lại</button>
                <button className="classic-btn" onClick={() => setIsSystemModalOpen(false)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLabelPrintModalOpen && labelPrintProduct && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '400px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">In Tem Nhãn</span>
              <button className="dialog-close-btn" onClick={() => setIsLabelPrintModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div className="form-row">
                <span className="form-label-fixed">Tên mặt hàng:</span>
                <input
                  className="classic-input"
                  value={labelPrintProduct.name}
                  readOnly
                  style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed">Đơn giá:</span>
                <input
                  className="classic-input"
                  value={formatVND(labelPrintProduct.price) + " đ"}
                  readOnly
                  style={{ flex: 1, backgroundColor: '#f5f5f5', textAlign: 'right' }}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed">Số lượng tem:</span>
                <input
                  type="number"
                  className="classic-input"
                  value={labelPrintQuantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) setLabelPrintQuantity(val);
                  }}
                  onBlur={(e) => {
                    let val = parseInt(e.target.value);
                    if (isNaN(val) || val < 2) val = 2;
                    else if (val % 2 !== 0) val += 1;
                    setLabelPrintQuantity(val);
                  }}
                  min={2}
                  step={2}
                  max={100}
                  style={{ flex: 1, textAlign: 'right' }}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                />
              </div>

              <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Mẫu in (Preview):</div>
                <div style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ccc',
                  padding: '8px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre',
                  lineHeight: '1.2',
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: '80px',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  {getLabelPreviewText(labelPrintProduct.name, labelPrintProduct.price, shopName, labelPrintProduct.sku).trim()}
                </div>
              </div>

              <div className="dialog-buttons" style={{ marginTop: '15px' }}>
                <button
                  className="classic-btn"
                  onClick={() => {
                    let finalQty = labelPrintQuantity;
                    if (finalQty % 2 !== 0) finalQty += 1;
                    printLabelViaNetwork(labelPrintProduct.name, labelPrintProduct.price, finalQty, labelPrintProduct.sku);
                    setIsLabelPrintModalOpen(false);
                  }}
                  autoFocus
                >
                  🖨️ In ngay
                </button>
                <button className="classic-btn" onClick={() => setIsLabelPrintModalOpen(false)}>Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPendingModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '600px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Danh sách Hóa đơn tạm lưu</span>
              <button className="dialog-close-btn" onClick={() => setIsPendingModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div className="grid-container" style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '8px' }}>
                <table className="data-grid">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Số HĐ</th>
                      <th style={{ width: '25%' }}>Thời gian</th>
                      <th style={{ width: '30%' }}>Khách hàng</th>
                      <th style={{ width: '15%' }}>Số mặt hàng</th>
                      <th style={{ width: '15%' }}>Trị giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center" style={{ padding: '8px' }}>Không có hóa đơn tạm lưu nào.</td>
                      </tr>
                    ) : (
                      pendingInvoices.map((inv) => {
                        const total = inv.items.reduce((sum, item) => {
                          const amt = item.product.price * item.quantity;
                          const disc = item.discount || 0;
                          return sum + (amt - amt * (disc / 100));
                        }, 0);
                        return (
                          <tr key={inv.invoiceNo} style={{ cursor: 'pointer' }} onClick={() => {
                            setCart(inv.items);
                            setInvoiceNo(inv.invoiceNo);
                            setSelectedCustomer(inv.customer);
                            setCustomerSearchQuery(inv.customer.name);
                            setPosNotes(inv.notes);
                            setPendingInvoices(prev => prev.filter(p => p.invoiceNo !== inv.invoiceNo));
                            setIsPendingModalOpen(false);
                            alert(`Đã tải lại hóa đơn ${inv.invoiceNo} thành công!`);
                          }}>
                            <td>{inv.invoiceNo}</td>
                            <td>{inv.dateTime}</td>
                            <td>{inv.customer.name}</td>
                            <td className="text-center">{inv.items.length}</td>
                            <td className="text-right">{formatVND(total)}đ</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dialog-buttons">
                <button className="classic-btn" onClick={() => setIsPendingModalOpen(false)}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCustomerModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '320px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">{editingCustomer ? "Sửa Khách Hàng" : "Thêm Khách Hàng mới"}</span>
              <button className="dialog-close-btn" onClick={() => setIsCustomerModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Họ tên:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={customerForm.name}
                  onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Điện thoại:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={customerForm.phone}
                  onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Địa chỉ:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={customerForm.address}
                  onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Công nợ đầu:</span>
                <input
                  type="number"
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={customerForm.debt}
                  onChange={e => setCustomerForm({ ...customerForm, debt: Math.max(0, Number(e.target.value)) })}
                  onFocus={(e) => e.target.select()}
                  disabled={!!editingCustomer}
                />
              </div>
              <div className="dialog-buttons">
                <button className="classic-btn" onClick={async () => {
                  if (!customerForm.name.trim()) {
                    alert("Tên khách hàng không được để trống!");
                    return;
                  }

                  const today = new Date();
                  const month = today.getMonth() + 1;
                  const year = today.getFullYear();

                  if (editingCustomer) {
                    if (mssqlServer && mssqlUser) {
                      try {
                        await tauriInvoke("save_customer_db", {
                          server: mssqlServer,
                          dbName: mssqlDbName,
                          user: mssqlUser,
                          pass: mssqlPass,
                          customer: JSON.stringify({
                            id: editingCustomer.id,
                            name: customerForm.name,
                            phone: customerForm.phone,
                            address: customerForm.address,
                            debt: editingCustomer.debt
                          }),
                          month,
                          year
                        });
                      } catch (err: any) {
                        alert("Lỗi khi lưu khách hàng vào CSDL: " + err.toString());
                        return;
                      }
                    }
                    setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, name: customerForm.name, phone: customerForm.phone, address: customerForm.address } : c));
                    alert(`Đã sửa thông tin khách hàng "${customerForm.name}" thành công.`);
                  } else {
                    let newId = (Math.max(...customers.map(c => Number(c.id) || 0)) + 1).toString();
                    if (mssqlServer && mssqlUser) {
                      try {
                        const dbId = await tauriInvoke("save_customer_db", {
                          server: mssqlServer,
                          dbName: mssqlDbName,
                          user: mssqlUser,
                          pass: mssqlPass,
                          customer: JSON.stringify({
                            id: "0",
                            name: customerForm.name,
                            phone: customerForm.phone,
                            address: customerForm.address,
                            debt: customerForm.debt
                          }),
                          month,
                          year
                        }) as string;
                        if (dbId) {
                          newId = dbId;
                        }
                      } catch (err: any) {
                        alert("Lỗi khi lưu khách hàng vào CSDL: " + err.toString());
                        return;
                      }
                    }
                    setCustomers(prev => [...prev, {
                      id: newId,
                      name: customerForm.name,
                      phone: customerForm.phone,
                      address: customerForm.address,
                      debt: customerForm.debt
                    }]);
                    alert(`Đã thêm khách hàng "${customerForm.name}" thành công.`);
                  }
                  setIsCustomerModalOpen(false);
                }}>Lưu</button>
                <button className="classic-btn" onClick={() => setIsCustomerModalOpen(false)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddDebtModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '280px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Thêm nợ khách hàng</span>
              <button className="dialog-close-btn" onClick={() => setIsAddDebtModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                Khách hàng: <strong>{selectedCustomerIdx !== null && customers[selectedCustomerIdx] ? customers[selectedCustomerIdx].name : ""}</strong>
              </div>
              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                Tổng công nợ hiện tại: <strong>{selectedCustomerIdx !== null && customers[selectedCustomerIdx] ? formatVND(customers[selectedCustomerIdx].debt) : 0}đ</strong>
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Số tiền thêm nợ:</span>
                <input
                  type="number"
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={addDebtAmount}
                  onChange={e => setAddDebtAmount(Math.max(0, Number(e.target.value)))}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="dialog-buttons">
                <button className="classic-btn" onClick={async () => {
                  if (selectedCustomerIdx === null || !customers[selectedCustomerIdx]) return;
                  const cust = customers[selectedCustomerIdx];
                  if (addDebtAmount <= 0) {
                    alert("Số tiền nợ thêm phải lớn hơn 0!");
                    return;
                  }

                  const newDebt = cust.debt + addDebtAmount;
                  const today = new Date();
                  const month = today.getMonth() + 1;
                  const year = today.getFullYear();

                  if (mssqlServer && mssqlUser) {
                    try {
                      await tauriInvoke("save_customer_db", {
                        server: mssqlServer,
                        dbName: mssqlDbName,
                        user: mssqlUser,
                        pass: mssqlPass,
                        customer: JSON.stringify({
                          id: cust.id,
                          name: cust.name,
                          phone: cust.phone,
                          address: cust.address,
                          debt: newDebt
                        }),
                        month,
                        year
                      });
                    } catch (err: any) {
                      alert("Lỗi khi cập nhật công nợ vào CSDL: " + err.toString());
                      return;
                    }
                  }

                  setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, debt: newDebt } : c));
                  alert(`Đã thêm nợ ${formatVND(addDebtAmount)}đ cho khách hàng ${cust.name} thành công. Công nợ mới: ${formatVND(newDebt)}đ.`);
                  setIsAddDebtModalOpen(false);
                }}>Xác nhận</button>
                <button className="classic-btn" onClick={() => setIsAddDebtModalOpen(false)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPayDebtModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '280px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Thu nợ khách hàng</span>
              <button className="dialog-close-btn" onClick={() => setIsPayDebtModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                Khách hàng: <strong>{selectedCustomerIdx !== null && customers[selectedCustomerIdx] ? customers[selectedCustomerIdx].name : ""}</strong>
              </div>
              <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                Tổng công nợ: <strong>{selectedCustomerIdx !== null && customers[selectedCustomerIdx] ? formatVND(customers[selectedCustomerIdx].debt) : 0}đ</strong>
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Số tiền thu:</span>
                <input
                  type="number"
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={payDebtAmount}
                  onChange={e => setPayDebtAmount(Math.max(0, Number(e.target.value)))}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="dialog-buttons">
                <button className="classic-btn" onClick={async () => {
                  if (selectedCustomerIdx === null || !customers[selectedCustomerIdx]) return;
                  const cust = customers[selectedCustomerIdx];
                  if (payDebtAmount <= 0) {
                    alert("Số tiền thu nợ phải lớn hơn 0!");
                    return;
                  }
                  if (payDebtAmount > cust.debt) {
                    alert(`Số tiền thu nợ (${formatVND(payDebtAmount)}đ) không được vượt quá số nợ hiện tại (${formatVND(cust.debt)}đ)!`);
                    return;
                  }

                  const newDebt = cust.debt - payDebtAmount;
                  const today = new Date();
                  const month = today.getMonth() + 1;
                  const year = today.getFullYear();

                  if (mssqlServer && mssqlUser) {
                    try {
                      await tauriInvoke("save_customer_db", {
                        server: mssqlServer,
                        dbName: mssqlDbName,
                        user: mssqlUser,
                        pass: mssqlPass,
                        customer: JSON.stringify({
                          id: cust.id,
                          name: cust.name,
                          phone: cust.phone,
                          address: cust.address,
                          debt: newDebt
                        }),
                        month,
                        year
                      });
                    } catch (err: any) {
                      alert("Lỗi khi cập nhật công nợ vào CSDL: " + err.toString());
                      return;
                    }
                  }

                  setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, debt: newDebt } : c));
                  alert(`Đã thu nợ ${formatVND(payDebtAmount)}đ của khách hàng ${cust.name} thành công. Công nợ còn lại: ${formatVND(newDebt)}đ.`);
                  setIsPayDebtModalOpen(false);
                }}>Xác nhận</button>
                <button className="classic-btn" onClick={() => setIsPayDebtModalOpen(false)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCheckoutModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '450px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Xem trước hóa đơn - {invoiceNo}</span>
              <button className="dialog-close-btn" onClick={() => setIsCheckoutModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body" style={{ gap: '6px' }}>
              <div style={{
                backgroundColor: '#fff',
                border: '1.5px solid var(--border-dark)',
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#000',
                maxHeight: '350px',
                overflowY: 'auto'
              }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textTransform: 'uppercase' }}>
                  {shopName}
                </div>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  ĐC: {shopAddress}<br />
                  SĐT: {shopPhone}
                </div>
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div><strong>Số HĐ:</strong> {invoiceNo}</div>
                <div><strong>Ngày:</strong> {invoiceDateTime ? `${getFormattedDate(invoiceDateTime)} ${getFormattedTime(invoiceDateTime)}` : `${getFormattedDate(currentDateTime)} ${getFormattedTime(currentDateTime)}`}</div>
                <div><strong>Khách hàng:</strong> {selectedCustomer.name} {selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}</div>
                {posNotes && <div><strong>Ghi chú:</strong> {posNotes}</div>}
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }} />

                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
                      <th style={{ padding: '2px 0' }}>Tên hàng</th>
                      <th style={{ textAlign: 'right', padding: '2px 0' }}>SL</th>
                      <th style={{ textAlign: 'right', padding: '2px 0' }}>Đ.Giá</th>
                      <th style={{ textAlign: 'right', padding: '2px 0' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => {
                      const baseAmt = item.product.price * item.quantity;
                      const disc = item.discount || 0;
                      const finalAmt = baseAmt - baseAmt * (disc / 100);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                          <td style={{ padding: '4px 0', wordBreak: 'break-all' }}>{item.product.name}</td>
                          <td style={{ textAlign: 'right', padding: '4px 0' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right', padding: '4px 0' }}>{formatVND(item.product.price)}</td>
                          <td style={{ textAlign: 'right', padding: '4px 0' }}>{formatVND(finalAmt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cộng tiền hàng:</span>
                  <span>{formatVND(getCartBaseTotal())}đ</span>
                </div>
                {getCartDiscountTotal() > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'blue' }}>
                    <span>Giảm giá:</span>
                    <span>-{formatVND(getCartDiscountTotal())}đ</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', color: 'red', marginTop: '4px' }}>
                  <span>TỔNG CỘNG:</span>
                  <span>{formatVND(getCartFinalTotal())}đ</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ textAlign: 'center', fontStyle: 'italic', marginTop: '6px' }}>
                  Cảm ơn Quý khách. Hẹn gặp lại!
                </div>
              </div>

              <div className="dialog-buttons" style={{ marginTop: '8px' }}>
                <button className="classic-btn" onClick={async () => {
                  try {
                    await handleSaveSaleToDB();
                    if (printMethod === "network") {
                      const itemsToPrint = cart.map(item => {
                        const baseAmt = item.product.price * item.quantity;
                        const disc = item.discount || 0;
                        const finalAmt = baseAmt - baseAmt * (disc / 100);
                        return {
                          productName: item.product.name,
                          quantity: item.quantity,
                          price: item.product.price,
                          total: finalAmt
                        };
                      });
                      await printViaNetwork(
                        invoiceNo,
                        invoiceDateTime ? `${getFormattedDate(invoiceDateTime)} ${getFormattedTime(invoiceDateTime)}` : `${getFormattedDate(currentDateTime)} ${getFormattedTime(currentDateTime)}`,
                        selectedCustomer.name,
                        selectedCustomer.phone,
                        posNotes,
                        itemsToPrint,
                        getCartBaseTotal(),
                        getCartDiscountTotal(),
                        0,
                        getCartFinalTotal()
                      );
                    } else {
                      window.print();
                    }
                    resetPOSAfterSale();
                    alert("Đã gửi lệnh in hóa đơn thành công!");
                  } catch (e) { }
                }}>
                  🖨️ IN
                </button>
                <button className="classic-btn" onClick={async () => {
                  try {
                    await handleSaveSaleToDB();
                    resetPOSAfterSale();
                    alert("Thanh toán thành công!");
                  } catch (e) { }
                }}>
                  ✔️ OK
                </button>
                <button className="classic-btn" onClick={() => setIsCheckoutModalOpen(false)}>
                  ❌ Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isUnitManagerOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '450px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Quản lý đơn vị tính</span>
              <button className="dialog-close-btn" onClick={() => setIsUnitManagerOpen(false)}>✕</button>
            </div>
            <div className="dialog-body" style={{ gap: '10px', padding: '10px' }}>
              {/* Form thêm ĐVT */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '11px', whiteSpace: 'nowrap' }}>Tên ĐVT mới:</span>
                <input
                  className="classic-input"
                  style={{ flex: 1 }}
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  placeholder="Nhập tên ĐVT..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddUnitInline();
                    }
                  }}
                />
                <button className="classic-btn" onClick={handleAddUnitInline}>
                  Thêm mới
                </button>
              </div>

              {/* Bảng danh sách ĐVT */}
              <div className="grid-container" style={{ maxHeight: '250px', overflowY: 'auto', border: '1.5px solid var(--border-dark)' }}>
                <table className="data-grid" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '70%' }}>Tên đơn vị tính</th>
                      <th style={{ width: '30%', textAlign: 'center' }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(u => (
                      <tr key={u}>
                        <td style={{ fontWeight: 'bold' }}>{u}</td>
                        <td style={{ textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            className="classic-btn"
                            style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto' }}
                            onClick={() => handleRenameUnitInline(u)}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            className="classic-btn"
                            style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto', color: 'red' }}
                            onClick={() => handleDeleteUnitInline(u)}
                          >
                            ❌ Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button className="classic-btn" onClick={() => setIsUnitManagerOpen(false)}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {customAlert && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="classic-dialog" style={{ width: '320px', boxShadow: '3px 3px 15px rgba(0,0,0,0.3)' }}>
            <div
              className="dialog-title-bar"
              style={{
                background: customAlert.type === 'error'
                  ? 'linear-gradient(90deg, #a00000, #ff5050)'
                  : customAlert.type === 'warning'
                    ? 'linear-gradient(90deg, #a08000, #ffd700)'
                    : 'linear-gradient(90deg, #000080, #1084d0)',
                color: '#fff'
              }}
            >
              <span className="dialog-title">{customAlert.title}</span>
              <button className="dialog-close-btn" style={{ color: '#fff' }} onClick={() => setCustomAlert(null)}>✕</button>
            </div>
            <div className="dialog-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '24px' }}>
                  {customAlert.type === 'error' ? '❌' : customAlert.type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <div style={{ fontSize: '12px', whiteSpace: 'pre-line', lineHeight: '1.4', color: '#000', flex: 1 }}>
                  {customAlert.message}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  className="classic-btn"
                  style={{ minWidth: '70px', height: '23px', fontWeight: 'bold' }}
                  onClick={() => setCustomAlert(null)}
                  autoFocus
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {customConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="classic-dialog" style={{ width: '320px', boxShadow: '3px 3px 15px rgba(0,0,0,0.3)' }}>
            <div
              className="dialog-title-bar"
              style={{
                background: 'linear-gradient(90deg, #008080, #20b2aa)',
                color: '#fff'
              }}
            >
              <span className="dialog-title">{customConfirm.title}</span>
              <button className="dialog-close-btn" style={{ color: '#fff' }} onClick={() => setCustomConfirm(null)}>✕</button>
            </div>
            <div className="dialog-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '24px' }}>❓</span>
                <div style={{ fontSize: '12px', whiteSpace: 'pre-line', lineHeight: '1.4', color: '#000', flex: 1 }}>
                  {customConfirm.message}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  className="classic-btn"
                  style={{ minWidth: '75px', height: '23px', fontWeight: 'bold' }}
                  onClick={() => {
                    customConfirm.onConfirm();
                    setCustomConfirm(null);
                  }}
                  autoFocus
                >
                  Đồng ý
                </button>
                <button
                  className="classic-btn"
                  style={{ minWidth: '75px', height: '23px' }}
                  onClick={() => setCustomConfirm(null)}
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {productToDelete && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="classic-dialog" style={{ width: '360px', boxShadow: '3px 3px 15px rgba(0,0,0,0.3)' }}>
            <div
              className="dialog-title-bar"
              style={{
                background: 'linear-gradient(90deg, #a08000, #ffd700)',
                color: '#fff'
              }}
            >
              <span className="dialog-title">Xác nhận xóa</span>
              <button className="dialog-close-btn" style={{ color: '#fff' }} onClick={() => setProductToDelete(null)}>✕</button>
            </div>
            <div className="dialog-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <div style={{ fontSize: '12px', whiteSpace: 'pre-line', lineHeight: '1.4', color: '#000', flex: 1 }}>
                  Bạn có chắc chắn muốn xóa mặt hàng <strong>"{productToDelete.name}"</strong> không?
                  <br />
                  Hành động này không thể hoàn tác.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                <button
                  className="classic-btn"
                  style={{ minWidth: '80px', height: '23px', fontWeight: 'bold', color: 'red' }}
                  onClick={handleConfirmDeleteProduct}
                  autoFocus
                >
                  Xác nhận
                </button>
                <button
                  className="classic-btn"
                  style={{ minWidth: '80px', height: '23px' }}
                  onClick={() => setProductToDelete(null)}
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {imageEditProduct && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="classic-dialog" style={{ width: '600px', boxShadow: '3px 3px 15px rgba(0,0,0,0.3)' }}>
            <div
              className="dialog-title-bar"
              style={{
                background: 'linear-gradient(90deg, #000080, #1084d0)',
                color: '#fff'
              }}
            >
              <span className="dialog-title">Hình ảnh mặt hàng</span>
              <button className="dialog-close-btn" style={{ color: '#fff' }} onClick={closeImageEditModal}>✕</button>
            </div>
            <div className="dialog-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0056b3', borderBottom: '1px solid #c0c0c0', paddingBottom: '4px' }}>
                Mặt hàng: {imageEditProduct.name}
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                {/* Left Column: Preview & URL Input */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Image Preview Container */}
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{
                      width: '100%',
                      height: '180px',
                      border: '2px inset #808080',
                      background: '#f0f0f0',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden'
                    }}>
                      {imageEditLink ? (
                        <img
                          src={imageEditLink}
                          alt="Preview"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={handleImageError}
                        />
                      ) : (
                        <span style={{ color: '#808080', fontSize: '11px', fontStyle: 'italic' }}>Chưa có hình ảnh</span>
                      )}
                    </div>
                  </div>

                  {/* URL/Link Input */}
                  <div className="form-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Đường dẫn hình ảnh (URL):</span>
                    <textarea
                      className="classic-input"
                      style={{ width: '100%', height: '50px', padding: '4px', fontSize: '11px', resize: 'none' }}
                      value={imageEditLink}
                      onChange={e => setImageEditLink(e.target.value)}
                      placeholder="Dán link hình ảnh tại đây..."
                    />
                  </div>

                  {imageEditLink && (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        className="classic-btn"
                        style={{ height: '24px', color: 'red', width: '100%' }}
                        onClick={() => {
                          if (imageEditLink) {
                            if (sessionUploadedImages.includes(imageEditLink)) {
                              deleteGoogleDriveImage(imageEditLink);
                              setSessionUploadedImages(prev => prev.filter(url => url !== imageEditLink));
                            }
                            setImageEditLink("");
                          }
                        }}
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Column: QR Sync & Instructions */}
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column' }}>
                  <div className="classic-fieldset" style={{ border: '1px dashed var(--border-dark)', padding: '10px', background: '#f5f8fa', borderRadius: '4px', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--text-blue)', borderBottom: '1px solid #c0c0c0', paddingBottom: '4px', width: '100%', textAlign: 'center' }}>
                      📸 Đồng bộ Camera iPhone
                    </div>

                    {/* Large QR Code */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #ccc', padding: '8px' }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                          `${gasUrl}?session=${iphoneSessionId}&token=${gasToken}&sku=sync`
                        )}`}
                        alt="QR Code"
                        style={{ width: '140px', height: '140px' }}
                      />
                      <div style={{ fontSize: '9px', color: '#666', textAlign: 'center', fontWeight: 'bold' }}>Quét mã để kết nối</div>
                    </div>

                    {/* Instructions & Status */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#2e7d32', fontWeight: 'bold', textAlign: 'center' }}>
                        🟢 Camera iPhone Sẵn Sàng
                      </div>
                      <div style={{ fontSize: '10px', color: '#444', lineHeight: '1.4', background: '#fff', border: '1px solid #e0e0e0', padding: '6px', borderRadius: '3px' }}>
                        1. Mở camera điện thoại quét mã QR (chỉ quét 1 lần).<br />
                        2. Chụp ảnh trên điện thoại và bấm gửi.<br />
                        3. Ảnh sẽ tự động tải lên và lưu vào CSDL.
                      </div>
                      <div style={{ fontSize: '10px', color: '#0056b3', fontStyle: 'italic', fontWeight: 'bold', textAlign: 'center', marginTop: '2px' }} className="blink-text">
                        ⌛ Chờ ảnh chụp cho [{imageEditProduct.sku}]...
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px', borderTop: '1px solid #c0c0c0', paddingTop: '8px' }}>
                <button
                  className="classic-btn"
                  style={{ minWidth: '85px', height: '23px', fontWeight: 'bold' }}
                  onClick={handleSaveProductImage}
                >
                  Lưu
                </button>
                <button
                  className="classic-btn"
                  style={{ minWidth: '85px', height: '23px' }}
                  onClick={closeImageEditModal}
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print section for 80mm thermal POS receipt printer */}
      <div id="print-section" className="print-only">
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '0 0 2px 0', textTransform: 'uppercase' }}>
          {shopName}
        </div>
        <div style={{ textAlign: 'center', fontSize: '10px', margin: '0 0 6px 0' }}>
          ĐC: {shopAddress}<br />
          SĐT: {shopPhone}
        </div>
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', margin: '4px 0 6px 0' }}>
          {printJob ? "PHIẾU IN LẠI" : "PHIẾU THANH TOÁN"}
        </div>
        <div style={{ fontSize: '10px', margin: '0 0 6px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong>Số phiếu:</strong> {printJob ? printJob.invoiceNo : invoiceNo}</div>
          <div><strong>Thời gian:</strong> {printJob ? printJob.dateTimeStr : (invoiceDateTime ? `${getFormattedDate(invoiceDateTime)} ${getFormattedTime(invoiceDateTime)}` : `${getFormattedDate(currentDateTime)} ${getFormattedTime(currentDateTime)}`)}</div>
          <div><strong>Khách hàng:</strong> {printJob ? `${printJob.customerName} ${printJob.customerPhone ? `(${printJob.customerPhone})` : ''}` : `${selectedCustomer.name} ${selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}`}</div>
          {(printJob ? printJob.notes : posNotes) && <div><strong>Ghi chú:</strong> {printJob ? printJob.notes : posNotes}</div>}
        </div>
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

        <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', margin: '4px 0' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
              <th style={{ padding: '2px 0', fontWeight: 'bold' }}>Tên hàng</th>
              <th style={{ textAlign: 'right', padding: '2px 0', width: '25px', fontWeight: 'bold' }}>SL</th>
              <th style={{ textAlign: 'right', padding: '2px 0', width: '55px', fontWeight: 'bold' }}>Đ.Giá</th>
              <th style={{ textAlign: 'right', padding: '2px 0', width: '65px', fontWeight: 'bold' }}>T.Tiền</th>
            </tr>
          </thead>
          <tbody>
            {printJob ? (
              printJob.items.map((item: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                  <td style={{ padding: '3px 0', verticalAlign: 'top', wordBreak: 'break-word' }}>
                    {item.productName}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                    {item.quantity}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                    {formatVND(item.price)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                    {formatVND(item.total)}
                  </td>
                </tr>
              ))
            ) : (
              cart.map((item, idx) => {
                const baseAmt = item.product.price * item.quantity;
                const disc = item.discount || 0;
                const finalAmt = baseAmt - baseAmt * (disc / 100);
                return (
                  <tr key={idx} style={{ borderBottom: '1px dashed #ccc' }}>
                    <td style={{ padding: '3px 0', verticalAlign: 'top', wordBreak: 'break-word' }}>
                      {item.product.name}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                      {item.quantity}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                      {formatVND(item.product.price)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top' }}>
                      {formatVND(finalAmt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '3px', margin: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cộng tiền hàng:</span>
            <span>{formatVND(printJob ? printJob.baseTotal : getCartBaseTotal())}đ</span>
          </div>
          {(printJob ? printJob.discountTotal > 0 : getCartDiscountTotal() > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Giảm giá:</span>
              <span>-{formatVND(printJob ? printJob.discountTotal : getCartDiscountTotal())}đ</span>
            </div>
          )}
          {printJob?.invoiceDiscountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Chiết khấu HĐ:</span>
              <span>{printJob.invoiceDiscountPercent}%</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginTop: '2px' }}>
            <span>TỔNG CỘNG:</span>
            <span>{formatVND(printJob ? printJob.finalTotal : getCartFinalTotal())}đ</span>
          </div>
        </div>
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '10px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
          Cảm ơn Quý khách. Hẹn gặp lại!
        </div>
      </div>

      {isScanModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="classic-dialog" style={{ width: '400px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">
                {scanningTarget ? "Đang dò tìm máy in..." : "Kết quả dò tìm máy in"}
              </span>
              {!scanningTarget && (
                <button className="dialog-close-btn" style={{ color: '#fff' }} onClick={() => setIsScanModalOpen(false)}>✕</button>
              )}
            </div>
            <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {scanningTarget ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <div className="spinner" style={{ margin: '0 auto 15px auto', width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                  <div style={{ fontWeight: 'bold' }}>Đang quét mạng nội bộ... Vui lòng đợi.</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                    {lastScanTarget === 'receipt' ? (
                      <>IP: {customScanIp || 'Toàn bộ'} | Port: {customScanPort || 'Mặc định'}</>
                    ) : (
                      <>Đang liệt kê máy in USB / Hệ thống...</>
                    )}
                  </div>
                  <button 
                    className="classic-btn" 
                    style={{ marginTop: '20px', backgroundColor: 'var(--text-red)', color: '#fff', borderColor: 'var(--text-red)', width: '100%' }}
                    onClick={async () => { await tauriInvoke("cancel_printer_scan"); setIsScanModalOpen(false); }}
                  >
                    ⏹️ Hủy quét
                  </button>
                  <button 
                    className="classic-btn" 
                    style={{ marginTop: '8px', width: '100%', backgroundColor: '#f0f0f0' }}
                    onClick={() => setIsScanModalOpen(false)}
                    title="Ẩn cửa sổ này để làm việc khác, quá trình quét vẫn sẽ chạy ngầm"
                  >
                    ⬇️ Ẩn xuống nền (Chạy ngầm)
                  </button>
                </div>
              ) : (
                <div>
                  {scannedPrinters.length > 0 ? (
                    <>
                      <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>Đã tìm thấy {scannedPrinters.length} máy in (Click để chọn):</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }}>
                        {scannedPrinters.map(ip => (
                          <button
                            key={ip}
                            className="classic-btn"
                            style={{ padding: '8px', textAlign: 'left' }}
                            onClick={() => {
                              if (lastScanTarget === 'receipt') setNetworkPrinterIp(ip);
                              else setLabelNetworkPrinterIp(ip);
                              setIsScanModalOpen(false);
                            }}
                          >
                            🖨️ {ip}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '15px', color: 'var(--text-red)', fontWeight: 'bold' }}>
                      Không tìm thấy máy in nào. Vui lòng kiểm tra lại cấu hình mạng, IP, Port hoặc kết nối máy in.
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
                    <button className="classic-btn" onClick={() => setIsScanModalOpen(false)}>Đóng</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
