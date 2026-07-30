import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import type { AxiosError } from "axios";
import {
  createWechatAccount,
  deleteWechatAccount,
  getWechatAccounts,
  updateWechatAccount,
} from "@/features/integrations/md/services/md-integration-service";
import {
  CreateWechatAccountInput,
  UpdateWechatAccountInput,
  WechatAccount,
} from "@/features/integrations/md/types/md-integration.types";

export const WECHAT_ACCOUNTS_QUERY_KEY = ["md", "wechat-accounts"] as const;

function getErrorMessage(error: Error): string | undefined {
  return (error as AxiosError<{ message?: string }>).response?.data?.message;
}

export function useWechatAccountsQuery() {
  return useQuery({
    queryKey: WECHAT_ACCOUNTS_QUERY_KEY,
    queryFn: getWechatAccounts,
  });
}

export function useCreateWechatAccountMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<WechatAccount, Error, CreateWechatAccountInput>({
    mutationFn: createWechatAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WECHAT_ACCOUNTS_QUERY_KEY });
      notifications.show({
        message: t("WeChat account created successfully"),
      });
    },
    onError: (error) => {
      notifications.show({
        message: getErrorMessage(error) ?? t("Failed to create WeChat account"),
        color: "red",
      });
    },
  });
}

export function useUpdateWechatAccountMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<WechatAccount, Error, UpdateWechatAccountInput>({
    mutationFn: updateWechatAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WECHAT_ACCOUNTS_QUERY_KEY });
      notifications.show({
        message: t("WeChat account updated successfully"),
      });
    },
    onError: (error) => {
      notifications.show({
        message: getErrorMessage(error) ?? t("Failed to update WeChat account"),
        color: "red",
      });
    },
  });
}

export function useDeleteWechatAccountMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, string>({
    mutationFn: deleteWechatAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WECHAT_ACCOUNTS_QUERY_KEY });
      notifications.show({
        message: t("WeChat account deleted successfully"),
      });
    },
    onError: (error) => {
      notifications.show({
        message: getErrorMessage(error) ?? t("Failed to delete WeChat account"),
        color: "red",
      });
    },
  });
}
