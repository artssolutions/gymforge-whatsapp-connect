import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectSessionVerifyError,
  completeEmbeddedSignup,
  verifyConnectSession,
  type ConnectSessionVerifyDiagnostics,
} from "./api/gymforgeApi";
import type { SignupCredentials } from "./types/connectSession";
import type {
  FacebookSdk,
  MetaLoginResponse,
  WaEmbeddedSignupEvent,
} from "./types/meta";

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit: () => void;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

const META_APP_ID = "1546992120261415";
const META_CONFIG_ID = "1082377294178612";
const FACEBOOK_ORIGIN = "https://www.facebook.com";

type AppState =
  | "waiting"
  | "verifying"
  | "ready"
  | "connecting_meta"
  | "completing"
  | "success"
  | "error";

const STATUS_MESSAGES: Record<AppState, string> = {
  waiting: "Waiting for GymForge to start the WhatsApp connection...",
  verifying: "Verifying connection session...",
  ready: "Ready to connect",
  connecting_meta: "Connecting to Meta...",
  completing: "Completing WhatsApp setup...",
  success: "WhatsApp connected successfully",
  error: "Something went wrong.",
};

function parseMessageData(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  if (typeof data !== "string" || data.trim() === "") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function readStringField(
  source: Record<string, unknown>,
  key: string
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseSignupCredentials(
  event: WaEmbeddedSignupEvent
): SignupCredentials | null {
  const payload =
    event.data && typeof event.data === "object"
      ? event.data
      : (event as Record<string, unknown>);

  const wabaId =
    readStringField(payload, "waba_id") ?? readStringField(payload, "wabaId");
  const phoneNumberId =
    readStringField(payload, "phone_number_id") ??
    readStringField(payload, "phoneNumberId");
  const displayPhoneNumber =
    readStringField(payload, "display_phone_number") ??
    readStringField(payload, "displayPhoneNumber");

  if (!wabaId || !phoneNumberId) {
    return null;
  }

  return {
    wabaId,
    phoneNumberId,
    ...(displayPhoneNumber ? { displayPhoneNumber } : {}),
  };
}

function App() {
  const [appState, setAppState] = useState<AppState>("waiting");
  const [sdkReady, setSdkReady] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [verifyDiagnostics, setVerifyDiagnostics] =
    useState<ConnectSessionVerifyDiagnostics | null>(null);

  const connectTokenRef = useRef<string | null>(null);
  const authCodeRef = useRef<string | null>(null);
  const signupInfoRef = useRef<SignupCredentials | null>(null);
  const completingRef = useRef(false);

  const clearSensitiveRefs = useCallback(() => {
    connectTokenRef.current = null;
    authCodeRef.current = null;
    signupInfoRef.current = null;
    completingRef.current = false;
  }, []);

  const notifyNativeConnected = useCallback(() => {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: "GYMFORGE_WHATSAPP_CONNECTED" })
    );
  }, []);

  const tryCompleteSignup = useCallback(async () => {
    const connectToken = connectTokenRef.current;
    const code = authCodeRef.current;
    const signupInfo = signupInfoRef.current;

    if (!connectToken || !code || !signupInfo) {
      return;
    }

    if (completingRef.current) {
      return;
    }

    completingRef.current = true;
    setAppState("completing");
    setErrorMessage("");

    try {
      const result = await completeEmbeddedSignup(connectToken, {
        code,
        wabaId: signupInfo.wabaId,
        phoneNumberId: signupInfo.phoneNumberId,
        displayPhoneNumber: signupInfo.displayPhoneNumber,
      });

      setConnectedPhone(result.displayPhoneNumber || signupInfo.displayPhoneNumber || null);
      clearSensitiveRefs();
      setSessionVerified(false);
      setAppState("success");
      notifyNativeConnected();
    } catch {
      completingRef.current = false;
      authCodeRef.current = null;
      signupInfoRef.current = null;
      setAppState("error");
      setErrorMessage("WhatsApp connection failed. Please try again.");
    }
  }, [clearSensitiveRefs, notifyNativeConnected]);

  const verifyConnectToken = useCallback(
    async (connectToken: string) => {
      const trimmed = connectToken.trim();
      if (!trimmed) {
        return;
      }

      connectTokenRef.current = trimmed;
      authCodeRef.current = null;
      signupInfoRef.current = null;
      completingRef.current = false;
      setSessionVerified(false);
      setConnectedPhone(null);
      setErrorMessage("");
      setVerifyDiagnostics(null);
      setAppState("verifying");

      try {
        await verifyConnectSession(trimmed);
        setSessionVerified(true);
        setVerifyDiagnostics(null);
        setAppState("ready");
      } catch (error) {
        connectTokenRef.current = null;
        setSessionVerified(false);
        setAppState("error");
        setErrorMessage(
          "Unable to start WhatsApp connection. Please try again."
        );

        if (error instanceof ConnectSessionVerifyError) {
          setVerifyDiagnostics(error.diagnostics);
          console.error({
            stage: "connect-session-verify",
            apiBaseUrl: error.diagnostics.apiBaseUrl,
            status: error.diagnostics.status,
          });
        } else {
          setVerifyDiagnostics(null);
        }
      }
    },
    []
  );

  const handleGymforgeSessionMessage = useCallback(
    (event: MessageEvent) => {
      const data = parseMessageData(event.data);
      if (!data || data.type !== "GYMFORGE_CONNECT_SESSION") {
        return;
      }

      const connectToken = readStringField(data, "connectToken");
      if (!connectToken) {
        return;
      }

      void verifyConnectToken(connectToken);
    },
    [verifyConnectToken]
  );

  const handleFacebookMessage = useCallback(
    (event: MessageEvent) => {
      const data = parseMessageData(event.data) as WaEmbeddedSignupEvent | null;
      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      if (data.event === "CANCEL") {
        authCodeRef.current = null;
        signupInfoRef.current = null;
        completingRef.current = false;
        if (sessionVerified) {
          setAppState("ready");
        }
        return;
      }

      const credentials = parseSignupCredentials(data);
      if (!credentials) {
        return;
      }

      signupInfoRef.current = credentials;
      void tryCompleteSignup();
    },
    [sessionVerified, tryCompleteSignup]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === FACEBOOK_ORIGIN) {
        handleFacebookMessage(event);
        return;
      }

      handleGymforgeSessionMessage(event);
    };

    window.addEventListener("message", handleMessage);
    document.addEventListener("message", handleMessage as EventListener);

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v25.0",
      });

      setSdkReady(true);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("message", handleMessage as EventListener);
    };
  }, [handleFacebookMessage, handleGymforgeSessionMessage]);

  const launchWhatsAppSignup = () => {
    if (!window.FB || !sessionVerified || appState !== "ready") {
      return;
    }

    setErrorMessage("");
    setAppState("connecting_meta");

    window.FB.login(
      (response: MetaLoginResponse) => {
        if (response.status === "connected" && response.authResponse?.code) {
          authCodeRef.current = response.authResponse.code;
          void tryCompleteSignup();
          return;
        }

        authCodeRef.current = null;
        signupInfoRef.current = null;
        completingRef.current = false;
        setAppState("ready");
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
        },
      }
    );
  };

  const handleRetry = () => {
    authCodeRef.current = null;
    signupInfoRef.current = null;
    completingRef.current = false;
    setErrorMessage("");
    setVerifyDiagnostics(null);

    if (connectTokenRef.current && sessionVerified) {
      setAppState("ready");
      return;
    }

    connectTokenRef.current = null;
    setSessionVerified(false);
    setAppState("waiting");
  };

  const statusText =
    appState === "error" && errorMessage ? errorMessage : STATUS_MESSAGES[appState];

  const showContinueButton =
    appState === "ready" && sdkReady && sessionVerified;
  const showRetryButton = appState === "error";
  const isBusy =
    appState === "verifying" ||
    appState === "connecting_meta" ||
    appState === "completing";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fa",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "420px",
          padding: "32px",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1>GymForge</h1>

        <p>Connect your WhatsApp Business account</p>

        <p style={{ color: "#666", fontSize: "14px", minHeight: "40px" }}>
          {statusText}
        </p>

        {appState === "success" && connectedPhone ? (
          <p style={{ color: "#1b7f3a", fontSize: "14px" }}>
            Connected number: {connectedPhone}
          </p>
        ) : null}

        {appState === "verifying" || appState === "completing" ? (
          <p style={{ color: "#888", fontSize: "13px" }}>Please wait...</p>
        ) : null}

        {showContinueButton ? (
          <button
            type="button"
            onClick={launchWhatsAppSignup}
            disabled={isBusy}
            style={{
              marginTop: "20px",
              padding: "14px 24px",
              border: "none",
              borderRadius: "8px",
              background: "#1877f2",
              color: "#fff",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Continue with Meta
          </button>
        ) : null}

        {showRetryButton ? (
          <button
            type="button"
            onClick={handleRetry}
            style={{
              marginTop: "20px",
              padding: "14px 24px",
              border: "none",
              borderRadius: "8px",
              background: "#1877f2",
              color: "#fff",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        ) : null}

        {appState === "error" && verifyDiagnostics ? (
          <div
            style={{
              marginTop: "20px",
              padding: "12px",
              borderRadius: "8px",
              background: "#f1f1f1",
              textAlign: "left",
              fontSize: "12px",
              lineHeight: "1.5",
              color: "#444",
            }}
          >
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Diagnostics (temporary)</p>
            <p style={{ margin: 0 }}>API_BASE_URL: {verifyDiagnostics.apiBaseUrl}</p>
            <p style={{ margin: 0 }}>
              HTTP response received: {verifyDiagnostics.hasResponse ? "yes" : "no"}
            </p>
            {verifyDiagnostics.hasResponse && verifyDiagnostics.status !== null ? (
              <p style={{ margin: 0 }}>HTTP status: {verifyDiagnostics.status}</p>
            ) : null}
            <p style={{ margin: 0 }}>
              Detail:{" "}
              {verifyDiagnostics.hasResponse
                ? verifyDiagnostics.safeMessage
                : "Network/CORS/fetch failure"}
            </p>
          </div>
        ) : null}

      </div>
    </div>
  );
}

export default App;
