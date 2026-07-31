import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends invitations through the admin endpoint with a safe redirect', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'user-1', email: 'person@example.com' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const service = new SupabaseService();

    await service.inviteUser(
      'person@example.com',
      'https://app.example.com/accept-invite',
      { invited_role_label: 'Viewer' },
    );

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBeInstanceOf(URL);
    if (!(requestUrl instanceof URL))
      throw new Error('Expected a URL request.');
    expect(requestUrl.toString()).toBe(
      'https://project.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fapp.example.com%2Faccept-invite',
    );
    expect(requestInit?.headers).toMatchObject({
      apikey: 'server-secret',
      Authorization: 'Bearer server-secret',
    });
    expect(typeof requestInit?.body).toBe('string');
    if (typeof requestInit?.body !== 'string') {
      throw new Error('Expected a JSON request body.');
    }
    expect(JSON.parse(requestInit.body)).toEqual({
      email: 'person@example.com',
      data: { invited_role_label: 'Viewer' },
    });
  });
});
