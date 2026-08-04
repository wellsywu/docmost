import { IconBrandWechat } from "@tabler/icons-react";

export const DOOCS_SETTINGS_PATH = "/settings/doocs";

/**
 * Settings sidebar entry owned by the doocs integration. `settings-sidebar.tsx`
 * spreads this in rather than declaring the label, icon, path and role itself,
 * so changing any of them never touches a Docmost core file.
 *
 * The label is translated from the `doocs` namespace, which the sidebar reaches
 * by declaring `useTranslation(["translation", "doocs"])`; i18next then falls
 * back across the namespace list (see i18n-namespace.test.ts).
 *
 * Kept free of side-effectful imports so it stays cheap to import and to test;
 * the prefetch helper lives in settings-prefetch.ts because it pulls in the
 * app-wide query client.
 */
export const doocsSettingsNavItem = {
  label: "Doocs",
  icon: IconBrandWechat,
  path: DOOCS_SETTINGS_PATH,
  role: "admin",
} as const;
