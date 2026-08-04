import { useEffect } from "react";
import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconCloudUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useDoocsUploadConfigQuery,
  useUpdateDoocsUploadConfigMutation,
  useWechatAccountsQuery,
} from "@/features/integrations/doocs/queries/doocs-query";
import { DoocsUploadProvider } from "@/features/integrations/doocs/types/doocs.types";

interface FormValues {
  provider: DoocsUploadProvider;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  path: string;
  cdnHost: string;
  pathStyle: boolean;
}

export function UploadConfigForm() {
  const { t } = useTranslation("doocs");
  const {
    data: uploadConfig,
    isLoading,
    isError,
  } = useDoocsUploadConfigQuery();
  const { data: accounts } = useWechatAccountsQuery();
  const updateMutation = useUpdateDoocsUploadConfigMutation();
  const s3SecretConfigured = uploadConfig?.s3?.secretConfigured ?? false;

  const form = useForm<FormValues>({
    initialValues: {
      provider: "wechat",
      endpoint: "",
      region: "",
      bucket: "",
      accessKeyId: "",
      accessKeySecret: "",
      path: "",
      cdnHost: "",
      pathStyle: false,
    },
    validate: {
      region: (value, values) =>
        values.provider === "s3" && value.trim().length === 0
          ? t("S3 region is required")
          : null,
      bucket: (value, values) =>
        values.provider === "s3" && value.trim().length === 0
          ? t("S3 bucket is required")
          : null,
      accessKeyId: (value, values) =>
        values.provider === "s3" && value.trim().length === 0
          ? t("S3 Access Key ID is required")
          : null,
      accessKeySecret: (value, values) =>
        values.provider === "s3" &&
        !s3SecretConfigured &&
        value.trim().length === 0
          ? t("S3 Access Key Secret is required")
          : null,
    },
  });

  useEffect(() => {
    if (!uploadConfig) {
      return;
    }

    form.setValues({
      provider: uploadConfig.provider,
      endpoint: uploadConfig.s3?.endpoint ?? "",
      region: uploadConfig.s3?.region ?? "",
      bucket: uploadConfig.s3?.bucket ?? "",
      accessKeyId: uploadConfig.s3?.accessKeyId ?? "",
      accessKeySecret: "",
      path: uploadConfig.s3?.path ?? "",
      cdnHost: uploadConfig.s3?.cdnHost ?? "",
      pathStyle: uploadConfig.s3?.pathStyle ?? false,
    });
    form.resetDirty();
    form.clearErrors();
  }, [uploadConfig]);

  const handleSubmit = async (values: FormValues) => {
    try {
      if (values.provider === "wechat") {
        await updateMutation.mutateAsync({ provider: "wechat" });
        return;
      }

      const accessKeySecret = values.accessKeySecret.trim();

      await updateMutation.mutateAsync({
        provider: "s3",
        s3: {
          endpoint: values.endpoint.trim(),
          region: values.region.trim(),
          bucket: values.bucket.trim(),
          accessKeyId: values.accessKeyId.trim(),
          ...(accessKeySecret ? { accessKeySecret } : {}),
          path: values.path.trim(),
          cdnHost: values.cdnHost.trim(),
          pathStyle: values.pathStyle,
        },
      });
    } catch {
      // The mutation surfaces the server error through a notification.
    }
  };

  const wechatUnavailable =
    form.values.provider === "wechat" && accounts && accounts.length === 0;

  return (
    <Stack gap="md">
      <div>
        <Text fw={500}>{t("Image upload service")}</Text>
        <Text size="sm" c="dimmed" maw={620}>
          {t(
            "Choose where images are uploaded when publishing through the Doocs editor.",
          )}
        </Text>
      </div>

      {isLoading && (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      )}

      {isError && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertCircle size={18} />}
          title={t("Unable to load upload service settings")}
        >
          {t("Refresh the page to try again.")}
        </Alert>
      )}

      {!isLoading && !isError && (
        <Card withBorder radius="sm" p="md">
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <SegmentedControl
                data={[
                  { label: t("WeChat official account"), value: "wechat" },
                  { label: t("S3"), value: "s3" },
                ]}
                {...form.getInputProps("provider")}
              />

              {wechatUnavailable && (
                <Alert
                  color="orange"
                  variant="light"
                  icon={<IconAlertCircle size={18} />}
                >
                  {t(
                    "At least one WeChat official account is required before WeChat image upload can be used.",
                  )}
                </Alert>
              )}

              {form.values.provider === "s3" && (
                <Stack gap="md">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                      label={t("Endpoint")}
                      placeholder={t("https://s3.example.com")}
                      {...form.getInputProps("endpoint")}
                    />
                    <TextInput
                      label={t("Region")}
                      placeholder={t("us-east-1")}
                      withAsterisk
                      {...form.getInputProps("region")}
                    />
                    <TextInput
                      label={t("Bucket")}
                      placeholder={t("my-bucket")}
                      withAsterisk
                      {...form.getInputProps("bucket")}
                    />
                    <TextInput
                      label={t("Access Key ID")}
                      withAsterisk
                      autoComplete="off"
                      {...form.getInputProps("accessKeyId")}
                    />
                    <PasswordInput
                      label={t("Access Key Secret")}
                      placeholder={
                        s3SecretConfigured
                          ? t("Leave blank to keep the current secret")
                          : t("Enter the S3 Access Key Secret")
                      }
                      withAsterisk={!s3SecretConfigured}
                      autoComplete="new-password"
                      {...form.getInputProps("accessKeySecret")}
                    />
                    <TextInput
                      label={t("Upload path")}
                      placeholder={t("images/{yyyy}/{mm}/")}
                      {...form.getInputProps("path")}
                    />
                    <TextInput
                      label={t("CDN host")}
                      placeholder={t("https://cdn.example.com")}
                      {...form.getInputProps("cdnHost")}
                    />
                  </SimpleGrid>

                  <Switch
                    label={t("Use path-style URLs")}
                    description={t(
                      "Enable this for S3-compatible services that require bucket names in the URL path.",
                    )}
                    {...form.getInputProps("pathStyle", { type: "checkbox" })}
                  />

                  <Alert
                    color="blue"
                    variant="light"
                    icon={<IconCloudUpload size={18} />}
                  >
                    {s3SecretConfigured
                      ? t(
                          "For security, the current secret is never displayed. Enter a new value only to replace it.",
                        )
                      : t(
                          "For security, the secret is encrypted after saving and will not be displayed again.",
                        )}
                  </Alert>
                </Stack>
              )}

              <Group justify="flex-end">
                <Button
                  type="submit"
                  loading={updateMutation.isPending}
                  disabled={Boolean(wechatUnavailable)}
                >
                  {t("Save changes")}
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      )}
    </Stack>
  );
}
