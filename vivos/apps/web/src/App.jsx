import React, { useEffect, useState } from 'react';
import { ShoppingBag, Search, Menu } from 'lucide-react';
import axios from 'axios';

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/products')
      .then(res => setProducts(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur border-b border-slate-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-slate-800 rounded-lg lg:hidden">
              <Menu size={24} />
            </button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              VIVA STORE
            </h1>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-8 relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="ابحث عن منتجات..." 
              className="w-full bg-slate-800 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 ring-blue-500 outline-none transition-all"
            />
          </div>

          <button className="relative p-2 hover:bg-slate-800 rounded-full transition-colors">
            <ShoppingBag size={24} />
            <span className="absolute top-0 right-0 w-5 h-5 bg-blue-500 text-xs flex items-center justify-center rounded-full font-bold">0</span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 py-20 px-4 text-center">
        <h2 className="text-5xl font-extrabold mb-6 tracking-tight">
          تجهّز <span className="text-blue-500">للنصر</span>
        </h2>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
          أفضل المعدات الرياضية للمحترفين والهواة. جودة عالمية وأسعار تنافسية.
        </p>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-bold text-lg transition-transform hover:scale-105">
          تسوق الآن
        </button>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto p-6">
        <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <span className="w-2 h-8 bg-blue-500 rounded-full"></span>
          أحدث المنتجات
        </h3>
        
        {loading ? (
          <div className="text-center py-20 text-slate-500">جاري التحميل...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map(p => (
              <div key={p.id} className="group bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 hover:border-blue-500 transition-all hover:shadow-2xl hover:shadow-blue-500/10">
                <div className="relative aspect-video overflow-hidden">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <button className="w-full bg-white text-slate-900 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors">
                      أضف للسلة
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs text-blue-400 font-bold mb-2 uppercase tracking-wider">{p.category}</div>
                  <h4 className="text-xl font-bold mb-2">{p.name}</h4>
                  <div className="text-2xl font-bold text-emerald-400">${p.price}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
