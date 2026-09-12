export type WhatsappEmbeddedSignupConfig = {
  appId: string;
  apiVersion: string;
  configId: string | null;
};

export type VerifyConnectSessionResult = {
  userId: string;
  gymId: string;
  expiresAt: string;
  config: WhatsappEmbeddedSignupConfig;
};

export type EmbeddedSignupResult = {
  success: boolean;
  isConnected: boolean;
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  connectedAt: string | null;
};

export type GymforgeConnectSessionMessage = {
  type: "GYMFORGE_CONNECT_SESSION";
  connectToken: string;
};

export type SignupCredentials = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
};
