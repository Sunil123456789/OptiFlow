import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { clearSession, fetchAlerts, fetchDashboardSummary, fetchMe, getStoredToken } from "./lib/api";
import { canManageAssets, canManageUsers } from "./lib/permissions";
import type { AuthUser, DashboardSummary } from "./lib/types";
import { AlertsPage } from "./pages/AlertsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { LoginPage } from "./pages/LoginPage";
import { MachinesPage } from "./pages/MachinesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { FailureLogsPage } from "./pages/FailureLogsPage";
import { PlantMapPage } from "./pages/PlantMapPage";
import { PlansPage } from "./pages/PlansPage";
import { UsersPage } from "./pages/UsersPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";

export function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [openAlertCount, setOpenAlertCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!currentUser) {
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

  useEffect(() => {
    if ((activeTab === "Users" || activeTab === "Audit Logs") && currentUser && !canManageUsers(currentUser)) {
      setActiveTab("Overview");
    }
    if (activeTab === "Plant Map" && currentUser && !canManageAssets(currentUser)) {
      setActiveTab("Overview");
    }
  }, [activeTab, currentUser]);

  function handleLoggedIn(user: AuthUser) {
    setCurrentUser(user);
    setActiveTab("Overview");
  }

  function handleLogout() {
    clearSession();
    setCurrentUser(null);
    setSummary(null);
    setOpenAlertCount(0);
    setError(null);
    setActiveTab("Overview");
  }

  const page = useMemo(() => {
    if (!currentUser) {
      return null;
    }

    if (activeTab === "Machines") {
      return <MachinesPage currentUser={currentUser} />;
    }
    if (activeTab === "Alerts") {
      return <AlertsPage currentUser={currentUser} onAlertsChanged={setOpenAlertCount} />;
    }
    if (activeTab === "Plans") {
      return <PlansPage currentUser={currentUser} />;
    }
    if (activeTab === "Work Orders") {
      return <WorkOrdersPage currentUser={currentUser} />;
    }
    if (activeTab === "Failure Logs") {
      return <FailureLogsPage currentUser={currentUser} />;
    }
    if (activeTab === "Plant Map") {
      return <PlantMapPage currentUser={currentUser} />;
    }
    if (activeTab === "Users") {
      return <UsersPage currentUser={currentUser} />;
    }
    if (activeTab === "Audit Logs") {
      return <AuditLogsPage currentUser={currentUser} />;
    }

    return <OverviewPage summary={summary} isLoading={isLoading} error={error} />;
  }, [activeTab, summary, isLoading, error, currentUser]);

  if (isAuthLoading) {
    return (
      <div className="app-shell">
        <div className="bg-grid" />
        <div className="bg-glow" />
        <main className="layout">
          <p className="state-note">Checking session...</p>
        </main>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-shell">
        <div className="bg-grid" />
        <div className="bg-glow" />
        <main className="layout">
          <LoginPage onLoggedIn={handleLoggedIn} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="bg-grid" />
      <div className="bg-glow" />
      <main className="layout">
        <Header
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          openAlertCount={openAlertCount}
        />
        {page}
      </main>
    </div>
  );
}
