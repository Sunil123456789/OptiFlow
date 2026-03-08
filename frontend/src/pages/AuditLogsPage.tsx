import type { ComponentProps } from 'react';
import { AuditLogsPage as AuditLogsPageContainer } from '../features/audit-logs/containers/AuditLogsPageContainer';

type AuditLogsPageProps = ComponentProps<typeof AuditLogsPageContainer>;

export function AuditLogsPage(props: AuditLogsPageProps) {
  return <AuditLogsPageContainer {...props} />;
}

