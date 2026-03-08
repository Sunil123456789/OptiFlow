import { canManageAssets, canManageUsers } from "./permissions";
import type { AuthUser } from "./types";

const BASE_TABS = ["Overview", "Alerts", "Machines", "Plans", "Work Orders", "Failure Logs", "Reports"] as const;
const ASSET_TABS = ["Spare Parts", "Plant Map"] as const;
const ADMIN_TABS = ["Users", "Audit Logs"] as const;

export type AppTab = (typeof BASE_TABS)[number] | (typeof ASSET_TABS)[number] | (typeof ADMIN_TABS)[number];

export function getVisibleTabs(currentUser: AuthUser): AppTab[] {
  return [
    ...BASE_TABS,
    ...(canManageAssets(currentUser) ? ASSET_TABS : []),
    ...(canManageUsers(currentUser) ? ADMIN_TABS : []),
  ];
}

export function getSafeActiveTab(activeTab: AppTab, currentUser: AuthUser): AppTab {
  if ((activeTab === "Users" || activeTab === "Audit Logs") && !canManageUsers(currentUser)) {
    return "Overview";
  }
  if (activeTab === "Plant Map" && !canManageAssets(currentUser)) {
    return "Overview";
  }
  return activeTab;
}
