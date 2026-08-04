import { Helmet } from "react-helmet-async";
import { Alert, Badge, Card, Group, Stack, Text } from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title";
import { UploadConfigForm } from "@/features/integrations/doocs/components/upload-config-form";
import { WechatAccountList } from "@/features/integrations/doocs/components/wechat-account-list";
import { useDoocsConfigQuery } from "@/features/integrations/doocs/queries/doocs-query";
import useUserRole from "@/hooks/use-user-role";
import { getAppName } from "@/lib/config";
import { useTranslation } from "react-i18next";

function DoocsEditorStatus() {
  const { t } = useTranslation("doocs");
  const { data: doocsConfig, isError } = useDoocsConfigQuery();

  return (
    <Card withBorder radius="sm" p="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={500}>{t("Editor status")}</Text>
            <Text size="sm" c="dimmed" maw={620}>
              {doocsConfig?.editorUrl
                ? t("The Doocs editor is available at {{url}}.", {
                    url: doocsConfig.editorUrl,
                  })
                : t("Doocs editor is not configured.")}
            </Text>
          </div>
          <Badge
            variant="light"
            color={doocsConfig?.editorUrl ? "green" : "orange"}
          >
            {doocsConfig?.editorUrl ? t("Available") : t("Not configured")}
          </Badge>
        </Group>
        {isError && (
          <Alert color="red" variant="light">
            {t("Unable to load editor status")}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

export default function DoocsSettings() {
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>
          Doocs - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title="Doocs" />
      <Stack gap="xl">
        <DoocsEditorStatus />
        <UploadConfigForm />
        <WechatAccountList />
      </Stack>
    </>
  );
}
