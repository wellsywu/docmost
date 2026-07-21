import "@mantine/core/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@/styles/a11y-overrides.css";
// Load the reading theme/font rules at the app root so the [data-reading-*]
// attributes carried on <html> take effect app-wide (sidebar, top bar, menus,
// settings) — not only after the editor bundle mounts on a page route.
import "@/features/theming/reading-themes.css";

import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { mantineCssResolver, theme } from "@/theme";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import "./i18n";
import { injectReadingFontStyles } from "@/features/theming/reading-font-styles.ts";
import {
  getPostHogHost,
  getPostHogKey,
  isCloud,
  isPostHogEnabled,
} from "@/lib/config.ts";

// Emit the reading fonts' --prose-font vars + @font-face rules (generated from
// the font registry) before the app renders, so the choice applies app-wide.
injectReadingFontStyles();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

// posthog-js only downloads when analytics is actually enabled; self-hosted
// installs without a key ship zero analytics code.
if (isCloud() && isPostHogEnabled()) {
  import("posthog-js").then(({ default: posthog }) => {
    posthog.init(getPostHogKey(), {
      api_host: getPostHogHost(),
      defaults: "2025-05-24",
      disable_session_recording: true,
      capture_pageleave: false,
    });
  });
}

const container = document.getElementById("root") as HTMLElement;
const root = ((container as any).__reactRoot ??=
  ReactDOM.createRoot(container));

root.render(
  <BrowserRouter>
    <MantineProvider theme={theme} cssVariablesResolver={mantineCssResolver}>
      <ModalsProvider>
        <QueryClientProvider client={queryClient}>
          <Notifications position="bottom-center" limit={3} zIndex={10000} />
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  </BrowserRouter>,
);
