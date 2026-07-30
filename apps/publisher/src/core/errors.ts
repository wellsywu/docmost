export class PublicationBlockedError extends Error {
  constructor(
    name: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = name;
  }
}

export class WeChatAccountNotFoundError extends Error {
  constructor() {
    super("WeChat account is not available");
    this.name = "WeChatAccountNotFoundError";
  }
}

export class WeChatAccountUnavailableError extends Error {
  constructor() {
    super("WeChat account credentials are unavailable");
    this.name = "WeChatAccountUnavailableError";
  }
}
