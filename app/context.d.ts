import type { SessionStorage } from '@remix-run/node';
import type { Authenticator } from 'remix-auth';

declare module '@remix-run/node' {
  interface AppLoadContext {
    auth: Authenticator<SessionUser>;
    sessionStorage: SessionStorage;
    fetch: typeof fetch;
  }
}

export type SessionUser = {
  id: number;
  username: string;
  token: string;
};

// Need this to let TS know we're augmenting @remix-run/node,
// rather than *defining* it.
export {};
