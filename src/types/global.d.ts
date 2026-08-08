export {};

declare global {
  interface Window {
    api: {
      invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<
        { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
      >;
      setToken: (token: string | null) => void;
      getToken: () => string | null;
    };
  }
}
