export type Role = 'customer' | 'agent';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

/** Nested in tickets and messages. Deliberately has no email. */
export type Participant = {
    id: number;
    name: string;
    role: Role;
};

/** Only returned for the signed-in user, from /api/me and the login response. */
export type User = Participant & { email: string };

export type Ticket = {
    id: number;
    subject: string;
    status: TicketStatus;
    customer: Participant;
    assigned_agent: Participant | null;
    last_message_at: string | null;
    created_at: string;
};

export type Attachment = {
    id: number;
    original_name: string;
    mime: string;
    size_bytes: number;
    created_at: string;
};

export type Message = {
    id: number;
    ticket_id: number;
    body: string;
    author: Participant;
    attachments: Attachment[];
    created_at: string;
};

/** Laravel's offset paginator. No meta wrapper. */
export type Paginated<T> = {
    data: T[];
    current_page: number;
    per_page: number;
    total: number;
};

/** Laravel's cursor paginator. No meta wrapper. */
export type CursorPaginated<T> = {
    data: T[];
    next_cursor: string | null;
    prev_cursor: string | null;
};
