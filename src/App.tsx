import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { initialProducts } from "./seedData";
import { Product, CartItem, Invoice, AppData } from "./types";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState<"pos" | "inventory">("pos");
  
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  
  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posSearch, setPosSearch] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("000000001");
  const [customerName, setCustomerName] = useState("kim chung");
  
  // Inventory State
  const [inventorySearch, setInventorySearch] = useState("");

  useEffect(() => {
    // Tạm thời nạp dữ liệu mẫu
    setProducts(initialProducts);
  }, []);

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  };

  const formatVND = (amount: number) => {
    return amount.toLocaleString("vi-VN");
  };

  return (
    <div className="app-container">
      {/* Menu Bar */}
      <div className="menu-bar">
        <div className="menu-item">Hệ thống</div>
        <div className="menu-item" onClick={() => setActiveTab("pos")} style={{ fontWeight: activeTab === 'pos' ? 'bold' : 'normal' }}>Bán Hàng</div>
        <div className="menu-item">Thu Chi</div>
        <div className="menu-item" onClick={() => setActiveTab("inventory")} style={{ fontWeight: activeTab === 'inventory' ? 'bold' : 'normal' }}>Danh mục</div>
        <div className="menu-item">Trợ Giúp</div>
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
            <div className="pos-top-section">
              <div className="pos-invoice-info panel">
                <div className="form-row">
                  <span className="form-label">Mã hóa đơn</span>
                  <input className="classic-input" value={invoiceNo} readOnly style={{ width: '100px' }} />
                  <span className="form-label" style={{ minWidth: '80px' }}>Ngày hóa đơn</span>
                  <input className="classic-input" value="20/03/2026" readOnly style={{ width: '80px' }} />
                  <input className="classic-input" value="09:45" readOnly style={{ width: '50px' }} />
                  <span className="form-label" style={{ minWidth: '50px' }}>Kh.mãi</span>
                  <input className="classic-input" value="0" style={{ width: '40px', textAlign: 'right' }} />
                  <span>%</span>
                  <span className="form-label" style={{ minWidth: '70px' }}>Tiền k.mãi</span>
                  <input className="classic-input" value="0" style={{ width: '80px', textAlign: 'right' }} />
                  <span>đ</span>
                </div>
                <div className="form-row">
                  <span className="form-label">Khách hàng</span>
                  <input className="classic-input" value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ width: '234px' }} />
                  <span className="form-label" style={{ minWidth: '50px' }}>Đối tác</span>
                  <input className="classic-input" value="Không có" readOnly style={{ width: '194px' }} />
                </div>
                <div className="form-row">
                  <span className="form-label">Ghi chú</span>
                  <input className="classic-input" style={{ width: '484px' }} />
                </div>
              </div>

              {/* Totals Panel */}
              <div className="pos-totals-panel">
                <div className="total-row"><span>TỔNG CỘNG</span><span>{formatVND(getCartTotal())}</span></div>
                <div className="total-row"><span>GIẢM</span><span>0</span></div>
                <div className="total-row"><span>CÒN</span><span>{formatVND(getCartTotal())}</span></div>
                <div className="total-row"><span>ĐÃ GỒM VAT</span><span>0</span></div>
                <div className="picture-box">Mặt hàng này chưa có hình</div>
              </div>
            </div>

            {/* Middle Section: Selected Items Grid */}
            <div className="grid-container" style={{ flex: 1 }}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Tên M.Hàng</th>
                    <th style={{ width: '10%' }}>S.Lg</th>
                    <th style={{ width: '15%' }}>Đơn Giá</th>
                    <th style={{ width: '15%' }}>Cộng</th>
                    <th style={{ width: '10%' }}>Km%</th>
                    <th style={{ width: '15%' }}>Thành Tiền</th>
                    <th style={{ width: '5%' }}>Vat%</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.product.name}</td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-right">{formatVND(item.product.price)}</td>
                      <td className="text-right">{formatVND(item.product.price * item.quantity)}</td>
                      <td className="text-right">0</td>
                      <td className="text-right">{formatVND(item.product.price * item.quantity)}</td>
                      <td className="text-right">0</td>
                    </tr>
                  ))}
                  {/* Empty rows to fill space simulating classic grid */}
                  {[...Array(5)].map((_, i) => (
                    <tr key={`empty-${i}`}>
                      <td style={{height: '22px'}}></td><td></td><td></td><td></td><td></td><td></td><td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Section: Search & Product List */}
            <div className="pos-bottom-section">
              <div className="pos-search-bar">
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>SL (F11)</span>
                <input className="classic-input" value="1" style={{ width: '40px', textAlign: 'center' }} readOnly />
                <span style={{ fontSize: '11px', fontWeight: 'bold', marginLeft: '10px' }}>Mã/tên (Esc)</span>
                <input 
                  className="classic-input" 
                  style={{ width: '150px', backgroundColor: '#ffe4e1' }} 
                  value={posSearch}
                  onChange={e => setPosSearch(e.target.value)}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '10px', fontSize: '11px' }}>
                  <input type="checkbox" /> Nhập đơn giá
                </label>
                <div style={{ flex: 1 }}></div>
                <button className="tool-btn" style={{ minWidth: 'auto', flexDirection: 'row', padding: '2px 6px', height: '22px' }}>
                  <span style={{ fontSize: '12px', marginRight: '4px' }}>🔄</span> Sửa số lượng (F12)
                </button>
              </div>
              <div className="grid-container" style={{ flex: 1, margin: '0 4px 4px 4px' }}>
                <table className="data-grid">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Mã hàng</th>
                      <th style={{ width: '45%' }}>Tên M.Hàng</th>
                      <th style={{ width: '10%' }}>ĐVT</th>
                      <th style={{ width: '15%' }}>Đơn giá</th>
                      <th style={{ width: '15%' }}>Giá 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => p.name.toLowerCase().includes(posSearch.toLowerCase())).map((p) => (
                      <tr key={p.id} onClick={() => {
                        // Quick add to cart logic for demo
                        const existing = cart.find(c => c.product.id === p.id);
                        if(existing) {
                          setCart(cart.map(c => c.product.id === p.id ? {...c, quantity: c.quantity + 1} : c));
                        } else {
                          setCart([...cart, {product: p, quantity: 1}]);
                        }
                      }}>
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
                  {products.filter(p => p.name.toLowerCase().includes(inventorySearch.toLowerCase())).map((p) => (
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
        <div className="status-panel">Công ty CP TM&DT Tiến Phát</div>
      </div>
    </div>
  );
}

export default App;
