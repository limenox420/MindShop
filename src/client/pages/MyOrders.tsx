import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge, Button, Empty, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { api, money, orderStatus, fmtDate } from "../lib";

const { Text } = Typography;

type Order = {
  id: string;
  orderNo: string;
  productTitle: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending_payment: "gold",
  paid: "blue",
  delivered: "green",
  completed: "green",
  cancelled: "default",
};

export default function MyOrders() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => api<Order[]>("/api/orders"),
    refetchInterval: 10000,
  });

  const columns: ColumnsType<Order> = [
    {
      title: t("columns.orderNo"),
      dataIndex: "orderNo",
      render: (v: string) => <Text code>{v}</Text>,
    },
    { title: t("columns.product"), dataIndex: "productTitle" },
    {
      title: t("columns.amount"),
      dataIndex: "amountCents",
      width: 110,
      render: (v: number, r) => <Text strong>{money(v, r.currency)}</Text>,
    },
    {
      title: t("columns.status"),
      dataIndex: "status",
      width: 100,
      render: (v: string) => (
        <Badge status={STATUS_COLOR[v] as never} text={orderStatus(v)} />
      ),
    },
    {
      title: t("columns.createdAt"),
      dataIndex: "createdAt",
      width: 170,
      render: (v: string) => fmtDate(v),
    },
    {
      title: t("columns.actions"),
      width: 100,
      render: (_, r) =>
        r.status === "delivered" || r.status === "completed" ? (
          <Link to="/my/downloads">
            <Button size="small" type="primary">
              {t("common.download")}
            </Button>
          </Link>
        ) : (
          <Link to={`/order/${r.id}`}>
            <Button size="small">{t("common.view")}</Button>
          </Link>
        ),
    },
  ];

  if (!isLoading && (data?.length ?? 0) === 0)
    return <Empty description={t("myOrders.empty")} />;

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={data}
      loading={isLoading}
      pagination={false}
    />
  );
}
