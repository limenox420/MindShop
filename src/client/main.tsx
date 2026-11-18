import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { Locale } from "antd/es/locale";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import frFR from "antd/locale/fr_FR";
import deDE from "antd/locale/de_DE";
import esES from "antd/locale/es_ES";
import ruRU from "antd/locale/ru_RU";
import i18n from "./i18n";
import AppRoutes from "./AppRoutes";
import "./index.css";

const ANTD_LOCALES: Record<string, Locale> = {
  zh: zhCN,
  en: enUS,
  fr: frFR,
  de: deDE,
  es: esES,
  ru: ruRU,
};

const queryClient = new QueryClient();

function Root() {
  const { i18n: i18nInstance } = useTranslation();
  return (
    <ConfigProvider
      locale={ANTD_LOCALES[i18nInstance.language] ?? zhCN}
      theme={{
        token: { colorPrimary: "#4f46e5", borderRadius: 8 },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
