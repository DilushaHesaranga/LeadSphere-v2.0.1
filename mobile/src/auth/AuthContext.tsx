import type { Session } from "@supabase/supabase-js";
import { AppState, Linking, type AppStateStatus } from "react-native";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { decideMobileAccess } from "@/authorization/mobileAccess";
import { can, getScope, hasRole } from "@/authorization/policy";
import { env } from "@/config/env";
import { apiRequest } from "@/services/api";
import { parseAuthLink } from "@/services/authLinks";
import { supabase } from "@/services/supabase";
import type { DataAccessScope, UserAuthorization } from "@/types/authorization";
import { EMPTY_AUTHORIZATION } from "@/types/authorization";
import { friendlyAuthError, friendlyRequestError } from "@/utils/errors";

export type AuthStatus =
  | "restoring"
  | "signedOut"
  | "loadingAccess"
  | "ready"
  | "unsupportedRole"
  | "disabled"
  | "accessError"
  | "passwordRecovery";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  authorization: UserAuthorization;
  message: string;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordRecovery(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refreshAccess(): Promise<void>;
  can(permission: string, minimumScope?: DataAccessScope): boolean;
  hasRole(role: string): boolean;
  getScope(permission: string): DataAccessScope | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [session, setSession] = useState<Session | null>(null);
  const [authorization, setAuthorization] =
    useState<UserAuthorization>(EMPTY_AUTHORIZATION);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const recoveryMode = useRef(false);

  const loadAuthorization = useCallback(async (nextSession: Session) => {
    if (mounted.current) {
      setStatus("loadingAccess");
      setMessage("");
    }
    try {
      const access = await apiRequest<UserAuthorization>("/authorization/me", {
        accessToken: nextSession.access_token,
      });
      if (!mounted.current) return;
      setAuthorization(access);
      const decision = decideMobileAccess(access);
      if (recoveryMode.current) {
        setStatus("passwordRecovery");
      } else if (decision === "allowed") {
        setStatus("ready");
      } else if (decision === "disabled") {
        setStatus("disabled");
      } else if (decision === "unsupported-role") {
        setStatus("unsupportedRole");
      } else {
        setMessage("Your account does not have mobile console access.");
        setStatus("accessError");
      }
    } catch (error) {
      if (!mounted.current) return;
      setAuthorization(EMPTY_AUTHORIZATION);
      setMessage(friendlyRequestError(error));
      setStatus("accessError");
    }
  }, []);

  const processAuthLink = useCallback(async (url: string) => {
    try {
      const payload = parseAuthLink(url);
      if (payload.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          payload.code,
        );
        if (error) throw error;
      } else if (payload.accessToken && payload.refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });
        if (error) throw error;
      }
      if (payload.isRecovery && mounted.current) {
        recoveryMode.current = true;
        setStatus("passwordRecovery");
      }
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        friendlyAuthError(error instanceof Error ? error.message : ""),
      );
      setStatus("signedOut");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const bootstrap = async () => {
      const initialUrl = await Linking.getInitialURL();
      const { data, error } = await supabase.auth.getSession();
      if (!mounted.current) return;
      if (error) {
        setMessage("Your saved session could not be restored. Sign in again.");
        setStatus("signedOut");
      } else {
        setSession(data.session);
        if (data.session) await loadAuthorization(data.session);
        else setStatus("signedOut");
      }
      if (initialUrl) await processAuthLink(initialUrl);
    };

    void bootstrap();

    const authSubscription = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        if (event === "PASSWORD_RECOVERY") {
          recoveryMode.current = true;
          setStatus("passwordRecovery");
          return;
        }
        if (!nextSession) {
          recoveryMode.current = false;
          setAuthorization(EMPTY_AUTHORIZATION);
          setStatus("signedOut");
          return;
        }
        void loadAuthorization(nextSession);
      },
    );

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void processAuthLink(url);
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
      },
    );

    return () => {
      mounted.current = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [loadAuthorization, processAuthLink]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setMessage("");
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      if (!data.session) throw new Error("A session could not be created.");
      setSession(data.session);
      await loadAuthorization(data.session);
    },
    [loadAuthorization],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("Sign out could not be completed.");
    recoveryMode.current = false;
    setSession(null);
    setAuthorization(EMPTY_AUTHORIZATION);
    setMessage("");
    setStatus("signedOut");
  }, []);

  const sendPasswordRecovery = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: env.authRedirectUrl,
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const updatePassword = useCallback(
    async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(friendlyAuthError(error.message));
      recoveryMode.current = false;
      const { data } = await supabase.auth.getSession();
      if (data.session) await loadAuthorization(data.session);
      else setStatus("signedOut");
    },
    [loadAuthorization],
  );

  const refreshAccess = useCallback(async () => {
    if (!session) {
      setStatus("signedOut");
      return;
    }
    await loadAuthorization(session);
  }, [loadAuthorization, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      authorization,
      message,
      signIn,
      signOut,
      sendPasswordRecovery,
      updatePassword,
      refreshAccess,
      can: (permission, minimumScope = "own") =>
        can(authorization.permissions, permission, minimumScope),
      hasRole: (role) => hasRole(authorization.roles, role),
      getScope: (permission) => getScope(authorization.permissions, permission),
    }),
    [
      authorization,
      message,
      refreshAccess,
      sendPasswordRecovery,
      session,
      signIn,
      signOut,
      status,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
