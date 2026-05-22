import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { initialProducts } from "./seedData";
import { Product, CartItem, Invoice, AppData } from "./types";
import "./App.css";

const removeAccents = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
};

function App() {
  const [activeTab, setActiveTab] = useState<"pos" | "inventory">("pos");

  // Data State
  const [products, setProducts] = useState<Product[]>([]);

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posSearch, setPosSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("000000001");
  const [customerName, setCustomerName] = useState("kim chung");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<{ sku: string; name: string; unit: string; price: number } | null>(null);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem("app_zoom");
    return saved ? Number(saved) : 100;
  });
  const [tempZoom, setTempZoom] = useState(zoom);

  // Inventory State
  const [inventorySearch, setInventorySearch] = useState("");

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
        if (editingProduct || isSystemModalOpen) {
          setEditingProduct(null);
          setIsSystemModalOpen(false);
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
      if (e.key === 'Delete' && selectedCartIndex !== null && document.activeElement?.tagName !== 'INPUT') {
        setCart(prev => prev.filter((_, i) => i !== selectedCartIndex));
        setSelectedCartIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCartIndex, editingProduct, isSystemModalOpen]);

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
    if (editingProduct || isSystemModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [editingProduct, isSystemModalOpen]);

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

    setEditingProduct(null);
  };

  const updateCartItem = (index: number, field: 'quantity' | 'price' | 'discount', value: number) => {
    if (field === 'quantity' && value <= 0) {
      setCart(prev => prev.filter((_, i) => i !== index));
      if (selectedCartIndex === index) setSelectedCartIndex(null);
      return;
    }
    const newCart = [...cart];
    if (field === 'quantity') {
      newCart[index].quantity = value;
    } else if (field === 'price') {
      newCart[index].product = { ...newCart[index].product, price: value };
    } else if (field === 'discount') {
      newCart[index].discount = value;
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
        <div style={{ flex: 1 }}></div>
        <div className="menu-item" onClick={() => setIsSystemModalOpen(true)}>Hệ thống</div>
      </div>

      <div className="main-content">
        {activeTab === "pos" && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* POS Toolbar */}
            <div className="toolbar">
              <button className="tool-btn"><span className="tool-icon">💾</span>Tạm lưu(F1)</button>
              <button className="tool-btn"><span className="tool-icon">💰</span>Thanh toán(F2)</button>
              <button className="tool-btn"><span className="tool-icon">📝</span>Bán nợ(F3)</button>
              <button className="tool-btn"><span className="tool-icon">🔙</span>Phiếu trả hàng</button>
              <button className="tool-btn"><span className="tool-icon">📉</span>Giảm %(F5)</button>
              <button className="tool-btn"><span className="tool-icon">💵</span>Giảm tiền(F6)</button>
              <button className="tool-btn"><span className="tool-icon">👤</span>Khách hàng(F7)</button>
              <button className="tool-btn"><span className="tool-icon">🤝</span>Đối tác(F8)</button>
              <button className="tool-btn"><span className="tool-icon">📄</span>HĐ tạm lưu(F9)</button>
            </div>

            {/* Top Section: Invoice Info */}
            <div className="pos-top-section" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '6px' }}>
              <fieldset className="classic-fieldset" style={{ flex: '1.5 1 220px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend>Thông tin phiếu</legend>
                <div className="form-row">
                  <span className="form-label-fixed">Số HĐ:</span>
                  <input className="classic-input" value={invoiceNo} readOnly style={{ flex: 1, minWidth: 0 }} />
                </div>
                <div className="form-row">
                  <span className="form-label-fixed">Thời gian:</span>
                  <input className="classic-input" value="20/03/2026" readOnly style={{ width: '80px', minWidth: 0 }} />
                  <input className="classic-input" value="09:45" readOnly style={{ width: '50px', minWidth: 0 }} />
                </div>
              </fieldset>

              <fieldset className="classic-fieldset" style={{ flex: '3.5 1 350px', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend>Khách hàng & Ghi chú</legend>
                <div className="form-row">
                  <span className="form-label-fixed">Khách hàng:</span>
                  <input className="classic-input" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                  <span className="form-label-fixed" style={{ minWidth: '45px' }}>Đối tác:</span>
                  <input className="classic-input" value="Không có" readOnly style={{ width: '120px', minWidth: 0 }} />
                </div>
                <div className="form-row">
                  <span className="form-label-fixed">Ghi chú:</span>
                  <input className="classic-input" style={{ flex: 1, minWidth: 0 }} />
                </div>
              </fieldset>

              <fieldset className="classic-fieldset" style={{ flex: '2 1 180px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend>Khuyến mãi hóa đơn</legend>
                <div className="form-row">
                  <span className="form-label-fixed">Giảm (%):</span>
                  <input className="classic-input" value="0" style={{ width: '50px', textAlign: 'right', minWidth: 0 }} />
                </div>
                <div className="form-row">
                  <span className="form-label-fixed">Giảm tiền:</span>
                  <input className="classic-input" value="0" style={{ flex: 1, textAlign: 'right', minWidth: 0 }} />
                  <span style={{ fontSize: '11px', marginLeft: '2px' }}>đ</span>
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
                                onFocus={() => {
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
                                onFocus={() => {
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
                                onFocus={() => {
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
                    <div className="total-row"><span>TỔNG CỘNG</span><span>{formatVND(getCartBaseTotal())}</span></div>
                    <div className="total-row" style={{ color: 'var(--text-red)' }}><span>GIẢM</span><span>{formatVND(getCartDiscountTotal())}</span></div>
                    <div className="total-row" style={{ fontWeight: 'bold' }}><span>CÒN</span><span>{formatVND(getCartFinalTotal())}</span></div>
                  </div>
                  <button className="checkout-btn">
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
                        <th style={{ width: '40%' }}>Tên M.Hàng</th>
                        <th style={{ width: '10%' }}>ĐVT</th>
                        <th style={{ width: '15%' }}>Đơn giá</th>
                        <th style={{ width: '10%' }}>Giá 2</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Sửa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.filter(p => {
                        const lowerSearch = removeAccents(posSearch.toLowerCase());
                        const nameNorm = removeAccents(p.name.toLowerCase());
                        const skuNorm = removeAccents(p.sku.toLowerCase());
                        return nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch);
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
                          <td className="text-center" style={{ padding: '2px 0' }}>
                            <button
                              className="classic-btn"
                              style={{ height: '18px', padding: '0 6px', fontSize: '10px', minWidth: '40px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProduct(p);
                              }}
                            >
                              Sửa
                            </button>
                          </td>
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
              <button className="tool-btn"><span className="tool-icon">➕</span>Thêm</button>
              <button className="tool-btn"><span className="tool-icon">✏️</span>Sửa</button>
              <button className="tool-btn"><span className="tool-icon">❌</span>Xóa</button>
              <div style={{ width: '1px', backgroundColor: 'var(--border-dark)', margin: '0 4px' }}></div>
              <button className="tool-btn"><span className="tool-icon">📂</span>Gom nhóm</button>
              <button className="tool-btn"><span className="tool-icon">👁️</span>Xem</button>
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px', gap: '4px' }}>
                <span>Lọc:</span>
                <select className="classic-input" style={{ width: '100px' }}>
                  <option>Hàng còn bán</option>
                  <option>Tất cả</option>
                </select>
                <span style={{ marginLeft: '10px' }}>Tìm(F1)</span>
                <input className="classic-input" style={{ width: '150px' }} value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}></div>
              <button className="tool-btn"><span className="tool-icon">📥</span>Import</button>
              <button className="tool-btn"><span className="tool-icon">📤</span>Export</button>
              <button className="tool-btn"><span className="tool-icon">↕️</span>Tăng/giảm giá</button>
            </div>

            {/* Main Inventory Grid */}
            <div className="grid-container" style={{ margin: '4px' }}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th style={{ width: '10%' }}>Nhóm</th>
                    <th style={{ width: '25%' }}>Tên M.Hàng</th>
                    <th style={{ width: '10%' }}>Mã hàng</th>
                    <th style={{ width: '5%' }}>ĐVT</th>
                    <th style={{ width: '10%' }}>Đơn giá</th>
                    <th style={{ width: '10%' }}>Đ.giá 2</th>
                    <th style={{ width: '10%' }}>Tính chất MH</th>
                    <th style={{ width: '5%' }}>Còn bán</th>
                    <th style={{ width: '5%' }}>Tồn t.thiểu</th>
                    <th style={{ width: '10%' }}>Ghi Chú</th>
                  </tr>
                </thead>
                <tbody>
                  {products.filter(p => {
                    const lowerSearch = removeAccents(inventorySearch.toLowerCase());
                    const nameNorm = removeAccents(p.name.toLowerCase());
                    const skuNorm = removeAccents(p.sku.toLowerCase());
                    return nameNorm.includes(lowerSearch) || skuNorm.includes(lowerSearch);
                  }).map((p) => (
                    <tr key={p.id}>
                      <td>{p.category}</td>
                      <td>{p.name}</td>
                      <td>{p.sku}</td>
                      <td>{p.unit}</td>
                      <td className="text-right">{formatVND(p.price)}</td>
                      <td className="text-right">0</td>
                      <td>Hàng chuyên bán</td>
                      <td className="text-center">☑</td>
                      <td className="text-right">0</td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--text-blue)' }}>
              Tổng số mặt hàng: {products.length}
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
              <span className="dialog-title">Cập nhật thông tin mặt hàng</span>
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
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Tên mặt hàng:</span>
                <input 
                  className="classic-input" 
                  style={{ flex: 1 }} 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>ĐVT:</span>
                <input 
                  className="classic-input" 
                  style={{ flex: 1 }} 
                  value={editForm.unit} 
                  onChange={e => setEditForm({ ...editForm, unit: e.target.value })} 
                />
              </div>
              <div className="form-row">
                <span className="form-label-fixed" style={{ minWidth: '85px' }}>Đơn giá:</span>
                <input 
                  type="number" 
                  className="classic-input" 
                  style={{ flex: 1 }} 
                  value={editForm.price} 
                  onChange={e => setEditForm({ ...editForm, price: Number(e.target.value) })} 
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
    </div>
  );
}

export default App;
