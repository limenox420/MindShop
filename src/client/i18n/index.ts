import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./zh";
import en from "./en";
import fr from "./fr";
import de from "./de";
import es from "./es";
import ru from "./ru";

export const LANGUAGES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
] as const;

const resources = {
  zh: { translation: zh },
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  ru: { translation: ru },
};

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
const browser = typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : null;
const initial =
  stored && stored in resources
    ? stored
    : browser && browser in resources
      ? browser
      : "zh";

i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export function changeLanguage(code: string) {
  localStorage.setItem("lang", code);
  document.documentElement.lang = code;
  return i18n.changeLanguage(code);
}

// server responses carry zh error messages; map them to translated keys
const SERVER_ERROR_MAP: Record<string, string> = {
  "邮箱格式不正确": "errors.emailInvalid",
  "密码至少 8 位": "errors.passwordMin",
  "该邮箱已注册": "errors.emailExists",
  "不能修改自己的角色": "errors.selfRole",
  "不能删除自己": "errors.selfDelete",
  "该用户已是商户": "errors.alreadyMerchant",
  "该商户已有订单记录，无法删除，请使用停用": "errors.merchantHasOrders",
  "商品已有订单记录，无法删除，可改为下架": "errors.productHasOrders",
  "仅支持图片文件": "errors.imageOnly",
  "图片不能超过 5MB": "errors.imageTooLarge",
  "商品库存不足": "errors.outOfStock",
  "无可用卡密，请先补货后重试": "errors.cardNone",
  "卡密商品上架前需至少导入一条卡密": "errors.cardsPublishEmpty",
  "已售出的卡密不可删除": "errors.cardSold",
  "该商品仅支持指定支付方式": "errors.payMethodLocked",
};

export function translateServerError(msg: string): string {
  if (SERVER_ERROR_MAP[msg]) return i18n.t(SERVER_ERROR_MAP[msg]);
  let m = msg.match(/^最多上传 \d+ 张预览图$/);
  if (m) return i18n.t("errors.tooManyImages");
  m = msg.match(/^文件大小不能超过 (\d+) (GB|MB)$/);
  if (m) return i18n.t("errors.fileTooLarge", { max: m[1], unit: m[2] });
  m = msg.match(/^附件大小上限需为 1-\d+ 的整数（MB）$/);
  if (m) return i18n.t("errors.fileLimitRange");
  m = msg.match(/^单次最多导入 (\d+) 条卡密$/);
  if (m) return i18n.t("errors.tooManyCards", { max: m[1] });
  return msg;
}

export default i18n;
