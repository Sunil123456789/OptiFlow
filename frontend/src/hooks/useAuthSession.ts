import { useEffect, useState } from "react";
import { clearSession, fetchMe, getStoredToken } from "../lib/api";
import type { AuthUser } from "../lib/types";

export function useAuthSession() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      const token = getStoredToken();
      if (!token) {
        if (mounted) {
          setCurrentUser(null);
          setIsAuthLoading(false);
        }
        return;
      }

      try {
        const user = await fetchMe();
        if (mounted) {
          setCurrentUser(user);
        }
      } catch {
        clearSession();
        if (mounted) {
          setCurrentUser(null);
        }
      } finally {
        if (mounted) {
          setIsAuthLoading(false);
        }
      }
    }

    bootstrapAuth();
    return () => {
      mounted = false;
    };
  }, []);

  return { currentUser, isAuthLoading, setCurrentUser };
}
