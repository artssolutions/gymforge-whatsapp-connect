export type MetaLoginResponse = {
  status?: "connected" | "not_authorized" | "unknown";
  authResponse?: {
    code?: string;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
  };
};

export type MetaLoginCallback = (response: MetaLoginResponse) => void;

export type MetaLoginOptions = {
  config_id: string;
  response_type: "code";
  override_default_response_type: boolean;
  extras: {
    setup: Record<string, never>;
    sessionInfoVersion: string;
  };
};

export type FacebookSdk = {
  init: (params: {
    appId: string;
    cookie: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (callback: MetaLoginCallback, options: MetaLoginOptions) => void;
};

export type WaEmbeddedSignupEvent = {
  type?: string;
  event?: string;
  data?: Record<string, unknown>;
  waba_id?: string;
  phone_number_id?: string;
  display_phone_number?: string;
};
