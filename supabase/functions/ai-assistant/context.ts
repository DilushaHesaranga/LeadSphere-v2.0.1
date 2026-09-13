// Framework-independent validation for the Supabase Edge runtime.
export class BadRequestException extends Error { status = 400; }

export type Mode = 'summary' | 'chat' | 'email';
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AssistantInput {
  mode: Mode;
  message: string;
  history: ChatMessage[];
}
export interface Source {
  id: string;
  label: string;
  tab: string;
  recordId?: string;
  excerpt: string;
}
export type Row = Record<string, unknown>;
export const asRow = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(asRow) : [];
const clip = (value: unknown, limit = 300): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';

export function validateInput(
  ticketId: string,
  value: unknown,
): AssistantInput {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      ticketId,
    )
  )
    throw new BadRequestException('Select a valid ticket.');
  const input = asRow(value);
  if (!['summary', 'chat', 'email'].includes(String(input.mode)))
    throw new BadRequestException('Select an assistant action.');
  if (
    input.message !== undefined &&
    (typeof input.message !== 'string' || input.message.length > 2000)
  )
    throw new BadRequestException('Messages must be 2000 characters or fewer.');
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (input.mode === 'chat' && !message)
    throw new BadRequestException('Enter a question about this ticket.');
  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > 8)
    throw new BadRequestException(
      'Start a new chat or send the latest eight messages.',
    );
  const checked = history.map((entry: unknown): ChatMessage => {
    const item = asRow(entry);
    if (
      !['user', 'assistant'].includes(String(item.role)) ||
      typeof item.content !== 'string' ||
      item.content.length > 6000
    )
      throw new BadRequestException('Invalid chat history.');
    return { role: item.role as ChatMessage['role'], content: item.content };
  });
  return { mode: input.mode as Mode, message, history: checked };
}

// Only allowlisted CRM fields leave the backend. Contact addresses and internal
// request metadata are deliberately excluded. Notes can still contain personal data.
export function buildContext(ticket: Row, followUps: unknown) {
  const sources: Source[] = [];
  const add = (
    tab: string,
    label: string,
    excerpt: string,
    recordId?: string,
  ) => {
    const source = {
      id: `S${sources.length + 1}`,
      tab,
      label,
      excerpt,
      ...(recordId ? { recordId } : {}),
    };
    sources.push(source);
    return source;
  };
  add(
    'overview',
    'Ticket overview',
    JSON.stringify({
      title: clip(ticket.projectTitle),
      company: clip(ticket.companyName),
      status: clip(ticket.status),
      stage: clip(ticket.stage),
      department: clip(ticket.currentDepartment),
      manager: clip(ticket.responsibleManagerName),
      assignedUsers: rows(ticket.assignedUsers)
        .slice(0, 20)
        .map((user) => clip(user.name)),
      updatedAt: clip(ticket.updatedAt),
    }),
  );
  const notes = rows(ticket.notes);
  notes
    .slice(0, 12)
    .forEach((note) =>
      add(
        'notes',
        `Note · ${clip(note.createdAt, 10)}`,
        `${clip(note.createdAt)}: ${clip(note.content, 1500)}`,
        clip(note.id),
      ),
    );
  const activity = rows(ticket.activity).filter(
    (item) => item.action !== 'STAGE_CHANGED',
  );
  activity
    .slice(0, 15)
    .forEach((item) =>
      add(
        'activity',
        `Activity · ${clip(item.action)}`,
        `${clip(item.createdAt)}: ${clip(item.action)} by ${clip(item.actorName)}`,
        clip(item.id),
      ),
    );
  const follows = rows(followUps);
  follows.slice(0, 20).forEach((item) =>
    add(
      'follow-ups',
      `${clip(item.type)} follow-up · ${clip(item.scheduledAt, 10)}`,
      JSON.stringify({
        type: clip(item.type),
        status: clip(item.status),
        scheduledAt: clip(item.scheduledAt),
        purpose: clip(item.purpose, 1000),
        frequency: clip(item.frequency),
      }),
      clip(item.id),
    ),
  );
  const limited =
    notes.length > 12 ||
    notes.some((note) => clip(note.content, 10000).length > 1500) ||
    activity.length > 15 ||
    follows.length > 20;
  return {
    sources,
    limited,
    scope:
      'Current ticket overview, up to 12 recent notes, 15 recent non-stage activities, and 20 follow-ups (pending first). Stage transition history, timeline communications and attachments are not included.',
  };
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    email: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: { subject: { type: 'string' }, body: { type: 'string' } },
          required: ['subject', 'body'],
        },
      ],
    },
  },
  required: ['answer', 'sourceIds', 'email'],
};

export function parseAnswer(value: unknown, sources: Source[], mode: Mode) {
  const output = asRow(value);
  if (
    typeof output.answer !== 'string' ||
    !output.answer.trim() ||
    output.answer.length > 6000 ||
    !Array.isArray(output.sourceIds) ||
    output.sourceIds.some(
      (id: unknown) =>
        typeof id !== 'string' || !sources.some((source) => source.id === id),
    )
  )
    throw new Error('Invalid assistant response');
  const citations = [...output.answer.matchAll(/\[(S\d+)\]/g)].map(
    (match) => match[1],
  );
  if (citations.some((id) => !(output.sourceIds as string[]).includes(id))) {
    throw new Error('Unknown citation');
  }
  const email = asRow(output.email);
  if (
    mode === 'email' &&
    (typeof email.subject !== 'string' ||
      !email.subject.trim() ||
      email.subject.length > 250 ||
      typeof email.body !== 'string' ||
      !email.body.trim() ||
      email.body.length > 6000)
  )
    throw new Error('Invalid email draft');
  return {
    answer: output.answer,
    sources: sources.filter((source) =>
      (output.sourceIds as string[]).includes(source.id),
    ),
    email:
      mode === 'email'
        ? { subject: email.subject as string, body: email.body as string }
        : null,
  };
}

