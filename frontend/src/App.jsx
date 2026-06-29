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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
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
