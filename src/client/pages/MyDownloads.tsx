import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { DownloadOutlined, FileOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api } from "../lib";

const { Text, Title } = Typography;

type Entitlement = {
  productId: string;
  orderId: string;
  grantedAt: string;
  title: string;
};

type FileRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ProductFiles({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { data: files, isLoading } = useQuery({
    queryKey: ["my-files", productId],
    queryFn: () => api<FileRow[]>(`/api/my/products/${productId}/files`),
  });
  if (isLoading) return <Spin size="small" />;
  return (
    <List
      size="small"
      dataSource={files}
      renderItem={(f) => (
        <List.Item
          actions={[
            <Button
              key="dl"
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              href={`/api/files/download/${f.id}`}
            >
              {t("common.download")}
            </Button>,
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
  );
}

export default function MyDownloads() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["my-products"],
    queryFn: () => api<Entitlement[]>("/api/my/products"),
  });

  if (isLoading)
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );

  if ((data?.length ?? 0) === 0)
    return <Empty description={t("myDownloads.empty")} />;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <Title level={4} style={{ margin: 0 }}>
        {t("myDownloads.title")}
      </Title>
      {data!.map((e) => (
        <Card key={e.orderId} title={e.title}>
          <ProductFiles productId={e.productId} />
        </Card>
      ))}
    </Space>
  );
}
