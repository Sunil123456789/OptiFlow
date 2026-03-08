import type { ComponentProps } from 'react';
import { MachinesPage as MachinesPageContainer } from '../features/machines/containers/MachinesPageContainer';

type MachinesPageProps = ComponentProps<typeof MachinesPageContainer>;

export function MachinesPage(props: MachinesPageProps) {
  return <MachinesPageContainer {...props} />;
}

