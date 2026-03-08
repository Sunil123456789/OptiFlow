import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { clearSession } from "./lib/api";
import { getSafeActiveTab, type AppTab } from "./lib/navigation";
import { getPageByTab } from "./lib/pageRegistry";
import type { AuthUser } from "./lib/types";
import { useAuthSession, useDashboardSummary, useOpenAlertCount } from "./hooks";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("Overview");
  const { currentUser, isAuthLoading, setCurrentUser } = useAuthSession();
  const { summary, isLoading, error, setSummary, setError } = useDashboardSummary(currentUser);
  const { openAlertCount, setOpenAlertCount } = useOpenAlertCount(currentUser);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const safeTab = getSafeActiveTab(activeTab, currentUser);
    if (safeTab !== activeTab) {
      setActiveTab(safeTab);
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

    return getPageByTab({
      activeTab,
      currentUser,
      setOpenAlertCount,
      summaryState: { summary, isLoading, error },
    });
  }, [activeTab, summary, isLoading, error, currentUser, setOpenAlertCount]);

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
