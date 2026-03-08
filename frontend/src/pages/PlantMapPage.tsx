import type { ComponentProps } from 'react';
import { PlantMapPage as PlantMapPageContainer } from '../features/plant-map/containers/PlantMapPageContainer';

type PlantMapPageProps = ComponentProps<typeof PlantMapPageContainer>;

export function PlantMapPage(props: PlantMapPageProps) {
  return <PlantMapPageContainer {...props} />;
}

