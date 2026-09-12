import { useEffect, useState } from "react";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

const META_APP_ID = "1546992120261415";
const META_CONFIG_ID = "1082377294178612";

function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState("Loading Meta SDK...");
  const [signupData, setSignupData] = useState<any>(null);

  useEffect(() => {
    // Listen for WhatsApp Embedded Signup events
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return;

      try {
        const data =
          typeof event.data === "string"
            ? JSON.parse(event.data)
            : event.data;

        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          console.log("WA_EMBEDDED_SIGNUP:", data);

          setSignupData(data);

          if (data.event === "FINISH") {
            setStatus("WhatsApp signup completed!");
          } else if (data.event === "CANCEL") {
            setStatus("WhatsApp signup cancelled.");
          } else {
            setStatus(`Signup event: ${data.event}`);
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    window.addEventListener("message", handleMessage);

    // Load Facebook JavaScript SDK
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v25.0",
      });

      setSdkReady(true);
      setStatus("Ready to connect WhatsApp");
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
    };
  }, []);

  const launchWhatsAppSignup = () => {
    if (!window.FB) {
      setStatus("Meta SDK is not ready.");
      return;
    }

    setStatus("Opening WhatsApp signup...");

    window.FB.login(
      (response: any) => {
        console.log("Meta login response:", response);

        if (response?.authResponse?.code) {
          console.log("Authorization code:", response.authResponse.code);
          setStatus("Authorization code received.");
        } else {
          setStatus("Signup was cancelled or did not complete.");
        }
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

        <p style={{ color: "#666", fontSize: "14px" }}>{status}</p>

        <button
          onClick={launchWhatsAppSignup}
          disabled={!sdkReady}
          style={{
            marginTop: "20px",
            padding: "14px 24px",
            border: "none",
            borderRadius: "8px",
            background: sdkReady ? "#1877f2" : "#aaa",
            color: "#fff",
            fontSize: "16px",
            cursor: sdkReady ? "pointer" : "not-allowed",
          }}
        >
          Continue with Meta
        </button>

        {signupData && (
          <pre
            style={{
              marginTop: "24px",
              padding: "12px",
              background: "#f1f1f1",
              borderRadius: "8px",
              textAlign: "left",
              fontSize: "12px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(signupData, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default App;