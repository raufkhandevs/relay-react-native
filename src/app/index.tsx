import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/** Entry route. Sends the user to the ticket list if signed in, otherwise to login. */
export default function Index() {
    const { token } = useAuth();
    return <Redirect href={token ? '/tickets' : '/login'} />;
}
