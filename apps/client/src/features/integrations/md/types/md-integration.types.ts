export interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  mpId: string | null;
  serviceType: string | null;
  verify: boolean;
  secretConfigured: boolean;
}

export interface CreateWechatAccountInput {
  name: string;
  appId: string;
  appSecret: string;
  verify: boolean;
}

export interface UpdateWechatAccountInput {
  id: string;
  name: string;
  appId: string;
  appSecret?: string;
  verify: boolean;
}

export interface MdTicket {
  ticket: string;
  expiresAt: number;
}
