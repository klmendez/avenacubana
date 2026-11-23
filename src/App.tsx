import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CartBubble from "./components/CartBubble";
import PageLoading from './components/PageLoading';
import PageErrorBoundary from './components/PageErrorBoundary';

const Home = lazy(() => import('./pages/Home'));
const Catalogo = lazy(() => import('./pages/Catalogo'));
const ArmarPedido = lazy(() => import('./pages/ArmarPedido'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const OrderDetailPage = lazy(() => import('./pages/admin/OrderDetailPage'));
const Terminos = lazy(() => import('./pages/Terminos'));
const Contacto = lazy(() => import('./pages/Contacto'));
const Resenas = lazy(() => import('./pages/Resenas'));
const AdminAuth = lazy(() => import('./components/AdminAuth'));

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
}

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <div className={`site-layout min-h-dvh flex flex-col ${isAdmin ? "bg-gray-50 text-neutral-900" : "public-site bg-crema text-neutral-900"}`}>
      <ScrollToTop />
      {!isAdmin && <Navbar />}
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <div id="contenido" tabIndex={-1} className="flex-1 min-w-0">
        <PageErrorBoundary key={location.pathname.startsWith('/armar') ? '/armar' : location.pathname}><Suspense fallback={<PageLoading />}><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogo" element={<Navigate to="/productos" replace />} />
          <Route path="/productos" element={<Catalogo productType="todos" />} />
          <Route path="/menu-del-dia" element={<Navigate to="/productos" replace />} />
          <Route path="/elegir-pedido" element={<Navigate to="/productos" replace />} />
          <Route path="/reservas" element={<Navigate to="/productos" replace />} />
          <Route path="/experiencia" element={<Navigate to="/productos" replace />} />
          <Route path="/eventos" element={<Navigate to="/productos" replace />} />
          <Route path="/armar/*" element={<ArmarPedido />} />
          <Route path="/admin" element={<AdminAuth><AdminDashboard /></AdminAuth>} />
          <Route path="/admin/pedido/:id" element={<AdminAuth><OrderDetailPage /></AdminAuth>} />
          <Route path="/terminos" element={<Terminos />} />
          <Route path="/contacto" element={<Contacto />} />
          <Route path="/resenas" element={<Resenas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Suspense></PageErrorBoundary>
      </div>
      <Footer />
      {!isAdmin && <CartBubble />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
