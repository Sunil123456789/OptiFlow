import { useEffect, useState } from "react";
import { fetchAlerts } from "../lib/api";
import type { AuthUser } from "../lib/types";

export function useOpenAlertCount(currentUser: AuthUser | null) {
  const [openAlertCount, setOpenAlertCount] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setOpenAlertCount(0);
      return;
    }

    let mounted = true;

    async function loadOpenAlerts() {
      try {
        const rows = await fetchAlerts("open");
        if (mounted) {
          setOpenAlertCount(rows.length);
        }
      } catch {
        if (mounted) {
          setOpenAlertCount(0);
        }
      }
    }

    loadOpenAlerts();
    const timer = window.setInterval(loadOpenAlerts, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  return { openAlertCount, setOpenAlertCount };
}
