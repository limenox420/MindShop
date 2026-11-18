import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Image, Select, Space, Tag, Typography, App } from "antd";
import { PayCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, useSession, money } from "../lib";

const { Title, Paragraph, Text } = Typography;

type Detail = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  type: "file" | "card";
  payMethod: "qr" | "stripe" | null;
  cardStock: number;
  merchantName: string;
  categoryName: string | null;
  images: string[];
};

type Provider = { id: string; name: string };
type OrderCreated = {
  order: { id: string };
  display?: { type: "qr" | "redirect"; url?: string };
};

export default function ProductDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [provider, setProvider] = useState("manual-qr");
  const [busy, setBusy] = useState(false);

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<Detail>(`/api/catalog/products/${id}`),
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Provider[]>("/api/payments/providers"),
    enabled: !!session,
  });

  async function buy() {
    if (!session) {
      navigate("/login");
      return;
    }
    setBusy(true);
    try {
      const res = await api<OrderCreated>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ productId: id, provider: effectiveProvider }),
      });
      // Stripe: send the buyer straight to the hosted checkout page
      if (res.display?.type === "redirect" && res.display.url) {
        window.location.assign(res.display.url);
        return;
      }
      navigate(`/order/${res.order.id}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("product.orderFailed"));
      setBusy(false);
    }
  }

  if (product.isLoading) return null;
  if (product.error || !product.data) {
    return <Alert type="warning" showIcon message={t("product.notFound")} />;
  }
  const p = product.data;
  const providerOptions = (providers.data ?? [])
    .filter((pr) => {
      if (!p.payMethod) return true;
      return pr.id === (p.payMethod === "stripe" ? "stripe" : "manual-qr");
    })
    .map((pr) => ({ value: pr.id, label: pr.name }));
  const effectiveProvider = providerOptions.some((o) => o.value === provider)
    ? provider
    : providerOptions[0]?.value ?? "manual-qr";

  return (
    <Card style={{ maxWidth: 720, margin: "0 auto" }}>
      {p.images.length > 0 && (
        <Image.PreviewGroup>
          <Image
            src={`/api/catalog/products/${p.id}/images/${p.images[0]}`}
            alt={p.title}
            style={{ objectFit: "contain", maxHeight: 360, width: "100%" }}
          />
          {p.images.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {p.images.slice(1).map((imgId) => (
                <Image
                  key={imgId}
                  src={`/api/catalog/products/${p.id}/images/${imgId}`}
                  width={72}
                  height={72}
                  style={{ objectFit: "cover", borderRadius: 6 }}
                />
              ))}
            </div>
          )}
        </Image.PreviewGroup>
      )}
      <Title level={3} style={{ marginTop: p.images.length ? 16 : 0 }}>
        {p.title}
      </Title>
      {p.type === "card" && (
        <Space size={6} style={{ marginTop: 4 }}>
          <Tag color="geekblue">{t("product.typeCard")}</Tag>
          <Tag color={p.cardStock > 0 ? "green" : "red"}>
            {p.cardStock > 0
              ? t("product.stockItems", { count: p.cardStock })
              : t("product.soldOut")}
          </Tag>
        </Space>
      )}
      <Text type="secondary">
        {p.merchantName}
        {p.categoryName ? ` · ${p.categoryName}` : ""}
      </Text>
      <Paragraph style={{ whiteSpace: "pre-wrap", marginTop: 16, minHeight: 60 }}>
        {p.description || t("product.noDesc")}
      </Paragraph>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 24,
          padding: 16,
          background: "#f9f9fb",
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#4f46e5", fontSize: 28, fontWeight: 700 }}>
          {money(p.priceCents, p.currency)}
        </Text>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Select
            value={effectiveProvider}
            onChange={setProvider}
            style={{ minWidth: 160 }}
            options={providerOptions}
            placeholder={t("product.payMethod")}
          />
          <Button
            type="primary"
            size="large"
            icon={<PayCircleOutlined />}
            loading={busy}
            disabled={p.type === "card" && p.cardStock === 0}
            onClick={buy}
          >
            {p.type === "card" && p.cardStock === 0
              ? t("product.soldOut")
              : t("product.buyNow")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
