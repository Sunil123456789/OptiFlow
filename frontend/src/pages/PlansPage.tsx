import type { ComponentProps } from 'react';
import { PlansPage as PlansPageContainer } from '../features/plans/containers/PlansPageContainer';

type PlansPageProps = ComponentProps<typeof PlansPageContainer>;

export function PlansPage(props: PlansPageProps) {
  return <PlansPageContainer {...props} />;
}

