import type { AuthUser } from "../lib/types";
import { canManageAssets, canManageUsers, roleLabel } from "../lib/permissions";

type HeaderProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentUser: AuthUser;
  onLogout: () => void;
  openAlertCount: number;
};

export function Header({ activeTab, onTabChange, currentUser, onLogout, openAlertCount }: HeaderProps) {
  const tabs = [
    "Overview",
    "Alerts",
    "Machines",
    "Plans",
    "Work Orders",
    "Failure Logs",
    ...(canManageAssets(currentUser) ? ["Plant Map"] : []),
    ...(canManageUsers(currentUser) ? ["Users", "Audit Logs"] : []),
  ];

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">OptiFlow</p>
        <h1>Maintenance Command Center</h1>
        <p className="user-chip">
          {currentUser.full_name} ({roleLabel(currentUser.role)})
        </p>
      </div>
      <div className="actions-wrap">
        <nav className="tabbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "tab active" : "tab"}
              onClick={() => onTabChange(tab)}
              type="button"
            >
              {tab}
              {tab === "Alerts" && openAlertCount > 0 && <span className="tab-badge">{openAlertCount}</span>}
            </button>
          ))}
        </nav>
        <button className="tab" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

