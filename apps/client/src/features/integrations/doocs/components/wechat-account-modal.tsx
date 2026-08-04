import { useEffect } from "react";
import {
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import {
  useCreateWechatAccountMutation,
  useUpdateWechatAccountMutation,
} from "@/features/integrations/doocs/queries/doocs-query";
import { WechatAccount } from "@/features/integrations/doocs/types/doocs.types";

interface WechatAccountModalProps {
  opened: boolean;
  onClose: () => void;
  account: WechatAccount | null;
}

interface FormValues {
  name: string;
  appId: string;
  appSecret: string;
  verify: boolean;
  proxyOrigin: string;
}

export function WechatAccountModal({
  opened,
  onClose,
  account,
}: WechatAccountModalProps) {
  const { t } = useTranslation("doocs");
  const createMutation = useCreateWechatAccountMutation();
  const updateMutation = useUpdateWechatAccountMutation();
  const isEditing = Boolean(account);

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      appId: "",
      appSecret: "",
      verify: false,
      proxyOrigin: "",
    },
    validate: {
      name: (value) =>
        value.trim().length > 0 ? null : t("Account name is required"),
      appId: (value) =>
        value.trim().length > 0 ? null : t("AppID is required"),
      appSecret: (value) =>
        isEditing || value.trim().length > 0
          ? null
          : t("AppSecret is required"),
    },
  });

  useEffect(() => {
    if (!opened) {
      return;
    }

    form.setValues({
      name: account?.name ?? "",
      appId: account?.appId ?? "",
      appSecret: "",
      verify: account?.verify ?? false,
      proxyOrigin: account?.proxyOrigin ?? "",
    });
    form.resetDirty();
    form.clearErrors();
  }, [account, opened]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      if (account) {
        await updateMutation.mutateAsync({
          id: account.id,
          name: values.name.trim(),
          appId: values.appId.trim(),
          appSecret: values.appSecret || undefined,
          verify: values.verify,
          proxyOrigin: values.proxyOrigin.trim(),
        });
      } else {
        await createMutation.mutateAsync({
          name: values.name.trim(),
          appId: values.appId.trim(),
          appSecret: values.appSecret,
          verify: values.verify,
          proxyOrigin: values.proxyOrigin.trim(),
        });
      }
      handleClose();
    } catch {
      // The mutation surfaces the server error through a notification.
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t(isEditing ? "Edit WeChat account" : "Add WeChat account")}
      closeButtonProps={{ "aria-label": t("Close") }}
      size="md"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label={t("Account name")}
            placeholder={t("e.g. Company official account")}
            withAsterisk
            data-autofocus
            maxLength={255}
            {...form.getInputProps("name")}
          />

          <TextInput
            label={t("AppID")}
            placeholder={t("Enter the WeChat AppID")}
            withAsterisk
            maxLength={255}
            {...form.getInputProps("appId")}
          />

          <div>
            <PasswordInput
              label={t("AppSecret")}
              placeholder={
                isEditing
                  ? t("Leave blank to keep the current AppSecret")
                  : t("Enter the WeChat AppSecret")
              }
              withAsterisk={!isEditing}
              maxLength={2048}
              autoComplete="new-password"
              {...form.getInputProps("appSecret")}
            />
            <Text size="xs" c="dimmed" mt={6}>
              {isEditing
                ? t(
                    "For security, the current AppSecret is never displayed. Enter a new value only to replace it.",
                  )
                : t(
                    "For security, the AppSecret is encrypted after saving and will not be displayed again.",
                  )}
            </Text>
          </div>

          <TextInput
            label={t("Proxy domain")}
            placeholder={t("e.g. https://wechat.example.workers.dev")}
            description={t(
              "Optional. WeChat only accepts access token requests from IPs on the official account whitelist. Set a proxy you control when the server's own IP cannot be whitelisted; the AppSecret is sent to this host.",
            )}
            maxLength={255}
            {...form.getInputProps("proxyOrigin")}
          />

          <Switch
            label={t("Authenticated")}
            description={t(
              "Mark this account as authenticated and ready for publishing.",
            )}
            {...form.getInputProps("verify", { type: "checkbox" })}
          />

          <Group justify="flex-end" mt="sm">
            <Button
              variant="default"
              onClick={handleClose}
              disabled={isPending}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={isPending}>
              {t(isEditing ? "Save changes" : "Add account")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
