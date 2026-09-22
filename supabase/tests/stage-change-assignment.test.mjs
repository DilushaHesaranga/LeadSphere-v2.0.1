import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('stage permissions require current association regardless of creator or scope', async () => {
  const db = new PGlite();
  const actor = '00000000-0000-0000-0000-000000000001';
  const manager = '00000000-0000-0000-0000-000000000002';
  const ticket = '00000000-0000-0000-0000-000000000003';
  try {
    await db.exec(`create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create type public.data_access_scope as enum ('own','assigned','team','company');
      create function public.user_permission_scope(uuid,text) returns public.data_access_scope language sql stable as $$select nullif(current_setting('test.scope',true),'')::public.data_access_scope$$;
      create function public.crm_users_share_team(uuid,uuid) returns boolean language sql as $$select true$$;
      create table public.crm_tickets(id uuid,created_by_user_id uuid,responsible_manager_id uuid,deleted_at timestamptz);
      create table public.crm_ticket_assignments(ticket_id uuid,user_id uuid,removed_at timestamptz);
      insert into crm_tickets values('${ticket}','${actor}','${manager}',null);`);
    await db.exec(await readFile(new URL('../migrations/20260922000100_stage_change_assignment.sql',import.meta.url),'utf8'));
    const set = (key,value) => db.query('select set_config($1,$2,false)',[key,value]);
    const allowed = async permission => (await db.query('select crm_can_access_ticket($1,$2) allowed',[ticket,permission])).rows[0].allowed;
    await set('test.actor',actor);
    for (const scope of ['own','assigned','team','company']) {
      await set('test.scope',scope);
      for (const permission of ['deals.move_stage','leads.change_status']) {
        assert.equal(await allowed(permission),false,`unassigned creator denied with ${scope}`);
      }
    }
    assert.equal(await allowed('tickets.read'),true,'existing visibility preserved');
    await db.query('insert into crm_ticket_assignments values($1,$2,null)',[ticket,actor]);
    assert.equal(await allowed('deals.move_stage'),true,'active assignee allowed');
    await db.exec('update crm_ticket_assignments set removed_at=now()');
    assert.equal(await allowed('deals.move_stage'),false,'removed assignee denied');
    await set('test.actor',manager);
    assert.equal(await allowed('deals.move_stage'),true,'responsible manager allowed');
    await set('test.scope','');
    assert.equal(await allowed('deals.move_stage'),false,'association does not replace role permission');
    await set('test.scope','assigned');
    await set('test.actor','');
    assert.equal(await allowed('deals.move_stage'),false,'anonymous denied');
    await set('test.actor',manager);
    await db.exec('update crm_tickets set deleted_at=now()');
    assert.equal(await allowed('deals.move_stage'),false,'deleted ticket denied');
  } finally { await db.close(); }
});
