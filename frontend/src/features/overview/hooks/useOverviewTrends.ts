import { useEffect, useState } from "react";
import { fetchKpiTrends } from "../../../lib/api";
import type { KpiTrendPoint } from "../../../lib/types";

export function useOverviewTrends(days = 14) {
  const [trends, setTrends] = useState<KpiTrendPoint[]>([]);

  useEffect(() => {
    let mounted = true;

    fetchKpiTrends(days)
      .then((rows) => {
        if (mounted) {
          setTrends(rows);
        }
      })
      .catch(() => {
        if (mounted) {
          setTrends([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [days]);

  return { trends };
}
