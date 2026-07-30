import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconAlertCircle,
  IconBrandWechat,
  IconKey,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useDeleteWechatAccountMutation,
  useWechatAccountsQuery,
} from "@/features/integrations/md/queries/md-integration-query";
import { WechatAccount } from "@/features/integrations/md/types/md-integration.types";
import { WechatAccountModal } from "@/features/integrations/md/components/wechat-account-modal";

export function WechatAccountList() {
  const { t } = useTranslation();
  const { data: accounts, isLoading, isError } = useWechatAccountsQuery();
  const deleteMutation = useDeleteWechatAccountMutation();
  const [opened, setOpened] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<WechatAccount | null>(
    null,
  );

  const openCreateModal = () => {
    setSelectedAccount(null);
    setOpened(true);
  };

  const openEditModal = (account: WechatAccount) => {
    setSelectedAccount(account);
    setOpened(true);
  };

  const closeModal = () => {
    setOpened(false);
    setSelectedAccount(null);
  };

  const confirmDelete = (account: WechatAccount) => {
    modals.openConfirmModal({
      title: t("Delete WeChat account"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            'Are you sure you want to delete "{{name}}"? Publishing with this account will no longer be available.',
            { name: account.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red", loading: deleteMutation.isPending },
      onConfirm: () => deleteMutation.mutateAsync(account.id),
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500}>{t("Official account credentials")}</Text>
          <Text size="sm" c="dimmed" maw={620}>
            {t(
              "Manage the WeChat official accounts available to this workspace. AppSecrets are write-only and are never returned to the browser.",
            )}
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
          {t("Add account")}
        </Button>
      </Group>

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
          title={t("Unable to load WeChat accounts")}
        >
          {t("Refresh the page to try again.")}
        </Alert>
      )}

      {!isLoading && !isError && accounts?.length === 0 && (
        <Card withBorder radius="sm" p="xl">
          <Center>
            <Stack align="center" gap="xs">
              <ThemeIcon size={42} radius="xl" variant="light" color="green">
                <IconBrandWechat size={22} />
              </ThemeIcon>
              <Text fw={500}>{t("No WeChat accounts configured")}</Text>
              <Text size="sm" c="dimmed" ta="center" maw={440}>
                {t(
                  "Add an official account to make it available in the publishing editor.",
                )}
              </Text>
            </Stack>
          </Center>
        </Card>
      )}

      {!isLoading && !isError && accounts && accounts.length > 0 && (
        <Card withBorder radius="sm" p={0}>
          <Table.ScrollContainer minWidth={680}>
            <Table verticalSpacing="md" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Name")}</Table.Th>
                  <Table.Th>{t("AppID")}</Table.Th>
                  <Table.Th>{t("Authentication status")}</Table.Th>
                  <Table.Th>{t("AppSecret")}</Table.Th>
                  <Table.Th ta="right">{t("Actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {accounts.map((account) => (
                  <Table.Tr key={account.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon
                          size={30}
                          radius="md"
                          variant="light"
                          color="green"
                        >
                          <IconBrandWechat size={17} />
                        </ThemeIcon>
                        <Text fw={500} size="sm">
                          {account.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {account.appId}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={account.verify ? "green" : "gray"}
                      >
                        {account.verify
                          ? t("Authenticated")
                          : t("Not authenticated")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={account.secretConfigured ? "blue" : "orange"}
                        leftSection={<IconKey size={12} />}
                      >
                        {account.secretConfigured
                          ? t("Configured")
                          : t("Not configured")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" gap={4} wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t("Edit {{name}}", {
                            name: account.name,
                          })}
                          onClick={() => openEditModal(account)}
                        >
                          <IconPencil size={17} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t("Delete {{name}}", {
                            name: account.name,
                          })}
                          onClick={() => confirmDelete(account)}
                          disabled={deleteMutation.isPending}
                        >
                          <IconTrash size={17} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <WechatAccountModal
        opened={opened}
        onClose={closeModal}
        account={selectedAccount}
      />
    </Stack>
  );
}
