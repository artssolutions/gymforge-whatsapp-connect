import type {
  EmbeddedSignupResult,
  SignupCredentials,
  VerifyConnectSessionResult,
} from "../types/connectSession";

const API_BASE_URL = "https://api.gymforge.artsolutions.tech";

type ApiEnvelope<T> = {
  message?: string;
  values: T;
};

async function postWithConnectToken<T>(
  path: string,
  connectToken: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connectToken}`,
      Accept: "application/json, application/problem+json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload || typeof payload !== "object" || !("values" in payload)) {
    throw new Error("Invalid API response");
  }

  return payload.values;
}

export async function verifyConnectSession(
  connectToken: string
): Promise<VerifyConnectSessionResult> {
  return postWithConnectToken<VerifyConnectSessionResult>(
    "/api/admin/whatsapp-settings/connect-session/verify",
    connectToken
  );
}

export async function completeEmbeddedSignup(
  connectToken: string,
  payload: SignupCredentials & { code: string }
): Promise<EmbeddedSignupResult> {
  const body: Record<string, string> = {
    code: payload.code,
    wabaId: payload.wabaId,
    phoneNumberId: payload.phoneNumberId,
  };

  if (payload.displayPhoneNumber) {
    body.displayPhoneNumber = payload.displayPhoneNumber;
  }

  return postWithConnectToken<EmbeddedSignupResult>(
    "/api/admin/whatsapp-settings/embedded-signup",
    connectToken,
    body
  );
}
