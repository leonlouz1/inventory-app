import { BrowserRouter, Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
