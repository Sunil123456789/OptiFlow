import type { ComponentProps } from 'react';
import { SparePartsPage as SparePartsPageContainer } from '../features/spare-parts/containers/SparePartsPageContainer';

type SparePartsPageProps = ComponentProps<typeof SparePartsPageContainer>;

export function SparePartsPage(props: SparePartsPageProps) {
  return <SparePartsPageContainer {...props} />;
}

