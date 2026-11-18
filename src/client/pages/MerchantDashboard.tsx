import { useState, type Key } from "react";
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
  List,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  PictureOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { translateServerError } from "../i18n";
import { api, money, orderStatus, fmtDate } from "../lib";

const { Text, Title } = Typography;

type Merchant = { id: string; displayName: string; status: string } | null;
type Category = { id: string; name: string; sortOrder: number };
type Product = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  type: "file" | "card";
  payMethod: "qr" | "stripe" | null;
  status: "draft" | "on_sale" | "off_sale";
  categoryId: string | null;
};
type FileRow = { id: string; fileName: string; sizeBytes: number };
type CardRow = {
  id: string;
  content: string;
  status: "unsold" | "sold";
  soldAt: string | null;
};
type ImageRow = { id: string; objectKey: string; sortOrder: number };
type Order = {
  id: string;
  orderNo: string;
  productTitle: string;
  amountCents: number;
  status: string;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  on_sale: "success",
  off_sale: "warning",
};

function errText(e: unknown): string {
  return String(e).replace("Error: ", "");
}

export default function MerchantDashboard() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();

  const me = useQuery({
    queryKey: ["merchant-me"],
    queryFn: () => api<Merchant>("/api/merchant/me"),
  });
  const m = me.data;

  const apply = useMutation({
    mutationFn: (displayName: string) =>
      api("/api/merchant/apply", {
        method: "POST",
        body: JSON.stringify({ displayName }),
      }),
    onSuccess: () => {
      message.success(t("merchant.applySuccess"));
      qc.invalidateQueries({ queryKey: ["merchant-me"] });
    },
  });

  if (me.isLoading)
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );

  if (!m) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <Result
          icon={<PlusOutlined style={{ color: "#4f46e5" }} />}
          title={t("merchant.applyTitle")}
          subTitle={t("merchant.applySub")}
          extra={
            <ApplyForm onSubmit={(v) => apply.mutate(v.displayName)} loading={apply.isPending} />
          }
        />
      </Card>
    );
  }

  if (m.status !== "active") {
    return (
      <Result
        status="info"
        title={`${t("merchant.merchantLabel")}: ${m.displayName}`}
        subTitle={
          m.status === "pending"
            ? t("merchant.pendingSub")
            : t("merchant.suspendedSub")
        }
      />
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        {t("merchant.panelTitle")} <Tag color="purple">{m.displayName}</Tag>
      </Title>
      <Tabs
        items={[
          { key: "products", label: t("merchant.tabProducts"), children: <ProductsPanel merchantId={m.id} /> },
          { key: "categories", label: t("merchant.tabCategories"), children: <CategoriesPanel merchantId={m.id} /> },
          { key: "orders", label: t("merchant.tabOrders"), children: <OrdersPanel /> },
        ]}
      />
    </div>
  );
}

function ApplyForm({
  onSubmit,
  loading,
}: {
  onSubmit: (v: { displayName: string }) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Form onFinish={onSubmit} layout="inline" style={{ justifyContent: "center" }}>
      <Form.Item
        name="displayName"
        rules={[{ required: true, message: t("merchant.applyNameRequired") }]}
      >
        <Input placeholder={t("merchant.applyNamePlaceholder")} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={loading}>
        {t("merchant.applySubmit")}
      </Button>
    </Form>
  );
}

export function CategoriesPanel({ merchantId }: { merchantId: string }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const cats = useQuery({
    queryKey: ["merchant-categories", merchantId],
    queryFn: () => api<Category[]>(`/api/merchants/${merchantId}/categories`),
  });
  const create = useMutation({
    mutationFn: (v: { name: string; sortOrder?: number }) =>
      api(`/api/merchants/${merchantId}/categories`, {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      message.success(t("merchant.categories.added"));
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ["merchant-categories", merchantId] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) =>
      api(`/api/merchants/${merchantId}/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      message.success(t("common.deleted"));
      qc.invalidateQueries({ queryKey: ["merchant-categories", merchantId] });
    },
  });

  const columns: ColumnsType<Category> = [
    { title: t("merchant.categories.name"), dataIndex: "name" },
    { title: t("merchant.categories.sortOrder"), dataIndex: "sortOrder", width: 80 },
    {
      title: t("columns.actions"),
      width: 90,
      render: (_, r) => (
        <Popconfirm title={t("merchant.categories.deleteConfirm")} onConfirm={() => del.mutate(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => setOpen(true)}
        style={{ marginBottom: 16 }}
      >
        {t("merchant.categories.add")}
      </Button>
      <Table rowKey="id" columns={columns} dataSource={cats.data} loading={cats.isLoading} pagination={false} />
      <Modal
        title={t("merchant.categories.add")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            name="name"
            label={t("merchant.categories.name")}
            rules={[{ required: true, message: t("merchant.categories.nameRequired") }]}
          >
            <Input placeholder={t("merchant.categories.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="sortOrder" label={t("merchant.categories.sortHint")} initialValue={0}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ProductsPanel({
  merchantId,
  isAdmin = false,
}: {
  merchantId: string;
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<{ product: Product | null } | null>(null);
  const [expanded, setExpanded] = useState<readonly Key[]>([]);

  const cats = useQuery({
    queryKey: ["merchant-categories", merchantId],
    queryFn: () => api<Category[]>(`/api/merchants/${merchantId}/categories`),
  });
  const products = useQuery({
    queryKey: ["merchant-products", merchantId],
    queryFn: () => api<Product[]>(`/api/merchants/${merchantId}/products`),
  });
  const stock = useQuery({
    queryKey: ["card-stock", merchantId],
    queryFn: () =>
      api<{ productId: string; unsold: number }[]>(
        `/api/merchants/${merchantId}/card-stock`,
      ),
  });
  const stockMap = new Map((stock.data ?? []).map((s) => [s.productId, s.unsold]));
  const save = useMutation({
    mutationFn: (v: {
      id?: string;
      title: string;
      description: string;
      priceCents: number;
      categoryId: string | null;
      type: "file" | "card";
      payMethod?: "qr" | "stripe" | null;
    }) =>
      v.id
        ? api(`/api/merchants/${merchantId}/products/${v.id}`, {
            method: "PATCH",
            body: JSON.stringify(v),
          })
        : api(`/api/merchants/${merchantId}/products`, {
            method: "POST",
            body: JSON.stringify(v),
          }),
    onSuccess: () => {
      message.success(t("common.saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["merchant-products", merchantId] });
    },
    onError: (e) => message.error(errText(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Product["status"] }) =>
      api(`/api/merchants/${merchantId}/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["merchant-products", merchantId] }),
    onError: (e) => message.error(errText(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) =>
      api(`/api/merchants/${merchantId}/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      message.success(t("common.deleted"));
      qc.invalidateQueries({ queryKey: ["merchant-products", merchantId] });
    },
    onError: (e) => message.error(errText(e)),
  });

  const columns: ColumnsType<Product> = [
    {
      title: t("columns.product"),
      dataIndex: "title",
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Space size={4} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {money(r.priceCents, r.currency)}
            </Text>
            {r.type === "card" ? (
              <>
                <Tag color="geekblue">{t("product.typeCard")}</Tag>
                <Tag color={(stockMap.get(r.id) ?? 0) > 0 ? "green" : "red"}>
                  {t("product.stockItems", { count: stockMap.get(r.id) ?? 0 })}
                </Tag>
              </>
            ) : (
              <Tag>{t("product.typeFile")}</Tag>
            )}
            {isAdmin && r.payMethod && (
              <Tag color="gold">
                {t(`merchant.products.payMethod_${r.payMethod}`)}
              </Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: t("columns.status"),
      dataIndex: "status",
      width: 90,
      render: (v: Product["status"]) => (
        <Badge status={STATUS_COLOR[v] as never} text={t(`status.${v}`)} />
      ),
    },
    {
      title: t("columns.actions"),
      width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ product: r })}>
            {t("common.edit")}
          </Button>
          {r.status !== "on_sale" ? (
            <Button
              size="small"
              type="primary"
              icon={<ArrowUpOutlined />}
              onClick={() => setStatus.mutate({ id: r.id, status: "on_sale" })}
            >
              {t("merchant.products.publish")}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => setStatus.mutate({ id: r.id, status: "off_sale" })}
            >
              {t("merchant.products.unpublish")}
            </Button>
          )}
          <Popconfirm
            title={t("merchant.products.deleteConfirm")}
            onConfirm={() => del.mutate(r.id)}
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
        onClick={() => setEditing({ product: null })}
        style={{ marginBottom: 16 }}
      >
        {t("merchant.products.new")}
      </Button>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={products.data}
        loading={products.isLoading}
        pagination={false}
        expandable={{
          expandedRowKeys: expanded,
          onExpandedRowsChange: setExpanded,
          expandedRowRender: (r) => (
            <div>
              <ImageUploader merchantId={merchantId} productId={r.id} />
              {r.type === "card" ? (
                <CardManager merchantId={merchantId} productId={r.id} />
              ) : (
                <FileUploader merchantId={merchantId} productId={r.id} />
              )}
            </div>
          ),
        }}
      />
      <ProductModal
        open={!!editing}
        product={editing?.product ?? null}
        categories={cats.data ?? []}
        isAdmin={isAdmin}
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onSubmit={(v) => save.mutate(v)}
      />
    </>
  );
}

function ProductModal({
  open,
  product,
  categories,
  isAdmin = false,
  confirmLoading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  product: Product | null;
  categories: Category[];
  isAdmin?: boolean;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    id?: string;
    title: string;
    description: string;
    priceCents: number;
    categoryId: string | null;
    type: "file" | "card";
    payMethod?: "qr" | "stripe" | null;
  }) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  return (
    <Modal
      title={product ? t("merchant.products.edit") : t("merchant.products.new")}
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={() => form.submit()}
      confirmLoading={confirmLoading}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          product
            ? {
                title: product.title,
                description: product.description,
                price: product.priceCents / 100,
                categoryId: product.categoryId,
                type: product.type,
                payMethod: product.payMethod ?? undefined,
              }
            : { price: 0, type: "file" }
        }
        onFinish={(v) =>
          onSubmit({
            id: product?.id || undefined,
            title: v.title,
            description: v.description ?? "",
            priceCents: Math.round((v.price ?? 0) * 100),
            categoryId: v.categoryId || null,
            type: v.type,
            ...(isAdmin ? { payMethod: v.payMethod ?? null } : {}),
          })
        }
      >
        <Form.Item
          name="title"
          label={t("merchant.products.titleField")}
          rules={[{ required: true, message: t("merchant.products.titleRequired") }]}
        >
          <Input placeholder={t("merchant.products.titleField")} />
        </Form.Item>
        <Form.Item name="description" label={t("merchant.products.descField")}>
          <Input.TextArea rows={3} placeholder={t("merchant.products.descField")} />
        </Form.Item>
        <Form.Item
          name="price"
          label={t("merchant.products.priceField")}
          rules={[{ required: true, message: t("merchant.products.priceRequired") }]}
        >
          <InputNumber min={0} precision={2} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="type" label={t("merchant.products.typeField")} extra={product ? t("merchant.products.typeEditHint") : undefined}>
          <Select
            disabled={!!product}
            options={[
              { value: "file", label: t("merchant.products.typeFile") },
              { value: "card", label: t("merchant.products.typeCard") },
            ]}
          />
        </Form.Item>
        <Form.Item name="categoryId" label={t("merchant.products.categoryField")}>
          <Select
            allowClear
            placeholder={t("merchant.products.categoryPlaceholder")}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Form.Item>
        {isAdmin && (
          <Form.Item
            name="payMethod"
            label={t("merchant.products.payMethodField")}
            extra={t("merchant.products.payMethodHint")}
          >
            <Select
              allowClear
              placeholder={t("merchant.products.payMethodDefault")}
              options={[
                { value: "qr", label: t("merchant.products.payMethod_qr") },
                { value: "stripe", label: t("merchant.products.payMethod_stripe") },
              ]}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function CardManager({ merchantId, productId }: { merchantId: string; productId: string }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");

  const cards = useQuery({
    queryKey: ["product-cards", productId],
    queryFn: () => api<CardRow[]>(`/api/merchants/${merchantId}/products/${productId}/cards`),
  });
  const importMut = useMutation({
    mutationFn: () =>
      api<{ added: number }>(`/api/merchants/${merchantId}/products/${productId}/cards`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: (r) => {
      message.success(t("merchant.cards.imported", { count: r.added }));
      setOpen(false);
      setContent("");
      qc.invalidateQueries({ queryKey: ["product-cards", productId] });
      qc.invalidateQueries({ queryKey: ["card-stock", merchantId] });
    },
    onError: (e) => message.error(translateServerError(errText(e))),
  });
  const del = useMutation({
    mutationFn: (id: string) =>
      api(`/api/merchants/${merchantId}/products/${productId}/cards/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-cards", productId] });
      qc.invalidateQueries({ queryKey: ["card-stock", merchantId] });
    },
    onError: (e) => message.error(translateServerError(errText(e))),
  });

  const columns: ColumnsType<CardRow> = [
    {
      title: t("merchant.cards.content"),
      dataIndex: "content",
      render: (v: string) => <Text code style={{ wordBreak: "break-all" }}>{v}</Text>,
    },
    {
      title: t("merchant.cards.status"),
      dataIndex: "status",
      width: 90,
      render: (v: CardRow["status"]) => (
        <Tag color={v === "sold" ? "default" : "green"}>
          {t(v === "sold" ? "merchant.cards.sold" : "merchant.cards.unsold")}
        </Tag>
      ),
    },
    {
      title: t("merchant.cards.soldAt"),
      dataIndex: "soldAt",
      width: 170,
      render: (v: string | null) => (v ? fmtDate(v) : "-"),
    },
    {
      title: t("columns.actions"),
      width: 70,
      render: (_, r) =>
        r.status === "unsold" ? (
          <Popconfirm
            title={t("merchant.cards.deleteConfirm")}
            onConfirm={() => del.mutate(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div style={{ marginTop: 16, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        >
          {t("merchant.cards.add")}
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t("merchant.cards.hint")}
        </Text>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={cards.data}
        loading={cards.isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: t("merchant.cards.empty") }}
      />
      <Modal
        title={t("merchant.cards.add")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => importMut.mutate()}
        okText={t("merchant.cards.importBtn")}
        okButtonProps={{ disabled: !content.trim() }}
        confirmLoading={importMut.isPending}
        destroyOnHidden
      >
        <Input.TextArea
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("merchant.cards.placeholder")}
        />
      </Modal>
    </div>
  );
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtLimit(bytes: number) {
  if (bytes >= 1024 ** 3 && bytes % 1024 ** 3 === 0)
    return `${bytes / 1024 ** 3} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function ImageUploader({ merchantId, productId }: { merchantId: string; productId: string }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const imgs = useQuery({
    queryKey: ["product-images", productId],
    queryFn: () => api<ImageRow[]>(`/api/merchants/${merchantId}/products/${productId}/images`),
  });
  const del = useMutation({
    mutationFn: (imageId: string) =>
      api(`/api/merchants/${merchantId}/products/${productId}/images/${imageId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-images", productId] }),
    onError: (e) => message.error(errText(e)),
  });

  return (
    <div style={{ marginBottom: 16 }}>
      <Upload
        name="file"
        accept="image/*"
        multiple
        showUploadList={false}
        action={`/api/merchants/${merchantId}/products/${productId}/images`}
        onChange={({ file }) => {
          if (file.status === "done") {
            qc.invalidateQueries({ queryKey: ["product-images", productId] });
          } else if (file.status === "error") {
            const srv = (file.response as { error?: string } | undefined)?.error;
            message.error(srv ? translateServerError(srv) : t("merchant.images.uploadFailed"));
          }
        }}
      >
        <Button icon={<PictureOutlined />}>{t("merchant.images.upload")}</Button>
      </Upload>
      <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
        {t("merchant.images.hint")}
      </Text>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {(imgs.data ?? []).map((img) => (
          <div
            key={img.id}
            style={{ position: "relative", width: 88, height: 88 }}
          >
            <Image
              src={`/api/merchants/${merchantId}/products/${productId}/images/${img.id}/raw`}
              width={88}
              height={88}
              style={{ objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ position: "absolute", top: 4, right: 4 }}
              onClick={() => del.mutate(img.id)}
            />
          </div>
        ))}
      </div>
      {imgs.isLoading ? null : (imgs.data?.length ?? 0) === 0 && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t("merchant.images.empty")}
        </Text>
      )}
    </div>
  );
}

const PART_SIZE = 8 * 1024 * 1024;
// single-request upload works only under the Workers ~100MB body limit;
// bigger files go through R2 multipart upload in PART_SIZE chunks
const MULTIPART_THRESHOLD = 90 * 1024 * 1024;

function FileUploader({ merchantId, productId }: { merchantId: string; productId: string }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const files = useQuery({
    queryKey: ["product-files", productId],
    queryFn: () => api<FileRow[]>(`/api/merchants/${merchantId}/products/${productId}/files`),
  });
  const limits = useQuery({
    queryKey: ["upload-limits"],
    queryFn: () => api<{ maxFileSizeBytes: number }>("/api/upload-limits"),
    staleTime: 60_000,
  });
  const limitStr = limits.data ? fmtLimit(limits.data.maxFileSizeBytes) : null;
  const del = useMutation({
    mutationFn: (fileId: string) =>
      api(`/api/merchants/${merchantId}/products/${productId}/files/${fileId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      message.success(t("merchant.files.deleted"));
      qc.invalidateQueries({ queryKey: ["product-files", productId] });
    },
  });

  const upload = async (file: File, onSuccess: () => void, onError: () => void) => {
    const key = `upload-${file.name}-${Date.now()}`;
    message.loading({
      content: t("merchant.files.uploading", { name: file.name }),
      key,
      duration: 0,
    });
    const base = `/api/merchants/${merchantId}/products/${productId}/files`;
    try {
      if (file.size <= MULTIPART_THRESHOLD) {
        const fd = new FormData();
        fd.append("file", file);
        await api(base, { method: "POST", body: fd });
      } else {
        const init = await api<{ key: string; uploadId: string }>(`${base}/init`, {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || undefined,
            sizeBytes: file.size,
          }),
        });
        const total = Math.ceil(file.size / PART_SIZE);
        const parts: { partNumber: number; etag: string }[] = [];
        try {
          for (let start = 1; start <= total; start += 3) {
            const batch = await Promise.all(
              Array.from(
                { length: Math.min(3, total - start + 1) },
                (_, i) => start + i,
              ).map(async (partNumber) => {
                const blob = file.slice(
                  (partNumber - 1) * PART_SIZE,
                  partNumber * PART_SIZE,
                );
                return api<{ partNumber: number; etag: string }>(
                  `${base}/part?key=${encodeURIComponent(init.key)}&uploadId=${encodeURIComponent(init.uploadId)}&partNumber=${partNumber}`,
                  { method: "PUT", body: blob },
                );
              }),
            );
            parts.push(...batch);
          }
          await api(`${base}/complete`, {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type || undefined,
              key: init.key,
              uploadId: init.uploadId,
              parts,
            }),
          });
        } catch (e) {
          void api(`${base}/abort`, {
            method: "POST",
            body: JSON.stringify({ key: init.key, uploadId: init.uploadId }),
          }).catch(() => undefined);
          throw e;
        }
      }
      message.success({
        content: t("merchant.files.uploaded", { name: file.name }),
        key,
      });
      qc.invalidateQueries({ queryKey: ["product-files", productId] });
      onSuccess();
    } catch (e) {
      message.error({
        content: errText(e),
        key,
      });
      onError();
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Upload.Dragger
        name="file"
        multiple
        showUploadList={false}
        customRequest={({ file, onSuccess, onError }) =>
          upload(
            file as File,
            () => onSuccess?.("ok"),
            () => onError?.(new Error("upload failed")),
          )
        }
        beforeUpload={(file) => {
          if (limits.data && file.size > limits.data.maxFileSizeBytes) {
            message.error(t("errors.fileTooLarge", { limit: limitStr }));
            return Upload.LIST_IGNORE;
          }
          return true;
        }}
      >
        <p className="ant-upload-drag-icon">
          <CloudUploadOutlined style={{ color: "#4f46e5" }} />
        </p>
        <p className="ant-upload-text">{t("merchant.files.dragText")}</p>
        <p className="ant-upload-hint">
          {t("merchant.files.hint")}
          {limitStr && (
            <>
              <br />
              {t("merchant.files.sizeLimit", { limit: limitStr })}
            </>
          )}
        </p>
      </Upload.Dragger>
      <List
        size="small"
        style={{ marginTop: 8 }}
        loading={files.isLoading}
        dataSource={files.data ?? []}
        locale={{ emptyText: t("merchant.files.empty") }}
        renderItem={(f) => (
          <List.Item
            actions={[
              <Popconfirm
                key="del"
                title={t("merchant.files.deleteConfirm")}
                onConfirm={() => del.mutate(f.id)}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <Space>
              <FileOutlined />
              <Text>{f.fileName}</Text>
              <Tag>{fmtSize(f.sizeBytes)}</Tag>
            </Space>
          </List.Item>
        )}
      />
    </div>
  );
}

function OrdersPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["merchant-orders"],
    queryFn: () => api<Order[]>("/api/merchant/orders"),
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
      render: (v: number) => <Text strong>{money(v)}</Text>,
    },
    {
      title: t("columns.status"),
      dataIndex: "status",
      width: 100,
      render: (v: string) => (
        <Badge
          status={v === "delivered" ? "success" : v === "cancelled" ? "default" : "processing"}
          text={orderStatus(v)}
        />
      ),
    },
    {
      title: t("columns.time"),
      dataIndex: "createdAt",
      width: 170,
      render: (v: string) => fmtDate(v),
    },
  ];

  if (!isLoading && (data?.length ?? 0) === 0)
    return <Empty description={t("merchant.orders.empty")} />;

  return (
    <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} pagination={false} />
  );
}
