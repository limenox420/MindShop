import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  Switch,
  type FormInstance,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  QrcodeOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, money, orderStatus, fmtDate } from "../lib";
import { CategoriesPanel, ProductsPanel } from "./MerchantDashboard";

const { Text, Title } = Typography;

type MerchantRow = {
  id: string;
  displayName: string;
  status: "pending" | "active" | "suspended";
  userEmail: string;
  userName: string;
};
type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantStatus: string | null;
};
type OrderRow = {
  order: {
    id: string;
    orderNo: string;
    productTitle: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  };
  buyerEmail: string;
  buyerName: string;
};
type QrRow = { id: string; label: string; enabled: boolean };

const MERCHANT_COLOR: Record<string, string> = {
  pending: "gold",
  active: "green",
  suspended: "red",
};

const ROLE_COLOR: Record<string, string> = {
  user: "blue",
  merchant: "purple",
  admin: "red",
};

function errText(e: unknown): string {
  return String(e).replace("Error: ", "");
}

function RoleTag({ role }: { role: string }) {
  const { t } = useTranslation();
  return <Tag color={ROLE_COLOR[role] ?? "blue"}>{t(`roles.${role}`)}</Tag>;
}

function MerchantTag({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Tag color={MERCHANT_COLOR[status] ?? "gold"}>{t(`admin.status.${status}`)}</Tag>;
}

function UsersAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () =>
      api<UserRow[]>(`/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-merchants"] });
  };
  const act = useMutation({
    mutationFn: ({
      method,
      id,
      body,
    }: {
      method: "POST" | "PATCH" | "DELETE";
      id?: string;
      body?: Record<string, unknown>;
    }) =>
      method === "POST"
        ? api("/api/admin/users", { method, body: JSON.stringify(body ?? {}) })
        : api(`/api/admin/users/${id}`, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
    onSuccess: (_d, vars) => {
      message.success(
        vars.method === "POST"
          ? t("admin.users.created")
          : vars.method === "DELETE"
            ? t("admin.users.anonymized")
            : t("common.saved"),
      );
      setCreateOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e) => message.error(errText(e)),
  });

  const columns: ColumnsType<UserRow> = [
    {
      title: t("admin.users.user"),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.email}
          </Text>
        </Space>
      ),
    },
    {
      title: t("admin.users.role"),
      width: 100,
      render: (_, r) => <RoleTag role={r.role} />,
    },
    {
      title: t("admin.users.merchant"),
      width: 160,
      render: (_, r) =>
        r.merchantId ? (
          <Space size={4}>
            <MerchantTag status={r.merchantStatus ?? "active"} />
            <Text style={{ fontSize: 12 }}>{r.merchantName}</Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: t("admin.users.registeredAt"),
      width: 170,
      render: (_, r) => fmtDate(r.createdAt),
    },
    {
      title: t("columns.actions"),
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(r);
            }}
          >
            {t("common.edit")}
          </Button>
          <Popconfirm
            title={t("admin.users.deleteTitle")}
            description={t("admin.users.deleteDesc")}
            onConfirm={() => act.mutate({ method: "DELETE", id: r.id })}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder={t("admin.users.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => setSearch(q)}
          style={{ width: 240 }}
          allowClear
          onClear={() => {
            setQ("");
            setSearch("");
          }}
        />
        <Button onClick={() => setSearch(q)}>{t("common.search")}</Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          {t("admin.users.add")}
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description={t("admin.users.empty")} /> }}
      />

      <CreateUserModal
        open={createOpen}
        loading={act.isPending}
        onCancel={() => setCreateOpen(false)}
        onSubmit={(v) => act.mutate({ method: "POST", body: v })}
      />

      <EditUserModal
        user={editing}
        loading={act.isPending}
        onCancel={() => setEditing(null)}
        onSubmit={(v) => editing && act.mutate({ method: "PATCH", id: editing.id, body: v })}
      />
    </>
  );
}

type CreateUserValues = {
  email: string;
  name?: string;
  password: string;
  role?: string;
};

function CreateUserModal({
  open,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (v: CreateUserValues) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<CreateUserValues>();
  return (
    <Modal
      title={t("admin.users.add")}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => onSubmit({ ...v, name: v.name || v.email.split("@")[0] })}
      >
        <Form.Item
          name="email"
          label={t("admin.users.email")}
          rules={[
            { required: true, message: t("auth.emailRequired") },
            { type: "email", message: t("auth.emailInvalid") },
          ]}
        >
          <Input placeholder={t("admin.users.email")} />
        </Form.Item>
        <Form.Item name="name" label={t("admin.users.nickname")}>
          <Input placeholder={t("admin.users.nicknamePlaceholder")} />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("admin.users.initialPassword")}
          rules={[
            { required: true, message: t("auth.passwordRequired") },
            { min: 8, message: t("auth.passwordMin") },
          ]}
        >
          <Input.Password placeholder={t("admin.users.passwordPlaceholder")} />
        </Form.Item>
        <Form.Item name="role" label={t("admin.users.roleField")} initialValue="user">
          <Select
            options={(["user", "merchant", "admin"] as const).map((r) => ({
              value: r,
              label: t(`roles.${r}`),
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

type EditUserValues = { name: string; role: string; password?: string };

function EditUserModal({
  user,
  loading,
  onCancel,
  onSubmit,
}: {
  user: UserRow | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (v: EditUserValues) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<EditUserValues>();
  const isSelf = user?.role === "admin";
  return (
    <Modal
      title={t("admin.users.editTitle", { email: user?.email ?? "" })}
      open={!!user}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: user?.name, role: user?.role }}
        onFinish={(v) =>
          onSubmit({
            name: v.name,
            role: v.role,
            password: v.password || undefined,
          })
        }
        key={user?.id}
      >
        <Form.Item
          name="name"
          label={t("auth.nickname")}
          rules={[{ required: true, message: t("admin.users.nicknameRequired") }]}
        >
          <Input placeholder={t("admin.users.nicknamePlaceholder")} />
        </Form.Item>
        <Form.Item
          name="role"
          label={isSelf ? t("admin.users.selfRoleHint") : t("admin.users.roleField")}
        >
          <Select
            options={(["user", "merchant", "admin"] as const).map((r) => ({
              value: r,
              label: t(`roles.${r}`),
            }))}
          />
        </Form.Item>
        <Form.Item name="password" label={t("admin.users.resetPassword")}>
          <Input.Password placeholder={t("admin.users.passwordPlaceholder")} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        {t("admin.title")}
      </Title>
      <Tabs
        items={[
          { key: "orders", label: t("admin.tabOrders"), children: <OrdersAdmin /> },
          { key: "users", label: t("admin.tabUsers"), children: <UsersAdmin /> },
          { key: "merchants", label: t("admin.tabMerchants"), children: <MerchantsAdmin /> },
          { key: "qrcodes", label: t("admin.tabQr"), children: <QrAdmin /> },
          { key: "products", label: t("admin.tabProducts"), children: <ProductsAdmin /> },
          { key: "settings", label: t("admin.tabSettings"), children: <Space direction="vertical" size={16}><SettingsAdmin /><StripeAdmin /></Space> },
        ]}
      />
    </div>
  );
}

function OrdersAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [filter, setFilter] = useState<string>("pending_payment");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: () => api<OrderRow[]>(`/api/admin/orders?status=${filter}`),
    refetchInterval: 10000,
  });
  const act = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "confirm-paid" | "deliver" | "cancel";
    }) => api(`/api/admin/orders/${id}/${action}`, { method: "POST" }),
    onSuccess: (_d, vars) => {
      message.success(
        vars.action === "confirm-paid"
          ? t("admin.orders.paidConfirmed")
          : vars.action === "deliver"
            ? t("admin.orders.deliveredMsg")
            : t("admin.orders.cancelledMsg"),
      );
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e) => message.error(errText(e)),
  });

  const columns: ColumnsType<OrderRow> = [
    {
      title: t("columns.orderNo"),
      render: (_, { order: o }) => <Text code>{o.orderNo}</Text>,
      width: 160,
    },
    { title: t("columns.product"), render: (_, { order: o }) => o.productTitle },
    { title: t("columns.buyer"), dataIndex: "buyerEmail", width: 200 },
    {
      title: t("columns.amount"),
      width: 100,
      render: (_, { order: o }) => <Text strong>{money(o.amountCents, o.currency)}</Text>,
    },
    {
      title: t("columns.status"),
      width: 100,
      render: (_, { order: o }) => (
        <Badge
          status={
            o.status === "delivered" || o.status === "completed"
              ? "success"
              : o.status === "cancelled"
                ? "default"
                : o.status === "paid"
                  ? "processing"
                  : "warning"
          }
          text={orderStatus(o.status)}
        />
      ),
    },
    {
      title: t("columns.createdAt"),
      width: 170,
      render: (_, { order: o }) => fmtDate(o.createdAt),
    },
    {
      title: t("columns.actions"),
      width: 210,
      render: (_, { order: o }) => (
        <Space size={4}>
          {o.status === "pending_payment" && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => act.mutate({ id: o.id, action: "confirm-paid" })}
              >
                {t("admin.orders.confirmPaid")}
              </Button>
              <Popconfirm
                title={t("admin.orders.cancelConfirm")}
                onConfirm={() => act.mutate({ id: o.id, action: "cancel" })}
              >
                <Button size="small" danger>
                  {t("common.cancel")}
                </Button>
              </Popconfirm>
            </>
          )}
          {o.status === "paid" && (
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={() => act.mutate({ id: o.id, action: "deliver" })}
            >
              {t("admin.orders.deliver")}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Segmented
        style={{ marginBottom: 16 }}
        value={filter}
        onChange={(v) => setFilter(String(v))}
        options={[
          { label: t("admin.orders.filterPending"), value: "pending_payment" },
          { label: t("admin.orders.filterPaid"), value: "paid" },
          { label: t("admin.orders.filterDelivered"), value: "delivered" },
          { label: t("admin.orders.filterAll"), value: "" },
        ]}
      />
      <Table
        rowKey={(r) => r.order.id}
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: <Empty description={t("merchant.orders.empty")} /> }}
      />
    </>
  );
}

function MerchantsAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MerchantRow | null>(null);
  const [createForm] = Form.useForm<{ userId: string; displayName?: string }>();
  const [editForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: () => api<MerchantRow[]>("/api/admin/merchants"),
  });
  const act = useMutation({
    mutationFn: ({
      id,
      method,
      body,
    }: {
      id?: string;
      method: "POST" | "PATCH" | "DELETE";
      body?: Record<string, unknown>;
    }) =>
      method === "POST"
        ? api("/api/admin/merchants", { method, body: JSON.stringify(body ?? {}) })
        : api(`/api/admin/merchants/${id}`, {
            method,
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
    onSuccess: (_d, vars) => {
      message.success(
        vars.method === "POST"
          ? t("admin.merchants.created")
          : vars.method === "DELETE"
            ? t("admin.merchants.deleted")
            : t("admin.merchants.updated"),
      );
      setCreateOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-merchants"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => message.error(errText(e)),
  });

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };
  const openEdit = (m: MerchantRow) => {
    editForm.setFieldsValue({ displayName: m.displayName });
    setEditing(m);
  };

  const columns: ColumnsType<MerchantRow> = [
    {
      title: t("admin.merchants.merchant"),
      dataIndex: "displayName",
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.userName} · {r.userEmail}
          </Text>
        </Space>
      ),
    },
    {
      title: t("columns.status"),
      dataIndex: "status",
      width: 100,
      render: (v: MerchantRow["status"]) => <MerchantTag status={v} />,
    },
    {
      title: t("columns.actions"),
      width: 280,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            {t("admin.merchants.rename")}
          </Button>
          {r.status !== "active" && (
            <Button
              size="small"
              type="primary"
              onClick={() => act.mutate({ id: r.id, method: "PATCH", body: { status: "active" } })}
            >
              {r.status === "pending" ? t("admin.merchants.approve") : t("admin.merchants.restore")}
            </Button>
          )}
          {r.status === "active" && (
            <Popconfirm
              title={t("admin.merchants.suspendConfirm")}
              onConfirm={() => act.mutate({ id: r.id, method: "PATCH", body: { status: "suspended" } })}
            >
              <Button size="small" danger>
                {t("admin.merchants.suspend")}
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={t("admin.merchants.deleteTitle")}
            description={t("admin.merchants.deleteDesc")}
            onConfirm={() => act.mutate({ id: r.id, method: "DELETE" })}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={openCreate}
        style={{ marginBottom: 16 }}
      >
        {t("admin.merchants.add")}
      </Button>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: <Empty description={t("admin.merchants.empty")} /> }}
      />

      <Modal
        title={t("admin.merchants.add")}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={act.isPending}
        destroyOnHidden
      >
        <CreateMerchantForm form={createForm} onFinish={(v) => act.mutate({ method: "POST", body: v })} />
      </Modal>

      <Modal
        title={t("admin.merchants.renameTitle")}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={act.isPending}
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) =>
            editing && act.mutate({ id: editing.id, method: "PATCH", body: v })
          }
        >
          <Form.Item
            name="displayName"
            label={t("admin.merchants.nameLabel")}
            rules={[{ required: true, message: t("merchant.applyNameRequired") }]}
          >
            <Input placeholder={t("admin.merchants.nameLabel")} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function CreateMerchantForm({
  form,
  onFinish,
}: {
  form: FormInstance<{ userId: string; displayName?: string }>;
  onFinish: (v: { userId: string; displayName?: string }) => void;
}) {
  const { t } = useTranslation();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<UserRow[]>("/api/admin/users"),
  });
  const candidates = (users ?? []).filter((u) => !u.merchantId);

  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item
        name="userId"
        label={t("admin.merchants.selectUser")}
        rules={[{ required: true, message: t("admin.merchants.selectUser") }]}
      >
        <Select
          placeholder={t("admin.merchants.selectUserPlaceholder")}
          loading={isLoading}
          showSearch
          optionFilterProp="label"
          options={candidates.map((u) => ({
            value: u.id,
            label: `${u.name}（${u.email}）`,
          }))}
          notFoundContent={<Empty description={t("admin.merchants.noUsers")} />}
        />
      </Form.Item>
      <Form.Item name="displayName" label={t("admin.merchants.nameHint")}>
        <Input placeholder={t("admin.merchants.nameLabel")} />
      </Form.Item>
    </Form>
  );
}

function QrAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [label, setLabel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-qr"],
    queryFn: () => api<QrRow[]>("/api/admin/qr-codes"),
  });
  const act = useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      body
        ? api(`/api/admin/qr-codes/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/api/admin/qr-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-qr"] }),
    onError: (e) => message.error(errText(e)),
  });

  return (
    <>
      <Card style={{ marginBottom: 16 }} styles={{ body: { display: "flex", gap: 16, alignItems: "center" } }}>
        <Input
          placeholder={t("admin.qr.namePlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ width: 240 }}
        />
        <Upload
          name="file"
          accept="image/*"
          showUploadList={false}
          data={{ label: label || t("admin.qr.defaultLabel") }}
          action="/api/admin/qr-codes"
          onChange={({ file }) => {
            if (file.status === "done") {
              message.success(t("admin.qr.uploaded"));
              qc.invalidateQueries({ queryKey: ["admin-qr"] });
            } else if (file.status === "error") {
              message.error(t("admin.qr.uploadFailed"));
            }
          }}
        >
          <Button type="primary" icon={<QrcodeOutlined />}>
            {t("admin.qr.uploadBtn")}
          </Button>
        </Upload>
        <Text type="secondary">{t("admin.qr.hint")}</Text>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {data?.map((r) => (
          <Card
            key={r.id}
            loading={isLoading}
            cover={
              <Image
                src={`/api/admin/qr-codes/${r.id}/image`}
                alt={r.label}
                style={{ objectFit: "contain", height: 180, padding: 12 }}
              />
            }
            actions={[
              <Switch
                key="switch"
                checked={r.enabled}
                checkedChildren={t("admin.qr.enabled")}
                unCheckedChildren={t("admin.qr.disabled")}
                onChange={(v) => act.mutate({ id: r.id, body: { enabled: v } })}
              />,
              <Popconfirm key="del" title={t("admin.qr.deleteConfirm")} onConfirm={() => act.mutate({ id: r.id })}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <Card.Meta
              title={r.label}
              description={r.enabled ? t("admin.qr.shownAtCheckout") : t("admin.qr.notShown")}
            />
          </Card>
        ))}
      </div>
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Empty description={t("admin.qr.empty")} />
      )}
    </>
  );
}

function ProductsAdmin() {
  const { t } = useTranslation();
  const { data: merchants, isLoading } = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: () => api<MerchantRow[]>("/api/admin/merchants"),
  });
  const [merchantId, setMerchantId] = useState<string>();

  useEffect(() => {
    if (!merchantId && merchants?.length) setMerchantId(merchants[0].id);
  }, [merchants, merchantId]);

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Text type="secondary">{t("admin.products.manageFor")}</Text>
        <Select
          style={{ width: 260 }}
          placeholder={t("admin.products.selectMerchant")}
          loading={isLoading}
          value={merchantId}
          onChange={(v) => setMerchantId(v)}
          options={(merchants ?? []).map((m) => ({
            value: m.id,
            label:
              m.displayName +
              (m.status !== "active" ? `（${t(`admin.status.${m.status}`)}）` : ""),
          }))}
          notFoundContent={<Empty description={t("admin.merchants.empty")} />}
        />
      </Space>
      {merchantId ? (
        <Tabs
          items={[
            { key: "products", label: t("merchant.tabProducts"), children: <ProductsPanel merchantId={merchantId} isAdmin /> },
            { key: "categories", label: t("merchant.tabCategories"), children: <CategoriesPanel merchantId={merchantId} /> },
          ]}
        />
      ) : (
        !isLoading && <Empty description={t("admin.products.emptyHint")} />
      )}
    </>
  );
}

function SettingsAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    maxFileSizeMB: number;
    siteTitle?: string;
    contact?: string;
    allowIndex?: boolean;
  }>();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () =>
      api<{
        maxFileSizeBytes: number;
        siteTitle: string | null;
        contact: string | null;
        allowIndex: boolean;
      }>("/api/admin/settings"),
  });
  useEffect(() => {
    if (data) {
      form.setFieldValue(
        "maxFileSizeMB",
        Math.round(data.maxFileSizeBytes / 1024 / 1024),
      );
      form.setFieldValue("siteTitle", data.siteTitle ?? "");
      form.setFieldValue("contact", data.contact ?? "");
      form.setFieldValue("allowIndex", data.allowIndex !== false);
    }
  }, [data, form]);
  const save = useMutation({
    mutationFn: (v: {
      maxFileSizeMB: number;
      siteTitle?: string;
      contact?: string;
      allowIndex?: boolean;
    }) =>
      api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          maxFileSizeMB: v.maxFileSizeMB,
          siteTitle: v.siteTitle ?? "",
          contact: v.contact ?? "",
          allowIndex: v.allowIndex !== false,
        }),
      }),
    onSuccess: () => {
      message.success(t("admin.settings.saved"));
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["site"] });
      qc.invalidateQueries({ queryKey: ["upload-limits"] });
    },
    onError: (e) => message.error(errText(e)),
  });

  return (
    <Card loading={isLoading} style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.Item
          name="siteTitle"
          label={t("admin.settings.siteTitle")}
          extra={t("admin.settings.siteTitleHelp")}
        >
          <Input maxLength={100} placeholder="MindShop" />
        </Form.Item>
        <Form.Item
          name="contact"
          label={t("admin.settings.contact")}
          extra={t("admin.settings.contactHelp")}
        >
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
        <Form.Item
          name="maxFileSizeMB"
          label={t("admin.settings.maxFileSize")}
          extra={t("admin.settings.maxFileSizeHelp")}
          rules={[
            { required: true, message: t("admin.settings.maxFileSizeRequired") },
          ]}
        >
          <InputNumber min={1} max={10240} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="allowIndex"
          label={t("admin.settings.seoTitle")}
          valuePropName="checked"
          extra={t("admin.settings.seoAllowIndexHelp")}
        >
          <Switch checkedChildren={t("admin.qr.enabled")} unCheckedChildren={t("admin.qr.disabled")} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          {t("admin.settings.save")}
        </Button>
      </Form>
    </Card>
  );
}

function StripeAdmin() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    secretKey?: string;
    webhookSecret?: string;
  }>();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-stripe"],
    queryFn: () =>
      api<{
        enabled: boolean;
        hasSecretKey: boolean;
        hasWebhookSecret: boolean;
      }>("/api/admin/settings/stripe"),
  });
  useEffect(() => {
    form.setFieldsValue({ secretKey: undefined, webhookSecret: undefined });
  }, [data, form]);
  const save = useMutation({
    mutationFn: (v: { secretKey?: string; webhookSecret?: string }) =>
      api("/api/admin/settings/stripe", {
        method: "PUT",
        body: JSON.stringify({
          secretKey: v.secretKey ?? "",
          webhookSecret: v.webhookSecret ?? "",
          enabled: data?.enabled ?? false,
        }),
      }),
    onSuccess: () => {
      message.success(t("admin.settings.saved"));
      form.setFieldsValue({ secretKey: undefined, webhookSecret: undefined });
      qc.invalidateQueries({ queryKey: ["admin-stripe"] });
    },
    onError: (e) => message.error(errText(e)),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api("/api/admin/settings/stripe", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-stripe"] }),
    onError: (e) => message.error(errText(e)),
  });
  const webhookUrl = `${window.location.origin}/api/webhooks/stripe`;

  return (
    <Card loading={isLoading} style={{ maxWidth: 480 }} title={t("admin.settings.stripeTitle")}>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
        <Form.Item label={t("admin.settings.stripeEnable")}>
          <Switch
            checked={data?.enabled ?? false}
            checkedChildren={t("admin.qr.enabled")}
            unCheckedChildren={t("admin.qr.disabled")}
            loading={toggle.isPending}
            onChange={(v) => {
              if (v && !data?.hasSecretKey)
                message.warning(t("admin.settings.stripeNeedKey"));
              toggle.mutate(v);
            }}
          />
        </Form.Item>
        <Form.Item
          name="secretKey"
          label={t("admin.settings.stripeSecretKey")}
          extra={
            data?.hasSecretKey ? t("admin.settings.stripeSaved") : undefined
          }
        >
          <Input.Password placeholder="sk_test_... / sk_live_..." autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="webhookSecret"
          label={t("admin.settings.stripeWebhookSecret")}
          extra={
            data?.hasWebhookSecret ? t("admin.settings.stripeSaved") : undefined
          }
        >
          <Input.Password placeholder="whsec_..." autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("admin.settings.stripeWebhookUrl")} extra={webhookUrl}>
          <Input value="/api/webhooks/stripe" disabled />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          {t("admin.settings.save")}
        </Button>
      </Form>
    </Card>
  );
}
