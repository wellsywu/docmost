import { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandWechat } from "@tabler/icons-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { createDoocsTicket } from "@/features/integrations/doocs/services/doocs-service";
import { useDoocsConfigQuery } from "@/features/integrations/doocs/queries/doocs-query";

export default function PublishToWeChat() {
  const { t } = useTranslation("doocs");
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const { data: doocsConfig } = useDoocsConfigQuery();
  const [isLoading, setIsLoading] = useState(false);

  const editorUrl = doocsConfig?.editorUrl;
  if (!editorUrl || !page?.id) {
    return null;
  }

  const openEditor = async () => {
    if (isLoading) {
      return;
    }

    const editorWindow = window.open("about:blank", "_blank");
    if (!editorWindow) {
      notifications.show({
        message: t(
          "The publishing editor was blocked. Allow pop-ups and try again.",
        ),
        color: "red",
      });
      return;
    }

    // Sever the new page from Docmost immediately, before awaiting the ticket.
    editorWindow.opener = null;
    setIsLoading(true);

    try {
      const { ticket } = await createDoocsTicket(page.id);
      const url = new URL(editorUrl);
      if (!url.pathname.endsWith("/")) {
        url.pathname = `${url.pathname}/`;
      }
      url.search = "";
      url.searchParams.set("docmost", ticket);
      editorWindow.location.replace(url.toString());
    } catch {
      editorWindow.close();
      notifications.show({
        message: t("Unable to open the publishing editor. Please try again."),
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip label={t("Publish to WeChat")} openDelay={250} withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        aria-label={t("Publish to WeChat")}
        onClick={openEditor}
        loading={isLoading}
        disabled={isLoading}
      >
        <IconBrandWechat size={20} stroke={2} />
      </ActionIcon>
    </Tooltip>
  );
}
