import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Timeline from "./pages/Timeline";
import Restocks from "./pages/Restocks";
import Products from "./pages/Products";
import Warehouses from "./pages/Warehouses";
import Customer from "./pages/Customer";
import CalendarView from "./pages/CalendarView";
import Shipments from "./pages/Shipments";
import CrmDashboard from "./pages/crm/CrmDashboard";
import CrmAccounts from "./pages/crm/CrmAccounts";
import CrmAccountDetail from "./pages/crm/CrmAccountDetail";
import CrmActivity from "./pages/crm/CrmActivity";
import CrmSentTracker from "./pages/crm/CrmSentTracker";
import SkuGroups from "./pages/SkuGroups";
import Catalog from "./pages/Catalog";
import Billing from "./pages/Billing";
import Upc from "./pages/Upc";
import OrderPage from "./pages/detail/OrderPage";
import ProductPage from "./pages/detail/ProductPage";
import ShipmentPage from "./pages/detail/ShipmentPage";
import { useRole, DESIGNER_PATHS } from "./hooks/useRole";

function DesignerRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/products" element={<Products />} />
        <Route path="/products/:sku" element={<ProductPage />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/upc" element={<Upc />} />
        <Route path="*" element={<Navigate to={DESIGNER_PATHS[0]} replace />} />
      </Route>
    </Routes>
  );
}

function AppRoutes() {
  const { isDesigner } = useRole();
  if (isDesigner) return <DesignerRoutes />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/crm" element={<CrmDashboard />} />
        <Route path="/crm/accounts" element={<CrmAccounts />} />
        <Route path="/crm/accounts/:id" element={<CrmAccountDetail />} />
        <Route path="/crm/activity" element={<CrmActivity />} />
        <Route path="/crm/sent" element={<CrmSentTracker />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/restocks" element={<Restocks />} />
        <Route path="/products" element={<Products />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/customers" element={<Customer />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/sku-groups" element={<SkuGroups />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/upc" element={<Upc />} />
        <Route path="/orders/:id" element={<OrderPage />} />
        <Route path="/products/:sku" element={<ProductPage />} />
        <Route path="/shipments/:id" element={<ShipmentPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SignedIn>
        <AppRoutes />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </BrowserRouter>
  );
}
