import api from "@/lib/api-client";
import {
  CreateWechatAccountInput,
  MdTicket,
  UpdateWechatAccountInput,
  WechatAccount,
} from "@/features/integrations/md/types/md-integration.types";

const MD_INTEGRATION_PATH = "/integrations/md";

export async function getWechatAccounts(): Promise<WechatAccount[]> {
  const response = await api.post<WechatAccount[]>(
    `${MD_INTEGRATION_PATH}/accounts/list`,
  );
  return response.data;
}

export async function createWechatAccount(
  input: CreateWechatAccountInput,
): Promise<WechatAccount> {
  const response = await api.post<WechatAccount>(
    `${MD_INTEGRATION_PATH}/accounts/create`,
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
    `${MD_INTEGRATION_PATH}/accounts/update`,
    payload,
  );
  return response.data;
}

export async function deleteWechatAccount(id: string): Promise<void> {
  await api.post(`${MD_INTEGRATION_PATH}/accounts/delete`, { id });
}

export async function createMdTicket(pageId: string): Promise<MdTicket> {
  const response = await api.post<MdTicket>(`${MD_INTEGRATION_PATH}/tickets`, {
    pageId,
  });
  return response.data;
}
