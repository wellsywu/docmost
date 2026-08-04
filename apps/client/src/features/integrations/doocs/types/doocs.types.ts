export interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  mpId: string | null;
  serviceType: string | null;
  verify: boolean;
  secretConfigured: boolean;
  /** WeChat OpenAPI proxy; null means the server calls WeChat directly. */
  proxyOrigin: string | null;
}

export interface CreateWechatAccountInput {
  name: string;
  appId: string;
  appSecret: string;
  verify: boolean;
  proxyOrigin?: string;
}

export interface UpdateWechatAccountInput {
  id: string;
  name: string;
  appId: string;
  appSecret?: string;
  verify: boolean;
  proxyOrigin?: string;
}

export interface WechatAccountTestResult {
  ok: boolean;
  step: "token" | "upload";
  message?: string;
}

export interface DoocsTicket {
  ticket: string;
  expiresAt: number;
}

export interface DoocsConfig {
  /** Empty when the doocs editor is not deployed. */
  editorUrl: string;
}

export type DoocsUploadProvider = "wechat" | "s3";

export interface DoocsS3UploadConfig {
  endpoint: string | null;
  region: string;
  bucket: string;
  accessKeyId: string;
  path: string | null;
  cdnHost: string | null;
  pathStyle: boolean;
  secretConfigured: boolean;
}

export interface DoocsUploadConfig {
  provider: DoocsUploadProvider;
  s3?: DoocsS3UploadConfig;
}

export interface UpdateDoocsS3UploadConfig extends Omit<
  DoocsS3UploadConfig,
  "secretConfigured"
> {
  accessKeySecret?: string;
}

export interface UpdateDoocsUploadConfigInput {
  provider: DoocsUploadProvider;
  s3?: UpdateDoocsS3UploadConfig;
}
