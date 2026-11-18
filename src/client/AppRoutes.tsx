import { Routes, Route } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import OrderPay from "./pages/OrderPay";
import MyOrders from "./pages/MyOrders";
import MyDownloads from "./pages/MyDownloads";
import Login from "./pages/Login";
import Account from "./pages/Account";
import MerchantDashboard from "./pages/MerchantDashboard";
import AdminDashboard from "./pages/AdminDashboard";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<App />}>
        <Route index element={<Home />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/order/:id" element={<OrderPay />} />
        <Route path="/my/orders" element={<MyOrders />} />
        <Route path="/my/downloads" element={<MyDownloads />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="/merchant" element={<MerchantDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>
    </Routes>
  );
}
