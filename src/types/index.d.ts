export interface InitOptions {
  extensionID?: string;
  providerVersion?: string;
  callbackUrl?: string;
}

export interface Proofs {
  [key: string]: unknown;
}

export type RequestEvents = "started" | "completed" | "error" | "progress";

export class JoclaimExtensionProofRequest {
  applicationId: string;
  providerId: string;
  sessionId: string;
  signature: string;
  timestamp: string;
  getStatusUrl(): string;

  static fromJsonString(
    json: string | Record<string, unknown>,
    options?: InitOptions,
  ): JoclaimExtensionProofRequest;
  static fromConfig(
    config: Record<string, unknown>,
    options?: InitOptions,
  ): JoclaimExtensionProofRequest;

  setAppCallbackUrl(url: string, jsonProofResponse?: boolean): void;
  setRedirectUrl(url: string): void;
  addContext(address: string | number, message: string): void;
  setParams(params: Record<string, unknown>): void;

  on(event: RequestEvents, cb: (payload?: unknown) => void): () => void;
  off(event: RequestEvents, cb: (payload?: unknown) => void): void;

  startVerification(): Promise<Proofs>;
  cancel(timeoutMs?: number): Promise<boolean | void>;
}

export class JoclaimExtensionSDK {
  initializeBackground(): unknown;
  isExtensionInstalled(opts?: { extensionID?: string; timeout?: number }): Promise<boolean>;
  getVersion(): string;
  init(
    applicationId: string,
    appSecret: string,
    providerId: string,
    options?: InitOptions,
  ): Promise<JoclaimExtensionProofRequest>;

  // Convenience wrapper that forwards to JoclaimExtensionProofRequest.fromJsonString
  fromJsonString(
    json: string | Record<string, unknown>,
    options?: InitOptions,
  ): JoclaimExtensionProofRequest;
}

export const joclaimExtensionSDK: JoclaimExtensionSDK;
export default JoclaimExtensionSDK;
