import { Layout, Menu, Typography } from "antd";
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
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

const { Sider, Content, Header } = Layout;

const NAV_ITEMS = [
  { key: "/", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "/orders", label: "Orders", icon: <ShoppingCartOutlined /> },
  { key: "/shipments", label: "Shipments", icon: <TruckOutlined /> },
  {
    key: "crm-group",
    label: "CRM",
    icon: <ContactsOutlined />,
    children: [
      { key: "/crm", label: "Dashboard", icon: <BarChartOutlined /> },
      { key: "/crm/accounts", label: "Accounts", icon: <TeamOutlined /> },
      { key: "/crm/activity", label: "Activity Log", icon: <AuditOutlined /> },
      { key: "/crm/sent", label: "Sent Tracker", icon: <SendOutlined /> },
    ],
  },
  { key: "/customers", label: "Customers", icon: <TeamOutlined /> },
  { key: "/calendar", label: "Calendar", icon: <CalendarOutlined /> },
  { key: "/timeline", label: "Timeline", icon: <FieldTimeOutlined /> },
  { key: "/restocks", label: "Restocks", icon: <InboxOutlined /> },
  { key: "/products", label: "Products", icon: <AppstoreOutlined /> },
  { key: "/warehouses", label: "Warehouses", icon: <BankOutlined /> },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

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
          items={NAV_ITEMS}
          onClick={({ key }) => { if (!key.includes("group")) navigate(key); }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
          <Typography.Title level={4} style={{ margin: 0, lineHeight: "64px" }}>
            Inventory Management
          </Typography.Title>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
