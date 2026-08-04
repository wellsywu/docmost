import api from "@/lib/api-client";
import {
  CreateWechatAccountInput,
  DoocsConfig,
  DoocsTicket,
  DoocsUploadConfig,
  UpdateDoocsUploadConfigInput,
  UpdateWechatAccountInput,
  WechatAccount,
  WechatAccountTestResult,
} from "@/features/integrations/doocs/types/doocs.types";

const DOOCS_API_PATH = "/integrations/doocs";

/**
 * Deployment configuration of the doocs integration. Served by the integration
 * itself rather than injected into `window.CONFIG`, so Docmost core carries no
 * doocs-specific values.
 */
export async function getDoocsConfig(): Promise<DoocsConfig> {
  const response = await api.get<DoocsConfig>(`${DOOCS_API_PATH}/config`);
  return response.data;
}

export async function getWechatAccounts(): Promise<WechatAccount[]> {
  const response = await api.post<WechatAccount[]>(
    `${DOOCS_API_PATH}/accounts/list`,
  );
  return response.data;
}

export async function getDoocsUploadConfig(): Promise<DoocsUploadConfig> {
  const response = await api.post<DoocsUploadConfig>(
    `${DOOCS_API_PATH}/upload-config`,
  );
  return response.data;
}

export async function updateDoocsUploadConfig(
  input: UpdateDoocsUploadConfigInput,
): Promise<DoocsUploadConfig> {
  const response = await api.post<DoocsUploadConfig>(
    `${DOOCS_API_PATH}/upload-config/update`,
    input,
  );
  return response.data;
}

export async function createWechatAccount(
  input: CreateWechatAccountInput,
): Promise<WechatAccount> {
  const response = await api.post<WechatAccount>(
    `${DOOCS_API_PATH}/accounts/create`,
    input,
  );
  return response.data;
}

export async function updateWechatAccount(
  input: UpdateWechatAccountInput,
): Promise<WechatAccount> {
  const { appSecret, ...account } = input;
  const payload = appSecret === undefined ? account : { ...account, appSecret };
  const response = await api.post<WechatAccount>(
    `${DOOCS_API_PATH}/accounts/update`,
    payload,
  );
  return response.data;
}

export async function deleteWechatAccount(id: string): Promise<void> {
  await api.post(`${DOOCS_API_PATH}/accounts/delete`, { id });
}

export async function testWechatAccount(
  id: string,
): Promise<WechatAccountTestResult> {
  const response = await api.post<WechatAccountTestResult>(
    `${DOOCS_API_PATH}/accounts/test`,
    { id },
  );
  return response.data;
}

export async function createDoocsTicket(pageId: string): Promise<DoocsTicket> {
  const response = await api.post<DoocsTicket>(`${DOOCS_API_PATH}/tickets`, {
    pageId,
  });
  return response.data;
}
