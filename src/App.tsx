import { useState, useEffect, useRef } from "react";
import { initialProducts } from "./seedData";
import { Product, CartItem } from "./types";
import "./App.css";

const removeAccents = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
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
  const [activeTab, setActiveTab] = useState<"pos" | "inventory" | "customers">("pos");

  // Data State
  const [products, setProducts] = useState<Product[]>([]);

  // Customer State
  const [customers, setCustomers] = useState<Customer[]>([
    { id: '1', name: 'Khách lẻ', phone: '', address: '', debt: 0 },
    { id: '2', name: 'Nguyễn Văn A', phone: '0901234567', address: '123 Đường Lớn', debt: 150000 },
    { id: '3', name: 'Trần Thị B', phone: '0987654321', address: '45 Ngõ Nhỏ', debt: 0 },
    { id: '4', name: 'Công ty Điện nước Đại Việt', phone: '0243555666', address: 'KCN Bắc Thăng Long', debt: 5000000 },
  ]);
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

  // Pending Invoices State
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);

  // Modal for Checkout Review
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isUnitManagerOpen, setIsUnitManagerOpen] = useState(false);

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posSearch, setPosSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState(() => "HĐ-" + Math.floor(10000 + Math.random() * 90000));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(() => {
    return { id: '1', name: 'Khách lẻ', phone: '', address: '', debt: 0 };
  });
  const [customerSearchQuery, setCustomerSearchQuery] = useState("Khách lẻ");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [posNotes, setPosNotes] = useState("");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("");
  const [units, setUnits] = useState<string[]>(() => {
    const uniq = Array.from(new Set(initialProducts.map(p => p.unit).filter(Boolean)));
    return uniq.length > 0 ? uniq : ["Cuộn", "Cái", "Cây", "Bộ", "Mét", "Thùng"];
  });
  const [newUnitName, setNewUnitName] = useState("");
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<{ sku: string; name: string; unit: string; price: number; link?: string; available?: boolean } | null>(null);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem("app_zoom");
    return saved ? Number(saved) : 100;
  });
  const [tempZoom, setTempZoom] = useState(zoom);

  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [invoiceDateTime, setInvoiceDateTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getFormattedDate = (date: Date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const getFormattedTime = (date: Date) => {
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  // Inventory State
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryUnitFilter, setInventoryUnitFilter] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);

  // Resize State for middle section
  const [middleHeight, setMiddleHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Selection state for upper grid
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  const lastEscPress = useRef<number>(0);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingProduct || isSystemModalOpen || isCustomerModalOpen || isPayDebtModalOpen || isPendingModalOpen || isCheckoutModalOpen) {
          setEditingProduct(null);
          setIsSystemModalOpen(false);
          setIsCustomerModalOpen(false);
          setIsPayDebtModalOpen(false);
          setIsPendingModalOpen(false);
          setIsCheckoutModalOpen(false);
          return;
        }
        const now = Date.now();
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCartIndex, editingProduct, isSystemModalOpen, isCustomerModalOpen, isPayDebtModalOpen, isPendingModalOpen, isCheckoutModalOpen, cart, invoiceNo, selectedCustomer, posNotes, customers]);

  useEffect(() => {
    // Tạm thời nạp dữ liệu mẫu
    setProducts(initialProducts);
  }, []);

  useEffect(() => {
    if (editingProduct) {
      setEditForm({
        sku: editingProduct.sku,
        name: editingProduct.name,
        unit: editingProduct.unit,
        price: editingProduct.price,
        link: editingProduct.link || "",
        available: editingProduct.available !== false,
      });
    } else {
      setEditForm(null);
    }
  }, [editingProduct]);

  useEffect(() => {
    document.documentElement.style.zoom = '100%';
    const appEl = appContainerRef.current;
    if (appEl) {
      const zFactor = zoom / 100;
      appEl.style.zoom = zFactor.toString();
      appEl.style.width = `calc(100vw / ${zFactor})`;
      appEl.style.height = `calc(100vh / ${zFactor})`;
    }
    localStorage.setItem("app_zoom", zoom.toString());
  }, [zoom]);

  useEffect(() => {
    if (isSystemModalOpen) {
      setTempZoom(zoom);
    }
  }, [isSystemModalOpen, zoom]);

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

  const updateProductField = (productId: string, field: keyof Product, value: any) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const updated = { ...p, [field]: value };
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
  };

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

  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === p.id);
      if (existing) {
        return prev.map(c => c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };

  const handleSearchSubmit = () => {
    const lowerSearch = removeAccents(posSearch.toLowerCase());
    const match = products.find(p => {
      const nameNorm = removeAccents(p.name.toLowerCase());
      const skuNorm = removeAccents(p.sku.toLowerCase());
      return nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch);
    });
    if (match) {
      addToCart(match);
      setPosSearch("");
    }
  };

  const handleSaveProductEdit = () => {
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
      const newId = (Math.max(...products.map(p => Number(p.id) || 0)) + 1).toString();
      const newProd: Product = {
        id: newId,
        sku: editForm.sku,
        name: editForm.name,
        category: "Khác",
        price: editForm.price,
        cost: 0,
        stock: 0,
        unit: editForm.unit,
        link: editForm.link,
        available: editForm.available !== false,
      };
      setProducts(prev => [...prev, newProd]);
      alert(`Đã thêm mặt hàng "${editForm.name}" thành công.`);
    } else {
      // Editing existing product
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
    setSelectedCustomer(customers[0]);
    setCustomerSearchQuery(customers[0].name);
    setPosNotes("");
    setSelectedCartIndex(null);
  };

  const handleSellOnDebt = () => {
    if (cart.length === 0) {
      alert("Không có sản phẩm nào trong giỏ hàng để ghi nợ!");
      return;
    }
    if (selectedCustomer.id === '1') {
      alert("Không thể ghi nợ cho Khách lẻ. Vui lòng chọn khách hàng cụ thể hoặc thêm khách hàng mới!");
      return;
    }
    const totalToPay = getCartFinalTotal();
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, debt: c.debt + totalToPay } : c));
    setSelectedCustomer(prev => ({ ...prev, debt: prev.debt + totalToPay }));
    alert(`Hóa đơn ${invoiceNo} bán nợ thành công cho ${selectedCustomer.name}.\nSố tiền ghi nợ: ${formatVND(totalToPay)}đ.\nCông nợ: ${formatVND(selectedCustomer.debt + totalToPay)}đ.`);
    
    // Reset POS
    setCart([]);
    setInvoiceNo("HĐ-" + Math.floor(10000 + Math.random() * 90000));
    setSelectedCustomer(customers[0]);
    setCustomerSearchQuery(customers[0].name);
    setPosNotes("");
    setSelectedCartIndex(null);
  };

  const resetPOSAfterSale = () => {
    setCart([]);
    setInvoiceNo("HĐ-" + Math.floor(10000 + Math.random() * 90000));
    setSelectedCustomer(customers[0]);
    setCustomerSearchQuery(customers[0].name);
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

  const formatVND = (amount: number) => {
    return amount.toLocaleString("vi-VN");
  };

  return (
    <div ref={appContainerRef} className="app-container">
      {/* Menu Bar */}
      <div className="menu-bar">
        <div className="menu-item" onClick={() => setActiveTab("pos")} style={{ fontWeight: activeTab === 'pos' ? 'bold' : 'normal' }}>Bán Hàng</div>
        <div className="menu-item" onClick={() => setActiveTab("inventory")} style={{ fontWeight: activeTab === 'inventory' ? 'bold' : 'normal' }}>Sản phẩm</div>
        <div className="menu-item" onClick={() => setActiveTab("customers")} style={{ fontWeight: activeTab === 'customers' ? 'bold' : 'normal' }}>Khách hàng</div>
        <div style={{ flex: 1 }}></div>
        
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
            <div className="pos-top-section" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '6px' }}>
              <fieldset className="classic-fieldset" style={{ flex: '1 1 300px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend>Thông tin phiếu</legend>
                <div className="form-row">
                  <span className="form-label-fixed">Số HĐ:</span>
                  <input className="classic-input" value={invoiceNo} readOnly style={{ flex: 1, minWidth: 0 }} />
                </div>
                <div className="form-row">
                  <span className="form-label-fixed">Thời gian:</span>
                  <input className="classic-input" value={getFormattedDate(currentDateTime)} readOnly style={{ width: '80px', minWidth: 0 }} />
                  <input className="classic-input" value={getFormattedTime(currentDateTime)} readOnly style={{ width: '50px', minWidth: 0 }} />
                </div>
              </fieldset>

              <fieldset className="classic-fieldset" style={{ flex: '2 1 500px', minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend>Khách hàng & Ghi chú</legend>
                <div className="form-row">
                  <span className="form-label-fixed">Khách hàng:</span>
                  <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                    <input 
                      className="classic-input" 
                      style={{ flex: 1, minWidth: 0 }}
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
                <div className="form-row">
                  <span className="form-label-fixed">Ghi chú:</span>
                  <input 
                    className="classic-input" 
                    value={posNotes}
                    onChange={e => setPosNotes(e.target.value)}
                    onFocus={(e) => e.target.select()} 
                    style={{ flex: 1, minWidth: 0 }} 
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
                      {[...Array(5)].map((_, i) => (
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
                <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '10px' }}>ĐVT:</span>
                <select
                  className="classic-input"
                  style={{ width: '120px', marginLeft: '4px', marginRight: '6px' }}
                  value={selectedUnitFilter}
                  onChange={e => setSelectedUnitFilter(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  {units.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Mã/tên (Esc)</span>
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
                <div style={{ flex: 1 }}></div>
              </div>
              <div style={{ display: 'flex', flex: 1, padding: '0 4px 4px 4px', minHeight: 0 }}>
                {/* Search List Grid */}
                <div className="grid-container" style={{ flex: 1, margin: '0 4px 0 0' }}>
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
                      {products.filter(p => {
                        const matchesUnit = !selectedUnitFilter || p.unit === selectedUnitFilter;
                        const lowerSearch = removeAccents(posSearch.toLowerCase());
                        const nameNorm = removeAccents(p.name.toLowerCase());
                        const skuNorm = removeAccents(p.sku.toLowerCase());
                        return matchesUnit && (nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch));
                      }).map(p => (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          className={selectedProduct?.id === p.id ? "selected" : ""}
                          onClick={() => setSelectedProduct(p)}
                          onDoubleClick={() => addToCart(p)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') addToCart(p);
                          }}
                        >
                           <td>{p.sku}</td>
                          <td>{p.name}</td>
                          <td>{p.unit}</td>
                          <td className="text-right">{formatVND(p.price)}</td>
                          <td className="text-right">0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Product Image Panel */}
                <div className="pos-image-panel" style={{ margin: 0, minWidth: '200px', height: '100%', flexDirection: 'column' }}>
                  <div style={{ flex: 1, width: '100%', overflow: 'hidden', padding: '4px' }}>
                    {selectedProduct?.link ? (
                      <img src={selectedProduct.link} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
                <span className="tool-icon">➕</span>Thêm
              </button>
              <button className="tool-btn" onClick={() => setIsUnitManagerOpen(true)}>
                <span className="tool-icon">📁</span>Quản lý ĐVT
              </button>
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', gap: '4px' }}>
                <span>Lọc:</span>
                <select className="classic-input" style={{ width: '100px' }}>
                  <option>Hàng còn bán</option>
                  <option>Tất cả</option>
                </select>
                <span style={{ marginLeft: '10px' }}>ĐVT:</span>
                <select
                  className="classic-input"
                  style={{ width: '120px' }}
                  value={inventoryUnitFilter}
                  onChange={e => setInventoryUnitFilter(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  {units.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <span style={{ marginLeft: '10px' }}>Tìm(F1)</span>
                <input className="classic-input" style={{ width: '150px' }} value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}></div>
              <button className="tool-btn" onClick={() => alert("Chức năng Nhập từ Excel đang được phát triển...")}>
                <span className="tool-icon">📥</span>Import
              </button>
              <button className="tool-btn" onClick={() => {
                const headers = ["Mã hàng", "Tên M.Hàng", "ĐVT", "Đơn giá", "Kho"];
                const rows = products.map(p => [p.sku, p.name, p.unit, p.price.toString(), p.stock.toString()]);
                const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", "danh_sach_san_pham.csv");
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                alert("Đã xuất danh sách sản phẩm ra tệp CSV thành công!");
              }}>
                <span className="tool-icon">📤</span>Export
              </button>
            </div>

            {/* Main Inventory Grid */}
            <div className="grid-container" style={{ margin: '4px' }}>
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
                    <th style={{ width: '5%', textAlign: 'center' }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {products.filter(p => {
                    const matchesUnit = !inventoryUnitFilter || p.unit === inventoryUnitFilter;
                    const lowerSearch = removeAccents(inventorySearch.toLowerCase());
                    const nameNorm = removeAccents(p.name.toLowerCase());
                    const skuNorm = removeAccents(p.sku.toLowerCase());
                    return matchesUnit && (nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch));
                  }).map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <tr 
                        key={p.id}
                        className={isSelected ? "selected-row" : ""}
                        onClick={() => setSelectedProduct(p)}
                        style={{ cursor: 'pointer' }}
                      >
                        {isSelected ? (
                          <>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={p.link || ""}
                                onChange={e => updateProductField(p.id, 'link', e.target.value)}
                                onClick={e => e.stopPropagation()}
                                placeholder="URL ảnh"
                              />
                            </td>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={p.sku}
                                onChange={e => updateProductField(p.id, 'sku', e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ padding: '1px' }}>
                              <input
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 4px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={p.name}
                                onChange={e => updateProductField(p.id, 'name', e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ padding: '1px' }}>
                              <select
                                className="classic-input"
                                style={{ width: '100%', height: '22px', padding: '0 2px', margin: 0, border: '1px solid var(--border-dark)', background: '#fff', color: '#000' }}
                                value={p.unit}
                                onChange={e => updateProductField(p.id, 'unit', e.target.value)}
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
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="text-center" style={{ padding: '2px' }}>
                              {p.link ? (
                                <img src={p.link} alt={p.name} style={{ height: '20px', width: '20px', objectFit: 'contain', border: '1px solid #808080' }} />
                              ) : (
                                <span style={{ color: '#808080', fontSize: '10px' }}>[Không ảnh]</span>
                              )}
                            </td>
                            <td>{p.sku}</td>
                            <td>{p.name}</td>
                            <td>{p.unit}</td>
                            <td className="text-right">{formatVND(p.price)}</td>
                          </>
                        )}
                        <td className="text-right">0</td>
                        <td className="text-center" style={{ padding: '2px' }}>
                          <input
                            type="checkbox"
                            style={{ cursor: 'pointer' }}
                            checked={p.available !== false}
                            onChange={e => updateProductField(p.id, 'available', e.target.checked)}
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
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                        ) : (
                          <td className="text-right">{p.stock}</td>
                        )}
                        <td className="text-center" style={{ padding: '2px 0' }}>
                          <button
                            className="classic-btn"
                            style={{ color: 'red', padding: '2px 6px', fontSize: '10px', minWidth: '40px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Bạn có chắc chắn muốn xóa mặt hàng "${p.name}" không?`)) {
                                setProducts(prev => prev.filter(item => item.id !== p.id));
                                if (selectedProduct?.id === p.id) {
                                  setSelectedProduct(null);
                                }
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
              Tổng số mặt hàng: {products.length}
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
                  alert("Vui lòng chọn khách hàng cần sửa!");
                  return;
                }
                const cust = customers[selectedCustomerIdx];
                if (cust.id === '1') {
                  alert("Không thể sửa thông tin của Khách lẻ mặc định!");
                  return;
                }
                setEditingCustomer(cust);
                setCustomerForm({ name: cust.name, phone: cust.phone, address: cust.address, debt: cust.debt });
                setIsCustomerModalOpen(true);
              }}><span className="tool-icon">✏️</span>Sửa KH</button>
              
              <button className="tool-btn" onClick={() => {
                if (selectedCustomerIdx === null) {
                  alert("Vui lòng chọn khách hàng cần xóa!");
                  return;
                }
                const cust = customers[selectedCustomerIdx];
                if (cust.id === '1') {
                  alert("Không thể xóa Khách lẻ mặc định!");
                  return;
                }
                if (confirm(`Bạn có chắc chắn muốn xóa khách hàng "${cust.name}"?`)) {
                  setCustomers(prev => prev.filter(c => c.id !== cust.id));
                  setSelectedCustomerIdx(null);
                }
              }}><span className="tool-icon">❌</span>Xóa KH</button>

              <div style={{ width: '1px', backgroundColor: 'var(--border-dark)', margin: '0 4px' }}></div>

              <button className="tool-btn" onClick={() => {
                if (selectedCustomerIdx === null) {
                  alert("Vui lòng chọn khách hàng cần thu nợ!");
                  return;
                }
                const cust = customers[selectedCustomerIdx];
                if (cust.id === '1') {
                  alert("Khách lẻ mặc định không có công nợ cần thu!");
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
                <span>Tìm kiếm:</span>
                <input 
                  className="classic-input" 
                  style={{ width: '150px' }} 
                  value={customerSearch} 
                  onChange={e => setCustomerSearch(e.target.value)} 
                  placeholder="Tên hoặc SĐT..."
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>

            {/* Customer Data Grid */}
            <div className="grid-container" style={{ margin: '4px', flex: 1, overflowY: 'auto' }}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Mã KH</th>
                    <th style={{ width: '25%' }}>Tên Khách Hàng</th>
                    <th style={{ width: '20%' }}>Số điện thoại</th>
                    <th style={{ width: '25%' }}>Địa chỉ</th>
                    <th style={{ width: '15%' }}>Công nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.filter(c => {
                    const query = removeAccents(customerSearch.toLowerCase());
                    const nameNorm = removeAccents(c.name.toLowerCase());
                    return nameNorm.includes(query) || c.phone.includes(query);
                  }).map((c, idx) => (
                    <tr 
                      key={c.id} 
                      className={selectedCustomerIdx === idx ? "selected-row" : ""}
                      onClick={() => setSelectedCustomerIdx(idx)}
                    >
                      <td>KH-{c.id.padStart(4, '0')}</td>
                      <td>{c.name}</td>
                      <td>{c.phone}</td>
                      <td>{c.address}</td>
                      <td className="text-right" style={{ color: c.debt > 0 ? 'var(--text-red)' : 'var(--text-blue)', fontWeight: c.debt > 0 ? 'bold' : 'normal' }}>
                        {formatVND(c.debt)}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--text-blue)' }}>
              Tổng số khách hàng: {customers.length}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-panel">User: admin</div>
        <div className="status-panel">Ca: 1</div>
        <div className="status-panel">Server: MSSQL_PREP (Chưa kết nối)</div>
        <div className="status-panel" style={{ flex: 1 }}>hiện giờ không có khuyến mãi</div>
        <div className="status-panel">Điện nước TÂM NHI - 2026</div>
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
              
              <div className="dialog-buttons">
                <button className="classic-btn" onClick={handleSaveProductEdit}>Ghi lại</button>
                <button className="classic-btn" onClick={() => setEditingProduct(null)}>Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSystemModalOpen && (
        <div className="modal-overlay">
          <div className="classic-dialog" style={{ width: '280px' }}>
            <div className="dialog-title-bar">
              <span className="dialog-title">Cấu hình Hệ thống</span>
              <button className="dialog-close-btn" onClick={() => setIsSystemModalOpen(false)}>✕</button>
            </div>
            <div className="dialog-body">
              <fieldset className="classic-fieldset" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <legend>Hiển thị & Thu phóng</legend>
                <div style={{ fontSize: '11px', marginBottom: '4px' }}>Tỷ lệ thu phóng ứng dụng:</div>
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
              
              <div className="dialog-buttons" style={{ marginTop: '10px' }}>
                <button 
                  className="classic-btn" 
                  onClick={() => {
                    setZoom(tempZoom);
                    setIsSystemModalOpen(false);
                  }}
                >
                  Lưu lại
                </button>
                <button 
                  className="classic-btn" 
                  onClick={() => setIsSystemModalOpen(false)}
                >
                  Hủy bỏ
                </button>
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
                <button className="classic-btn" onClick={() => {
                  if (!customerForm.name.trim()) {
                    alert("Tên khách hàng không được để trống!");
                    return;
                  }
                  if (editingCustomer) {
                    setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, name: customerForm.name, phone: customerForm.phone, address: customerForm.address } : c));
                    alert(`Đã sửa thông tin khách hàng "${customerForm.name}" thành công.`);
                  } else {
                    const newId = (Math.max(...customers.map(c => Number(c.id))) + 1).toString();
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
                }}>Ghi lại</button>
                <button className="classic-btn" onClick={() => setIsCustomerModalOpen(false)}>Hủy bỏ</button>
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
                <button className="classic-btn" onClick={() => {
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
                  setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, debt: c.debt - payDebtAmount } : c));
                  alert(`Đã thu nợ ${formatVND(payDebtAmount)}đ của khách hàng ${cust.name} thành công. Công nợ còn lại: ${formatVND(cust.debt - payDebtAmount)}đ.`);
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
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                  CỬA HÀNG ĐIỆN NƯỚC TÂM NHI
                </div>
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  ĐC: Khu phố 3, Thị trấn Củ Chi, TP. HCM<br/>
                  SĐT: 0908 123 456
                </div>
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }}/>
                <div><strong>Số HĐ:</strong> {invoiceNo}</div>
                <div><strong>Ngày:</strong> {invoiceDateTime ? `${getFormattedDate(invoiceDateTime)} ${getFormattedTime(invoiceDateTime)}` : `${getFormattedDate(currentDateTime)} ${getFormattedTime(currentDateTime)}`}</div>
                <div><strong>Khách hàng:</strong> {selectedCustomer.name} {selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}</div>
                {posNotes && <div><strong>Ghi chú:</strong> {posNotes}</div>}
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }}/>
                
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
                
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }}/>
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
                <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '6px 0' }}/>
                <div style={{ textAlign: 'center', fontStyle: 'italic', marginTop: '6px' }}>
                  Cảm ơn Quý khách. Hẹn gặp lại!
                </div>
              </div>
              
              <div className="dialog-buttons" style={{ marginTop: '8px' }}>
                <button className="classic-btn" onClick={() => {
                  window.print();
                  resetPOSAfterSale();
                  alert("Đã gửi lệnh in hóa đơn thành công!");
                }}>
                  🖨️ IN
                </button>
                <button className="classic-btn" onClick={() => {
                  resetPOSAfterSale();
                  alert("Thanh toán thành công!");
                }}>
                  ✔️ Đóng
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

      {/* Print section for 80mm thermal POS receipt printer */}
      <div id="print-section" className="print-only">
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '0 0 2px 0', textTransform: 'uppercase' }}>
          Điện nước Tâm Nhi
        </div>
        <div style={{ textAlign: 'center', fontSize: '10px', margin: '0 0 6px 0' }}>
          ĐC: Khu phố 3, TT. Củ Chi, Củ Chi, TP.HCM<br />
          SĐT: 0908 123 456
        </div>
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', margin: '4px 0 6px 0' }}>
          PHIẾU THANH TOÁN
        </div>
        <div style={{ fontSize: '10px', margin: '0 0 6px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div><strong>Số phiếu:</strong> {invoiceNo}</div>
          <div><strong>Thời gian:</strong> {invoiceDateTime ? `${getFormattedDate(invoiceDateTime)} ${getFormattedTime(invoiceDateTime)}` : `${getFormattedDate(currentDateTime)} ${getFormattedTime(currentDateTime)}`}</div>
          <div><strong>Khách hàng:</strong> {selectedCustomer.name} {selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}</div>
          {posNotes && <div><strong>Ghi chú:</strong> {posNotes}</div>}
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
            {cart.map((item, idx) => {
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
            })}
          </tbody>
        </table>
        
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '3px', margin: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cộng tiền hàng:</span>
            <span>{formatVND(getCartBaseTotal())}đ</span>
          </div>
          {getCartDiscountTotal() > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Giảm giá:</span>
              <span>-{formatVND(getCartDiscountTotal())}đ</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginTop: '2px' }}>
            <span>TỔNG CỘNG:</span>
            <span>{formatVND(getCartFinalTotal())}đ</span>
          </div>
        </div>
        <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '10px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
          Cảm ơn Quý khách. Hẹn gặp lại!
        </div>
      </div>
    </div>
  );
}

export default App;
