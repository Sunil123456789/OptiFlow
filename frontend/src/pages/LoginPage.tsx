import type { ComponentProps } from 'react';
import { LoginPage as LoginPageContainer } from '../features/login/containers/LoginPageContainer';

type LoginPageProps = ComponentProps<typeof LoginPageContainer>;

export function LoginPage(props: LoginPageProps) {
  return <LoginPageContainer {...props} />;
}

