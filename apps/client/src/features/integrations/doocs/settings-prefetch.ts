import { queryClient } from "@/main.tsx";
import {
  DOOCS_UPLOAD_CONFIG_QUERY_KEY,
  WECHAT_ACCOUNTS_QUERY_KEY,
} from "@/features/integrations/doocs/queries/doocs-query";
import {
  getDoocsUploadConfig,
  getWechatAccounts,
} from "@/features/integrations/doocs/services/doocs-service";

export const prefetchDoocsSettings = () => {
  queryClient.prefetchQuery({
    queryKey: WECHAT_ACCOUNTS_QUERY_KEY,
    queryFn: getWechatAccounts,
  });
  queryClient.prefetchQuery({
    queryKey: DOOCS_UPLOAD_CONFIG_QUERY_KEY,
    queryFn: getDoocsUploadConfig,
  });
};
