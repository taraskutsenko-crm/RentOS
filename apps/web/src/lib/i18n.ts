"use client";

import { defaultLanguage, resources } from "@rentos/localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: defaultLanguage,
    fallbackLng: defaultLanguage,
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
