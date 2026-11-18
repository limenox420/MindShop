import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
  App,
} from "antd";
import { useTranslation } from "react-i18next";
import { useSession, signOut, userRole, api } from "../lib";

const { Text } = Typography;

const ROLE_COLOR: Record<string, string> = {
  user: "blue",
  merchant: "purple",
  admin: "red",
};

export default function Account() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!session) {
    return <Alert type="info" showIcon message={t("account.loginFirst")} />;
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      await api("/api/account/delete", { method: "POST" });
      await signOut();
      message.success(t("account.success"));
      navigate("/");
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("account.failed"));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const role = userRole(session.user);

  return (
    <Space direction="vertical" style={{ width: "100%", maxWidth: 640, margin: "0 auto" }} size={16}>
      <Card title={t("account.infoTitle")}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label={t("account.nickname")}>{session.user.name}</Descriptions.Item>
          <Descriptions.Item label={t("account.email")}>{session.user.email}</Descriptions.Item>
          <Descriptions.Item label={t("account.role")}>
            <Tag color={ROLE_COLOR[role] ?? "blue"}>{t(`roles.${role}`)}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<Text type="danger">{t("account.dangerTitle")}</Text>}>
        <Alert
          type="warning"
          showIcon
          message={t("account.warnTitle")}
          description={t("account.warnDesc")}
          style={{ marginBottom: 16 }}
        />
        <Button danger onClick={() => setOpen(true)}>
          {t("account.deleteBtn")}
        </Button>
      </Card>

      <Modal
        title={t("account.confirmTitle")}
        open={open}
        onCancel={() => setOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>,
          <Button
            key="ok"
            type="primary"
            danger
            loading={busy}
            disabled={confirm !== t("account.confirmWord")}
            onClick={deleteAccount}
          >
            {t("account.confirmBtn")}
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text>{t("account.confirmHint")}</Text>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("account.confirmWord")}
          />
        </Space>
      </Modal>
    </Space>
  );
}
