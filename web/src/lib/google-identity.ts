export type GoogleCodeClient = {
  requestCode: () => void;
};

export type GoogleAccountsOauth2 = {
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    ux_mode: "popup";
    callback: (response: { code?: string; error?: string }) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleCodeClient;
};

type GoogleAccountsHost = {
  accounts?: { oauth2?: GoogleAccountsOauth2 };
};

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_SCOPE = "openid email profile";

let gisLoader: Promise<GoogleAccountsOauth2> | null = null;

function googleAccounts(): GoogleAccountsOauth2 | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { google?: GoogleAccountsHost };
  return host.google?.accounts?.oauth2 ?? null;
}

export function loadGoogleIdentityServices(): Promise<GoogleAccountsOauth2> {
  const existing = googleAccounts();
  if (existing) return Promise.resolve(existing);
  if (gisLoader) return gisLoader;
  gisLoader = new Promise((resolve, reject) => {
    const ready = googleAccounts();
    if (ready) {
      resolve(ready);
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const oauth2 = googleAccounts();
      if (oauth2) resolve(oauth2);
      else reject(new Error("gis_load_failed"));
    };
    script.onerror = () => reject(new Error("gis_load_failed"));
    document.head.appendChild(script);
  });
  return gisLoader;
}

/** Popup GIS authorization code. Google uses redirect_uri=postmessage. */
export async function requestGoogleAuthorizationCode(clientId: string): Promise<string> {
  const oauth2 = await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const client = oauth2.initCodeClient({
      client_id: clientId,
      scope: GIS_SCOPE,
      ux_mode: "popup",
      callback: (response) => {
        const code = response.code?.trim() ?? "";
        if (code) {
          resolve(code);
          return;
        }
        reject(new Error(response.error || "google_popup_failed"));
      },
      error_callback: (error) => {
        const type = error.type ?? "";
        if (type === "popup_closed" || type === "popup_closed_by_user") {
          reject(new Error("access_denied"));
          return;
        }
        reject(new Error(error.message || type || "google_popup_failed"));
      },
    });
    client.requestCode();
  });
}
