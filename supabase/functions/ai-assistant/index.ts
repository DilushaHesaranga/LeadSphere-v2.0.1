import { createAssistantHandler } from './handler.ts';

Deno.serve(createAssistantHandler({ env: (key) => Deno.env.get(key), fetch }));
