import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AppProvider } from './context/AppContext';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("React Error caught:", error, errorInfo);
  }
  handleHardReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.error(e);
    }
    window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
  };

  handleClearCartAndReload = async () => {
    try {
      localStorage.removeItem('naif_pos_v3_cart');
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', fontFamily: 'Cairo, sans-serif', direction: 'rtl', textAlign: 'center', background: '#fdf2f8', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fce7f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '16px' }}>🌸</div>
          <h2 style={{ color: '#be185d', fontSize: '20px', fontWeight: '900', marginBottom: '8px' }}>بيت الورد للزهور والهدايا</h2>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px', maxWidth: '420px', lineHeight: '1.6' }}>
            {this.state.error?.message || 'اضغط الزر أدناه لتحديث وتشغيل الواجهة فوراً.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
            <button 
              onClick={this.handleHardReload}
              style={{ padding: '12px 24px', background: 'linear-gradient(to right, #db2777, #9333ea)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(219,39,119,0.3)' }}
            >
              🔄 تحديث وتشغيل الواجهة
            </button>
            <button 
              onClick={this.handleClearCartAndReload}
              style={{ padding: '12px 20px', background: '#ffffff', color: '#be185d', border: '1px solid #fbcfe8', borderRadius: '16px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
            >
              🧹 تفريغ السلة وإعادة التشغيل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AppProvider>
      <App />
    </AppProvider>
  </ErrorBoundary>
);
