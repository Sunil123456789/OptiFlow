import type { ComponentProps } from 'react';
import { UsersPage as UsersPageContainer } from '../features/users/containers/UsersPageContainer';

type UsersPageProps = ComponentProps<typeof UsersPageContainer>;

export function UsersPage(props: UsersPageProps) {
  return <UsersPageContainer {...props} />;
}

