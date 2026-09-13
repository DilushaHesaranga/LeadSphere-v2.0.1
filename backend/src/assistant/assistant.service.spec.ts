import {
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { SupabaseService } from '../supabase/supabase.service';

const ticketId = '12345678-1234-1234-1234-123456789012';
const answer = { answer: 'Active ticket [S1]', sourceIds: ['S1'], email: null };
const providerResponse = (value = answer) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
    }),
  );

describe('AssistantService', () => {
  let service: AssistantService;
  let rpc: jest.Mock;
  const previous = {
    enabled: process.env.AI_ASSISTANT_ENABLED,
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  };
  beforeEach(() => {
    process.env.AI_ASSISTANT_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
    rpc = jest
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(
          name === 'get_crm_ticket'
            ? { id: ticketId, projectTitle: 'Website', status: 'active' }
            : [],
        ),
      );
    service = new AssistantService({
      userRpc: rpc,
    } as unknown as SupabaseService);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(() => {
    for (const [name, value] of Object.entries({
      AI_ASSISTANT_ENABLED: previous.enabled,
      OPENAI_API_KEY: previous.key,
      OPENAI_MODEL: previous.model,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  it('remains optional with disabled or missing configuration and makes no requests', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    process.env.AI_ASSISTANT_ENABLED = 'false';
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.AI_ASSISTANT_ENABLED = 'true';
    delete process.env.OPENAI_API_KEY;
    expect(service.status().available).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('never calls the model if ticket access is denied', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    rpc.mockRejectedValue(new ForbiddenException());
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses caller-scoped records, stateless requests and server-resolved sources', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(providerResponse());
    const result = await service.respond('user', 'caller-jwt', ticketId, {
      mode: 'summary',
      context: { secret: 'client-supplied' },
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'get_crm_ticket',
      { p_ticket_id: ticketId },
      'caller-jwt',
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'list_crm_follow_ups',
      expect.objectContaining({ p_ticket_id: ticketId }),
      'caller-jwt',
    );
    const init = fetchMock.mock.calls[0][1]!;
    if (typeof init.body !== 'string') throw new Error('Expected JSON body');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(init.body).not.toContain('client-supplied');
    expect(init.body).not.toContain('caller-jwt');
    expect(result.sources[0].tab).toBe('overview');
    expect(result.generatedAt).toBeTruthy();
  });
  it('returns a safe unavailable state on provider failure and permits retry', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('private provider detail'))
      .mockResolvedValueOnce(providerResponse());
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).rejects.toThrow('AI Assistant is temporarily unavailable');
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).resolves.toHaveProperty('answer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects incomplete model output', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'incomplete', output: [] })),
      );
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('limits per-user usage', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(providerResponse()));
    for (let i = 0; i < 20; i++)
      await service.respond('user', 'jwt', ticketId, { mode: 'summary' });
    await expect(
      service.respond('user', 'jwt', ticketId, { mode: 'summary' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(rpc).toHaveBeenCalledTimes(40);
  });
});
