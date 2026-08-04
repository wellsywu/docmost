import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import type { AxiosError } from "axios";
import {
  createWechatAccount,
  deleteWechatAccount,
  getDoocsConfig,
  getDoocsUploadConfig,
  getWechatAccounts,
  testWechatAccount,
  updateDoocsUploadConfig,
  updateWechatAccount,
} from "@/features/integrations/doocs/services/doocs-service";
import {
  CreateWechatAccountInput,
  DoocsConfig,
  DoocsUploadConfig,
  UpdateDoocsUploadConfigInput,
  UpdateWechatAccountInput,
  WechatAccount,
  WechatAccountTestResult,
} from "@/features/integrations/doocs/types/doocs.types";

export const WECHAT_ACCOUNTS_QUERY_KEY = ["doocs", "wechat-accounts"] as const;
export const DOOCS_CONFIG_QUERY_KEY = ["doocs", "config"] as const;
export const DOOCS_UPLOAD_CONFIG_QUERY_KEY = [
  "doocs",
  "upload-config",
] as const;

/**
 * Deployment configuration never changes while the tab is open, so it is
 * fetched once and reused by every consumer.
 */
export function useDoocsConfigQuery() {
  return useQuery<DoocsConfig>({
    queryKey: DOOCS_CONFIG_QUERY_KEY,
    queryFn: getDoocsConfig,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

function getErrorMessage(error: Error): string | undefined {
  return (error as AxiosError<{ message?: string }>).response?.data?.message;
}

export function useWechatAccountsQuery() {
  return useQuery({
    queryKey: WECHAT_ACCOUNTS_QUERY_KEY,
    queryFn: getWechatAccounts,
  });
}

export function useDoocsUploadConfigQuery() {
  return useQuery({
    queryKey: DOOCS_UPLOAD_CONFIG_QUERY_KEY,
    queryFn: getDoocsUploadConfig,
  });
}

export function useUpdateDoocsUploadConfigMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("doocs");

  return useMutation<DoocsUploadConfig, Error, UpdateDoocsUploadConfigInput>({
    mutationFn: updateDoocsUploadConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: DOOCS_UPLOAD_CONFIG_QUERY_KEY,
      });
      notifications.show({
        message: t("Upload service settings saved successfully"),
      });
    },
    onError: (error) => {
      notifications.show({
        message:
          getErrorMessage(error) ?? t("Failed to save upload service settings"),
        color: "red",
      });
    },
  });
}

export function useCreateWechatAccountMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("doocs");

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
  const { t } = useTranslation("doocs");

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

/**
 * Reports the failing step verbatim: the WeChat errcode is the only thing that
 * separates an IP whitelist problem from an unverified account, so it is shown
 * instead of a generic failure message.
 */
export function useTestWechatAccountMutation() {
  const { t } = useTranslation("doocs");

  return useMutation<WechatAccountTestResult, Error, string>({
    mutationFn: testWechatAccount,
    onSuccess: (result) => {
      if (result.ok) {
        notifications.show({
          message: t("Connection test succeeded. Image upload is working."),
          color: "green",
        });
        return;
      }

      notifications.show({
        title:
          result.step === "token"
            ? t("Could not obtain an access token")
            : t("Access token works, but the image upload was rejected"),
        message: result.message ?? t("WeChat returned no detail."),
        color: "red",
        autoClose: false,
      });
    },
    onError: (error) => {
      notifications.show({
        message: getErrorMessage(error) ?? t("Connection test failed"),
        color: "red",
      });
    },
  });
}

export function useDeleteWechatAccountMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("doocs");

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
