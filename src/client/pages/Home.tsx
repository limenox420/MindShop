import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Card, Col, Empty, Image, Input, Row, Segmented, Spin, Typography } from "antd";
import { FileImageOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, money } from "../lib";

const { Text, Paragraph, Title } = Typography;

type CatalogProduct = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  merchantName: string;
  categoryName: string | null;
  coverImageId: string | null;
};

type CatalogCategory = {
  id: string;
  name: string;
  merchantId: string;
  merchantName: string;
};

export default function Home() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("category") ?? "";
  const q = params.get("q") ?? "";

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<CatalogCategory[]>("/api/catalog/categories"),
  });
  const products = useQuery({
    queryKey: ["products", categoryId, q],
    queryFn: () => {
      const usp = new URLSearchParams();
      if (categoryId) usp.set("category", categoryId);
      if (q) usp.set("q", q);
      return api<CatalogProduct[]>(`/api/catalog/products?${usp}`);
    },
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t("home.searchPlaceholder")}
          defaultValue={q}
          style={{ width: 260 }}
          onPressEnter={(e) =>
            setParams({ q: (e.target as HTMLInputElement).value, category: categoryId })
          }
        />
        <Segmented
          value={categoryId || "__all__"}
          onChange={(v) =>
            setParams(v === "__all__" ? {} : { category: String(v) })
          }
          options={[
            { label: t("home.all"), value: "__all__" },
            ...(cats.data ?? []).map((c) => ({ label: c.name, value: c.id })),
          ]}
        />
      </div>

      {products.isLoading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (products.data?.length ?? 0) === 0 ? (
        <Empty description={t("home.empty")} />
      ) : (
        <Row gutter={[16, 16]}>
          {products.data!.map((p) => (
            <Col key={p.id} xs={24} sm={12} lg={8}>
              <Link to={`/product/${p.id}`}>
                <Card
                  hoverable
                  style={{ height: "100%" }}
                  styles={{ body: { display: "flex", flexDirection: "column", gap: 8 } }}
                  cover={
                    p.coverImageId ? (
                      <Image
                        src={`/api/catalog/products/${p.id}/images/${p.coverImageId}`}
                        alt={p.title}
                        style={{ objectFit: "cover", height: 180 }}
                        preview={false}
                      />
                    ) : (
                      <div
                        style={{
                          height: 180,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f5f5fa",
                          color: "#bbb",
                          fontSize: 40,
                        }}
                      >
                        <FileImageOutlined />
                      </div>
                    )
                  }
                >
                  <Title level={5} style={{ margin: 0 }}>
                    {p.title}
                  </Title>
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ marginBottom: 0, minHeight: 44 }}
                  >
                    {p.description || t("home.noDesc")}
                  </Paragraph>
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Text strong style={{ color: "#4f46e5", fontSize: 18 }}>
                      {money(p.priceCents, p.currency)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {p.merchantName}
                      {p.categoryName ? ` · ${p.categoryName}` : ""}
                    </Text>
                  </div>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
