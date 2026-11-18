import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Form, Input, Tabs, Typography, App } from "antd";
import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { authClient } from "../lib";

const { Title } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);

  async function onFinish(values: {
    email: string;
    password: string;
    name?: string;
  }) {
    setBusy(true);
    try {
      const res = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (res.error) throw new Error(res.error.message ?? t("auth.loginFailed"));
      navigate("/");
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("auth.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(values: {
    email: string;
    password: string;
    name?: string;
  }) {
    setBusy(true);
    try {
      const res = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.name || values.email.split("@")[0],
      });
      if (res.error) throw new Error(res.error.message ?? t("auth.registerFailed"));
      message.success(t("auth.registerSuccess"));
      navigate("/");
    } catch (e) {
      message.error(e instanceof Error ? e.message : t("auth.registerFailed"));
    } finally {
      setBusy(false);
    }
  }

  const formBody = (mode: "login" | "register") => (
    <Form
      layout="vertical"
      onFinish={mode === "login" ? onFinish : onRegister}
      requiredMark={false}
    >
      {mode === "register" && (
        <Form.Item name="name" label={t("auth.nickname")}>
          <Input prefix={<UserOutlined />} placeholder={t("auth.nicknameOptional")} />
        </Form.Item>
      )}
      <Form.Item
        name="email"
        label={t("auth.email")}
        rules={[
          { required: true, message: t("auth.emailRequired") },
          { type: "email", message: t("auth.emailInvalid") },
        ]}
      >
        <Input prefix={<MailOutlined />} placeholder={t("auth.emailPlaceholder")} />
      </Form.Item>
      <Form.Item
        name="password"
        label={t("auth.password")}
        rules={[
          { required: true, message: t("auth.passwordRequired") },
          { min: 8, message: t("auth.passwordMin") },
        ]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder={t("auth.passwordPlaceholder")} />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={busy}>
        {mode === "login" ? t("auth.login") : t("auth.register")}
      </Button>
    </Form>
  );

  return (
    <Card style={{ maxWidth: 400, margin: "40px auto" }}>
      <Title level={4} style={{ textAlign: "center", marginTop: 0 }}>
        MindShop
      </Title>
      <Tabs
        centered
        items={[
          { key: "login", label: t("auth.login"), children: formBody("login") },
          { key: "register", label: t("auth.register"), children: formBody("register") },
        ]}
      />
    </Card>
  );
}
