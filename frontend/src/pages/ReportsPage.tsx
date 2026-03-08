import type { ComponentProps } from 'react';
import { ReportsPage as ReportsPageContainer } from '../features/reports/containers/ReportsPageContainer';

type ReportsPageProps = ComponentProps<typeof ReportsPageContainer>;

export function ReportsPage(props: ReportsPageProps) {
  return <ReportsPageContainer {...props} />;
}

