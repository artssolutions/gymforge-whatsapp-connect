import { API_BASE_URL } from "../config/api";
import type {
  EmbeddedSignupResult,
  SignupCredentials,
  VerifyConnectSessionResult,
} from "../types/connectSession";

type ApiEnvelope<T> = {
  message?: string;
  values: T;
};

export type ConnectSessionVerifyDiagnostics = {
  apiBaseUrl: string;
  hasResponse: boolean;
  status: number | null;
  safeMessage: string;
};

export class ConnectSessionVerifyError extends Error {
  readonly diagnostics: ConnectSessionVerifyDiagnostics;

  constructor(diagnostics: ConnectSessionVerifyDiagnostics) {
    super(diagnostics.safeMessage);
    this.name = "ConnectSessionVerifyError";
    this.diagnostics = diagnostics;
  }
}

function readSafeApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const message = (payload as { message?: unknown }).message;
  if (typeof message !== "string") {
    return null;
  }

  const trimmed = message.trim();
  return trimmed === "" ? null : trimmed;
}

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
  const path = "/api/admin/whatsapp-settings/connect-session/verify";
  const apiBaseUrl = API_BASE_URL;

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connectToken}`,
        Accept: "application/json, application/problem+json",
      },
    });

    if (!response.ok) {
      let safeMessage = `HTTP ${response.status}`;
      try {
        const errorBody: unknown = await response.json();
        const apiMessage = readSafeApiErrorMessage(errorBody);
        if (apiMessage) {
          safeMessage = apiMessage;
        }
      } catch {
        // Ignore non-JSON error bodies.
      }

      throw new ConnectSessionVerifyError({
        apiBaseUrl,
        hasResponse: true,
        status: response.status,
        safeMessage,
      });
    }

    const payload = (await response.json()) as ApiEnvelope<VerifyConnectSessionResult>;
    if (!payload || typeof payload !== "object" || !("values" in payload)) {
      throw new ConnectSessionVerifyError({
        apiBaseUrl,
        hasResponse: true,
        status: response.status,
        safeMessage: "Invalid API response",
      });
    }

    return payload.values;
  } catch (error) {
    if (error instanceof ConnectSessionVerifyError) {
      throw error;
    }

    throw new ConnectSessionVerifyError({
      apiBaseUrl,
      hasResponse: false,
      status: null,
      safeMessage: "Network/CORS/fetch failure",
    });
  }
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
