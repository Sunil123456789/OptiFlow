import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "../lib/api";
import type { AuthUser, DashboardSummary } from "../lib/types";

export function useDashboardSummary(currentUser: AuthUser | null) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setSummary(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function loadSummary() {
      try {
        setIsLoading(true);
        const data = await fetchDashboardSummary();
        if (mounted) {
          setSummary(data);
          setError(null);
        }
      } catch {
        if (mounted) {
          setError("Backend summary endpoint unavailable. Showing fallback values.");
          setSummary(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSummary();
    return () => {
      mounted = false;
    };
  }, [currentUser]);

  return { summary, isLoading, error, setSummary, setError };
}
