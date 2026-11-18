import { useEffect, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, Button, Dropdown, Layout, Space, type MenuProps } from "antd";
import { useQuery } from "@tanstack/react-query";
import {
  CloudDownloadOutlined,
  GlobalOutlined,
  LogoutOutlined,
  ShopOutlined,
  ShoppingOutlined,
  UserOutlined,
  UserSwitchOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, signOut, useSession, userRole } from "./lib";
import { changeLanguage, LANGUAGES } from "./i18n";

const { Header, Content, Footer } = Layout;

type SiteInfo = {
  siteTitle: string | null;
  contact: string | null;
  allowIndex?: boolean;
};

export default function App() {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const user = session?.user;
  const site = useQuery({
    queryKey: ["site"],
    queryFn: () => api<SiteInfo>("/api/catalog/site"),
    staleTime: 60_000,
  });
  const siteTitle = site.data?.siteTitle || "MindShop";
  useEffect(() => {
    document.title = siteTitle;
  }, [siteTitle]);
  useEffect(() => {
    const allowIndex = site.data?.allowIndex !== false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (allowIndex) {
      meta?.remove();
    } else {
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "robots";
        document.head.appendChild(meta);
      }
      meta.content = "noindex, nofollow";
    }
  }, [site.data?.allowIndex]);

  const navItems = useMemo(() => {
    const base = [
      { key: "/", icon: <AppstoreOutlined />, label: t("nav.shop") },
    ];
    if (user) {
      base.push(
        { key: "/my/orders", icon: <ShoppingOutlined />, label: t("nav.myOrders") },
        {
          key: "/my/downloads",
          icon: <CloudDownloadOutlined />,
          label: t("nav.myProducts"),
        },
      );
      if (userRole(user) === "merchant") {
        base.push({ key: "/merchant", icon: <ShopOutlined />, label: t("nav.merchantPanel") });
      }
      if (userRole(user) === "admin") {
        base.push({
          key: "/admin",
          icon: <UserSwitchOutlined />,
          label: t("nav.adminPanel"),
        });
      }
    }
    return base;
  }, [user, t]);

  const current = "/" + (location.pathname.split("/")[1] ?? "");

  const langMenu: MenuProps["items"] = LANGUAGES.map((l) => ({
    key: l.code,
    label: l.code === i18n.language ? `${l.label} ✓` : l.label,
    onClick: () => changeLanguage(l.code),
  }));

  const avatarMenu: MenuProps["items"] = [
    {
      key: "account",
      icon: <UserOutlined />,
      label: t("nav.accountSettings"),
      onClick: () => navigate("/account"),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: t("nav.logout"),
      onClick: async () => {
        await signOut();
        navigate("/");
      },
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          position: "sticky",
          top: 0,
          zIndex: 100,
          paddingInline: 24,
        }}
      >
        <Link
          to="/"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#4f46e5",
            marginRight: 8,
            whiteSpace: "nowrap",
          }}
        >
          {siteTitle}
        </Link>
        <nav style={{ flex: 1, display: "flex", gap: 2, minWidth: 0, overflowX: "auto" }}>
          {navItems.map((item) => (
            <Link
              key={item.key}
              to={item.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                whiteSpace: "nowrap",
                fontSize: 14,
                fontWeight: current === item.key ? 600 : 400,
                color: current === item.key ? "#4f46e5" : "#555",
                background: current === item.key ? "#eef2ff" : "transparent",
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <Dropdown menu={{ items: langMenu }} placement="bottomRight">
          <span
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
              color: "#555",
              fontSize: 14,
            }}
          >
            <GlobalOutlined />
            {LANGUAGES.find((l) => l.code === i18n.language)?.label ?? "中文"}
          </span>
        </Dropdown>
        {user ? (
          <Dropdown menu={{ items: avatarMenu }} placement="bottomRight">
            <span style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <Avatar size="small" icon={<UserOutlined />} />
              {user.name}
            </span>
          </Dropdown>
        ) : (
          <Space>
            <Button type="primary" onClick={() => navigate("/login")}>
              {t("nav.loginRegister")}
            </Button>
          </Space>
        )}
      </Header>
      <Content style={{ padding: "24px 16px", maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: "center", color: "#999", fontSize: 12 }}>
        <div>
          {siteTitle} · {t("nav.tagline")}
        </div>
        {site.data?.contact && (
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
            {site.data.contact}
          </div>
        )}
      </Footer>
    </Layout>
  );
}
