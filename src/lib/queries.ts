import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { Paginated, Ticket } from '../types/api';

export function useTickets() {
    return useQuery({
        queryKey: ['tickets'],
        queryFn: () => api.get<Paginated<Ticket>>('/tickets'),
    });
}
