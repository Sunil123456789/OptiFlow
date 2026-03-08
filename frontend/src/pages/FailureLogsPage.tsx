import type { ComponentProps } from 'react';
import { FailureLogsPage as FailureLogsPageContainer } from '../features/failure-logs/containers/FailureLogsPageContainer';

type FailureLogsPageProps = ComponentProps<typeof FailureLogsPageContainer>;

export function FailureLogsPage(props: FailureLogsPageProps) {
  return <FailureLogsPageContainer {...props} />;
}

