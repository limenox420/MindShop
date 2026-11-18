import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Alert, App, Button, Card, Image, Result, Space, Spin, Steps, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  QrcodeOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Trans, useTranslation } from "react-i18next";
import { api, money } from "../lib";

const { Title, Paragraph, Text } = Typography;

function errText(e: unknown): string {
  return String(e).replace("Error: ", "");
}

type Order = {
  id: string;
  orderNo: string;
  productTitle: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerData: { qrObjectKey?: string } | null;
  createdAt: string;
};

export default function OrderPay() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: o, isLoading, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/api/orders/${id}`),
    refetchInterval: (query) =>
      query.state.data?.status === "pending_payment" ? 5000 : false,
  });

  const card = useQuery({
    queryKey: ["order-card", id],
    queryFn: () => api<{ content: string }>(`/api/orders/${id}/card`),
    enabled: o?.status === "delivered" || o?.status === "completed",
  });

  // Stripe: open the hosted checkout again if the buyer closed it earlier
  const stripePay = useMutation({
    mutationFn: () =>
      api<{ display: { type: string; url?: string } }>(`/api/orders/${id}/checkout`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      if (res.display.type === "redirect" && res.display.url) {
        window.location.assign(res.display.url);
        return;
      }
      qc.invalidateQueries({ queryKey: ["order", id] });
    },
    onError: (e) => message.error(errText(e)),
  });

  if (error)
    return (
      <Result
        status="404"
        title={t("orderPay.notFound")}
        extra={
          <Link to="/my/orders">
            <Button type="primary">{t("orderPay.backToOrders")}</Button>
          </Link>
        }
      />
    );

  if (isLoading || !o)
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );

  const stepIndex = {
    pending_payment: 1,
    paid: 2,
    delivered: 3,
    completed: 3,
    cancelled: 0,
  }[o.status] as number;
  const qrUrl = o.providerData?.qrObjectKey
    ? `/api/files/qr/${encodeURIComponent(o.providerData.qrObjectKey)}`
    : null;

  return (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>
          {t("orderPay.order")} <Text code>{o.orderNo}</Text>
        </Title>
      </div>
      <Text type="secondary">
        {t("orderPay.productLabel")}{o.productTitle} · {t("orderPay.amountLabel")}
        <Text strong style={{ color: "#4f46e5" }}>
          {money(o.amountCents, o.currency)}
        </Text>
      </Text>

      {o.status !== "cancelled" && (
        <Steps
          style={{ marginTop: 24 }}
          size="small"
          current={stepIndex}
          status={o.status === "pending_payment" ? "process" : "finish"}
          items={[
            { title: t("orderPay.stepCreate"), icon: <CheckCircleOutlined /> },
            { title: t("orderPay.stepPay"), icon: <QrcodeOutlined /> },
            { title: t("orderPay.stepConfirm"), icon: <ClockCircleOutlined /> },
            { title: t("orderPay.stepDeliver"), icon: <SendOutlined /> },
          ]}
        />
      )}

      {o.status === "pending_payment" && o.provider === "stripe" && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Alert
            type="info"
            showIcon
            message={t("orderPay.stripeTitle")}
            description={t("orderPay.stripeDesc")}
          />
          <Button
            type="primary"
            size="large"
            icon={<CreditCardOutlined />}
            style={{ marginTop: 16 }}
            loading={stripePay.isPending}
            onClick={() => stripePay.mutate()}
          >
            {t("orderPay.stripeContinue")}
          </Button>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("orderPay.autoRefresh")}
            </Text>
          </div>
        </div>
      )}

      {o.status === "pending_payment" && qrUrl && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Image
            src={qrUrl}
            alt={t("orderPay.qrAlt")}
            width={260}
            style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}
          />
          <Alert
            style={{ marginTop: 16, textAlign: "left" }}
            type="info"
            showIcon
            message={t("orderPay.scanTitle")}
            description={
              <Trans
                i18nKey="orderPay.transferDescription"
                values={{
                  amount: `${(o.amountCents / 100).toFixed(2)} ${o.currency}`,
                  orderNo: o.orderNo,
                }}
                components={{
                  b: <Text strong style={{ color: "#4f46e5" }} />,
                  code: <Text code copyable />,
                }}
              />
            }
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("orderPay.autoRefresh")}
          </Text>
        </div>
      )}

      {o.status === "paid" && (
        <Alert
          style={{ marginTop: 24 }}
          type="warning"
          showIcon
          message={t("orderPay.paidWaiting")}
        />
      )}

      {(o.status === "delivered" || o.status === "completed") && (
        <Alert
          style={{ marginTop: 24 }}
          type="success"
          showIcon
          message={t("orderPay.deliveredTitle")}
          description={
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {card.data && (
                <div>
                  <Title level={5} style={{ marginBottom: 4 }}>
                    {t("orderPay.cardTitle")}
                  </Title>
                  <Paragraph
                    code
                    copyable
                    style={{ fontSize: 16, wordBreak: "break-all", marginBottom: 4 }}
                  >
                    {card.data.content}
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t("orderPay.cardHint")}
                  </Text>
                </div>
              )}
              <span>
                <Link to="/my/downloads">
                  <Button type="primary">{t("orderPay.goDownloads")}</Button>
                </Link>
              </span>
            </Space>
          }
        />
      )}

      {o.status === "cancelled" && (
        <Alert
          style={{ marginTop: 24 }}
          type="info"
          showIcon
          message={t("orderPay.cancelledMsg")}
        />
      )}
    </Card>
  );
}
