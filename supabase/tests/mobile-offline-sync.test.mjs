import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const actor=id(1), other=id(2), ticket=id(3);
function fn(source,name) { const start=source.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf('$$;',source.indexOf('as $$',start))+3); }
async function call(op,payload,key=id(50),expected=null,series=null) {
  return (await db.query('select public.sync_crm_mobile_mutation($1,$2,$3::jsonb,$4::timestamptz,$5::timestamptz) as result',[key,op,JSON.stringify(payload),expected,series])).rows[0].result;
}
const createPayload=()=>({p_ticket_id:ticket,p_scheduled_at:new Date(Date.now()+86400000).toISOString(),p_type:'CALL',p_purpose:'Offline proposal discussion',p_recurring:false,p_frequency:null});
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key); insert into auth.users values('${actor}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;
 create table public.profiles(id uuid primary key,status text); insert into profiles values('${actor}','active'),('${other}','active');
 create table public.crm_tickets(id uuid primary key,responsible_manager_id uuid,status text,deleted_at timestamptz);
 insert into crm_tickets values('${ticket}','${actor}','active',null);
 create table public.crm_ticket_assignments(ticket_id uuid,user_id uuid,removed_at timestamptz);
 create table public.crm_ticket_activity(id uuid default gen_random_uuid(),ticket_id uuid,action text,actor_user_id uuid,details jsonb);
 create table public.crm_ticket_notes(id uuid default gen_random_uuid(),ticket_id uuid,content text,created_by_user_id uuid);
 create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end;$$;
 create function public.crm_can_access_ticket(t uuid,p text) returns boolean language sql stable as $$select exists(select 1 from public.crm_tickets where id=t and responsible_manager_id=auth.uid() and deleted_at is null)$$;
 create function public.crm_user_has_role(u uuid,r text[]) returns boolean language sql stable as $$select u='${actor}'::uuid$$;
 `);
 const follow=await read('20260806000100_follow_ups.sql');
 await db.exec(follow.slice(0,follow.indexOf('create or replace function public.crm_next_follow_up_at')));
 for(const name of ['crm_next_follow_up_at','crm_validate_follow_up_input','update_crm_follow_up','complete_crm_follow_up','cancel_crm_follow_up','stop_crm_follow_up_series']) await db.exec(fn(follow,name));
 await db.exec(fn(await read('20260905000100_follow_up_creation_authorization.sql'),'create_crm_follow_up'));
 await db.exec(fn(await read('20260803000100_case_ticket_management.sql'),'add_crm_ticket_note'));
 await db.exec(await read('20260920000200_mobile_offline_sync.sql'));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
});
after(()=>db.close());
test('append creation and replay return one durable server record',async()=>{
 const payload=createPayload();const first=await call('create_crm_follow_up',payload);
 const repeated=await Promise.all([call('create_crm_follow_up',payload),call('create_crm_follow_up',payload)]);
 assert.equal(repeated[0].id,first.id);assert.equal(repeated[1].id,first.id);
 assert.equal((await db.query('select count(*)::int n from crm_follow_up_occurrences')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from crm_mobile_mutations')).rows[0].n,1);
 await assert.rejects(call('create_crm_follow_up',{...payload,p_purpose:'Different payload'}),/CONFLICT/);
});
test('append notes cannot duplicate after a lost response',async()=>{
 const payload={p_ticket_id:ticket,p_content:'Offline customer call'};
 const a=await call('add_crm_ticket_note',payload,id(51));const b=await call('add_crm_ticket_note',payload,id(51));assert.equal(a.id,b.id);
 assert.equal((await db.query('select count(*)::int n from crm_ticket_notes')).rows[0].n,1);
});
test('mutable follow-up updates reject a stale version without overwriting',async()=>{
 const created=await call('create_crm_follow_up',createPayload(),id(52));
 const old=(await db.query('select updated_at::text version from crm_follow_up_occurrences where id=$1',[created.id])).rows[0].version;
 const payload={p_follow_up_id:created.id,p_scheduled_at:new Date(Date.now()+172800000).toISOString(),p_type:'MEETING',p_purpose:'Server accepted change',p_frequency:null};
 await call('update_crm_follow_up',payload,id(53),old);
 await assert.rejects(call('update_crm_follow_up',{...payload,p_purpose:'Stale overwrite'},id(54),old),/CONFLICT/);
 assert.equal((await db.query('select purpose from crm_follow_up_occurrences where id=$1',[created.id])).rows[0].purpose,'Server accepted change');
 assert.equal((await db.query('select count(*)::int n from crm_mobile_mutations where mutation_id=$1',[id(54)])).rows[0].n,0);
});
test('recurring completion retries produce one next occurrence',async()=>{
 const created=await call('create_crm_follow_up',{...createPayload(),p_recurring:true,p_frequency:'WEEKLY'},id(55));
 const versions=(await db.query('select o.updated_at::text ov,s.updated_at::text sv from crm_follow_up_occurrences o join crm_follow_up_series s on s.id=o.series_id where o.id=$1',[created.id])).rows[0];
 const payload={p_follow_up_id:created.id};
 const a=await call('complete_crm_follow_up',payload,id(56),versions.ov,versions.sv);
 const b=await call('complete_crm_follow_up',payload,id(56),versions.ov,versions.sv);
 assert.ok(a.nextFollowUpId);assert.equal(a.nextFollowUpId,b.nextFollowUpId);
 assert.equal((await db.query('select count(*)::int n from crm_follow_up_occurrences where series_id=$1',[created.seriesId])).rows[0].n,2);
});
test('server permission removal rejects the operation and leaves no receipt',async()=>{
 await db.exec(`update crm_tickets set responsible_manager_id='${other}' where id='${ticket}'`);
 await assert.rejects(call('add_crm_ticket_note',{p_ticket_id:ticket,p_content:'No longer assigned'},id(57)),/Permission denied/);
 await assert.rejects(call('create_crm_follow_up',createPayload(),id(58)),/not assigned/);
 await db.exec(`update crm_tickets set responsible_manager_id='${actor}' where id='${ticket}'`);
});
test('unauthenticated and disabled users cannot synchronize',async()=>{
 await db.exec("select set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(call('create_crm_follow_up',createPayload(),id(59)),/Authentication required/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await db.exec(`update profiles set status='disabled' where id='${actor}'`);
 await assert.rejects(call('create_crm_follow_up',createPayload(),id(59)),/account is disabled/);
 await db.exec(`update profiles set status='active' where id='${actor}'`);
});
test('database roles cannot access the receipt table or forge another user',async()=>{
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from public.crm_mobile_mutations'),/permission denied/);
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
 await assert.rejects(call('create_crm_follow_up',createPayload(),id(60)),/not assigned/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
});
