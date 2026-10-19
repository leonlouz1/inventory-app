import { Layout, Menu, Typography } from "antd";
import { UserButton } from "@clerk/clerk-react";
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  AppstoreOutlined,
  BankOutlined,
  TeamOutlined,
  CalendarOutlined,
  TruckOutlined,
  ContactsOutlined,
  BarChartOutlined,
  AuditOutlined,
  SendOutlined,
  LinkOutlined,
  BookOutlined,
  DollarOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useRole, DESIGNER_PATHS } from "../hooks/useRole";

const { Sider, Content, Header } = Layout;

const NAV_ITEMS = [
  { key: "/", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "/orders", label: "Orders", icon: <ShoppingCartOutlined /> },
  { key: "/shipments", label: "Shipments", icon: <TruckOutlined /> },
  { key: "/billing", label: "Billing", icon: <DollarOutlined /> },
  {
    key: "crm-group",
    label: "CRM",
    icon: <ContactsOutlined />,
    children: [
      { key: "/crm", label: "Dashboard", icon: <BarChartOutlined /> },
      { key: "/crm/accounts", label: "Accounts", icon: <TeamOutlined /> },
    ],
  },
  { key: "/customers", label: "Customers", icon: <TeamOutlined /> },
  { key: "/calendar", label: "Calendar", icon: <CalendarOutlined /> },
  { key: "/timeline", label: "Timeline", icon: <FieldTimeOutlined /> },
  { key: "/restocks", label: "Restocks", icon: <InboxOutlined /> },
  { key: "/products", label: "Products", icon: <AppstoreOutlined /> },
  { key: "/sku-groups", label: "SKU Groups", icon: <LinkOutlined /> },
  { key: "/catalog", label: "Catalog", icon: <BookOutlined /> },
  { key: "/upc", label: "UPC Codes", icon: <BarcodeOutlined /> },
  { key: "/warehouses", label: "Warehouses", icon: <BankOutlined /> },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDesigner } = useRole();
  const navItems = isDesigner ? NAV_ITEMS.filter((i) => DESIGNER_PATHS.includes(i.key)) : NAV_ITEMS;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 48, margin: 16, color: "#fff", fontWeight: 600, fontSize: 16 }}>
          Inventory
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={["crm-group"]}
          items={navItems}
          onClick={({ key }) => { if (key !== "crm-group") navigate(key); }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Inventory Management
          </Typography.Title>
          <UserButton afterSignOutUrl="/" />
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
