import type { ReactNode } from "react";
import type { AuthUser } from "./types";
import type { AppTab } from "./navigation";
import { AlertsPage } from "../pages/AlertsPage";
import { AuditLogsPage } from "../pages/AuditLogsPage";
import { MachinesPage } from "../pages/MachinesPage";
import { OverviewPage } from "../pages/OverviewPage";
import { FailureLogsPage } from "../pages/FailureLogsPage";
import { PlantMapPage } from "../pages/PlantMapPage";
import { PlansPage } from "../pages/PlansPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SparePartsPage } from "../pages/SparePartsPage";
import { UsersPage } from "../pages/UsersPage";
import { WorkOrdersPage } from "../pages/WorkOrdersPage";

type SummaryState = {
  summary: Parameters<typeof OverviewPage>[0]["summary"];
  isLoading: boolean;
  error: string | null;
};

export type PageRenderContext = {
  activeTab: AppTab;
  currentUser: AuthUser;
  setOpenAlertCount: (value: number) => void;
  summaryState: SummaryState;
};

export function getPageByTab({ activeTab, currentUser, setOpenAlertCount, summaryState }: PageRenderContext): ReactNode {
  switch (activeTab) {
    case "Machines":
      return <MachinesPage currentUser={currentUser} />;
    case "Spare Parts":
      return <SparePartsPage currentUser={currentUser} />;
    case "Alerts":
      return <AlertsPage currentUser={currentUser} onAlertsChanged={setOpenAlertCount} />;
    case "Plans":
      return <PlansPage currentUser={currentUser} />;
    case "Work Orders":
      return <WorkOrdersPage currentUser={currentUser} />;
    case "Failure Logs":
      return <FailureLogsPage currentUser={currentUser} />;
    case "Reports":
      return <ReportsPage currentUser={currentUser} />;
    case "Plant Map":
      return <PlantMapPage currentUser={currentUser} />;
    case "Users":
      return <UsersPage currentUser={currentUser} />;
    case "Audit Logs":
      return <AuditLogsPage currentUser={currentUser} />;
    case "Overview":
    default:
      return <OverviewPage summary={summaryState.summary} isLoading={summaryState.isLoading} error={summaryState.error} />;
  }
}
