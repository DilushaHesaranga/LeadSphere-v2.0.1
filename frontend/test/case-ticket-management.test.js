import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canSelectInitialDepartment,
  contactMethods,
  getDefaultDepartment,
  normalizePhone,
  shouldShowContactPicker,
  ticketBusinessArea,
  validateCase,
  validateTicket,
} from '../src/config/crm.js'

const migration = await readFile(new URL('../../supabase/migrations/20260803000100_case_ticket_management.sql', import.meta.url), 'utf8')
const visibilityMigration = await readFile(new URL('../../supabase/migrations/20260803000300_global_visibility_and_deletion_approval.sql', import.meta.url), 'utf8')
const multiAssigneeMigration = await readFile(new URL('../../supabase/migrations/20260803000400_multi_assignee_ticket_creation.sql', import.meta.url), 'utf8')
const managerWorkflowMigration = await readFile(new URL('../../supabase/migrations/20260804000100_responsible_manager_workflow.sql', import.meta.url), 'utf8')
const selfAssignmentMigration = await readFile(new URL('../../supabase/migrations/20260805000100_allow_unassigned_self_assignment.sql', import.meta.url), 'utf8')
const pipelineStageMigration = await readFile(new URL('../../supabase/migrations/20260805000200_sales_pipeline_stages.sql', import.meta.url), 'utf8')
const assignmentManagementMigration = await readFile(new URL('../../supabase/migrations/20260805000300_manage_ticket_assignees.sql', import.meta.url), 'utf8')
const creationFlow = await readFile(new URL('../src/components/TicketCreationFlow.jsx', import.meta.url), 'utf8')
const caseTicketService = await readFile(new URL('../src/services/caseTicketService.js', import.meta.url), 'utf8')
const ticketPage = await readFile(new URL('../src/pages/TicketDetailPage.jsx', import.meta.url), 'utf8')
const casePage = await readFile(new URL('../src/pages/CaseWorkspacePage.jsx', import.meta.url), 'utf8')
const permissionsPage = await readFile(new URL('../src/pages/PermissionsPage.jsx', import.meta.url), 'utf8')
const assigneeManagerDialog = await readFile(new URL('../src/components/AssigneeManagerDialog.jsx', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('1. one Case can contain multiple Tickets', () => {
  assert.match(migration, /case_id uuid not null references public\.crm_cases\(id\) on delete restrict/)
  assert.equal(migration.includes('unique (case_id)'), false)
})

test('2. one Ticket has exactly one Case relationship', () => {
  assert.match(migration, /case_id uuid not null/)
  assert.equal(migration.includes('case_ids'), false)
})

test('3. Marketing users receive Marketing as the default department', () => {
  assert.equal(getDefaultDepartment([{ slug: 'marketing_executive' }]), 'marketing')
})

test('4. Sales users receive Sales as the default department', () => {
  assert.equal(getDefaultDepartment([{ slug: 'sales_executive' }]), 'sales')
  assert.equal(getDefaultDepartment([{ slug: 'sales_manager' }]), 'sales')
})

test('5. cross-department managers can select an initial department', () => {
  assert.equal(canSelectInitialDepartment([{ slug: 'marketing_manager' }]), true)
  assert.equal(canSelectInitialDepartment([{ slug: 'leadership' }]), true)
  assert.equal(canSelectInitialDepartment([{ slug: 'sales_executive' }]), false)
})

test('6. pre-order pipeline stages appear in Leads', () => {
  for (const stage of ['qualification', 'proposal_or_price_quote', 'negotiation']) assert.equal(ticketBusinessArea(stage), 'leads')
})

test('7. Sales Order converts the lead into customer work', () => {
  for (const stage of ['sales_order', 'payment', 'close_won', 'lost']) assert.equal(ticketBusinessArea(stage), 'customers')
  assert.match(pipelineStageMigration, /'sales_order', 'Sales Order', 'customers'/)
})

test('8. creating under an existing Case skips the Case form', () => {
  assert.match(creationFlow, /useState\(fixedCase \? 'ticket' : 'choice'\)/)
  assert.match(casePage, /fixedCase=\{creation\.id \? creation : null\}/)
})

test('9. multiple contacts remain tied to their Ticket', () => {
  assert.match(migration, /crm_ticket_contacts[\s\S]*ticket_id uuid not null references public\.crm_tickets\(id\) on delete cascade/)
  assert.match(migration, /crm_ticket_contacts_ticket_idx/)
})

test('10. Email selection appears only for multiple emails', () => {
  const contacts = [{ id: '1', name: 'A', email: 'a@example.com' }, { id: '2', name: 'B', email: 'b@example.com' }]
  assert.equal(shouldShowContactPicker(contacts, 'email'), true)
  assert.deepEqual(contactMethods(contacts.slice(0, 1), 'email').map((item) => item.name), ['A'])
})

test('11. Call selection appears only for multiple phone numbers', () => {
  const contacts = [{ id: '1', name: 'A', phoneNumber: '+94111' }, { id: '2', name: 'B', phoneNumber: '+94222' }]
  assert.equal(shouldShowContactPicker(contacts, 'phone'), true)
  assert.equal(normalizePhone(' +94 77 123 4567 '), '+94771234567')
})

test('12. Assign to Me creates a pending request without immediate assignment', () => {
  const body = migration.match(/create or replace function public\.request_crm_ticket_assignment[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(body, /'ASSIGN_TO_ME'/)
  assert.match(body, /'PENDING'/)
  assert.equal(body.includes('insert into public.crm_ticket_assignments'), false)
})

test('13. Post Ticket creates a pending request without changing department', () => {
  const body = migration.match(/create or replace function public\.request_crm_ticket_post[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(body, /'POST_TICKET'/)
  assert.match(body, /'PENDING'/)
  assert.equal(body.includes('update public.crm_tickets set current_department'), false)
})

test('14. managers can atomically accept a request', () => {
  assert.match(migration, /decision not in \('APPROVED','REJECTED','MODIFIED'\)/)
  assert.match(permissionsPage, />Accept</)
})

test('15. managers can reject a request without applying a change', () => {
  assert.match(migration, /decision in \('APPROVED','MODIFIED'\)/)
  assert.match(permissionsPage, />Reject</)
})

test('16. managers can modify assignment or destination', () => {
  assert.match(migration, /originalAssigneeId/)
  assert.match(migration, /originalDepartment/)
  assert.match(permissionsPage, />Modify</)
})

test('17. the Permissions route and navigation require review permission', () => {
  assert.match(consolePage, /permission: PERMISSIONS\.TICKET_REQUESTS_REVIEW/)
  assert.match(migration, /scope := public\.current_user_permission_scope\('tickets\.requests\.review'\)/)
})

test('18. ordinary executives cannot close Tickets', () => {
  assert.equal(migration.includes("('sales_executive', 'tickets.close'"), false)
  assert.equal(migration.includes("('marketing_executive', 'tickets.close'"), false)
})

test('19. closing preserves the Ticket record', () => {
  const body = migration.match(/create or replace function public\.close_crm_ticket[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(body, /set status = 'closed'/)
  assert.equal(/delete from public\.crm_tickets/.test(body), false)
})

test('20. duplicate pending requests are prevented at database level', () => {
  assert.match(migration, /crm_ticket_requests_one_pending_assignment/)
  assert.match(migration, /crm_ticket_requests_one_pending_transfer/)
})

test('21. Delete Case requires a manager request and cannot silently remove Tickets', () => {
  assert.match(casePage, /<DeletionRequestDialog kind="case"/)
  assert.match(visibilityMigration, /Archive every Ticket through manager approval before requesting Case deletion/)
})

test('22. required Case, Ticket, and contact validation works', () => {
  assert.ok(validateCase('').companyName)
  const errors = validateTicket({ caseId: '', projectTitle: '', currentDepartment: '', stage: '', responsibleManagerId: '', contacts: [{ name: '', email: '', phoneNumber: '' }] })
  for (const key of ['caseId', 'projectTitle', 'currentDepartment', 'stage', 'responsibleManagerId', 'contactRows']) assert.ok(errors[key])
})

test('23. Ticket actions and forms adapt at mobile width', () => {
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.ticket-primary-actions/)
  assert.match(styles, /\.contact-form-row[\s\S]*grid-template-columns:1fr/)
  assert.match(ticketPage, /Email/)
  assert.match(ticketPage, /Call/)
})

test('24. every business role receives company-wide Case and Ticket visibility', () => {
  assert.match(visibilityMigration, /permission\.slug = any\(array\['cases\.read', 'tickets\.read'\]\)/)
  for (const role of ['marketing_executive', 'sales_executive', 'sales_manager', 'delivery_manager', 'leadership', 'viewer']) {
    assert.ok(visibilityMigration.includes(`'${role}'`))
  }
  assert.match(visibilityMigration, /'company'::public\.data_access_scope/)
})

test('25. deletion requests remain pending and cannot call direct archive RPCs', () => {
  const ticketRequest = visibilityMigration.match(/create or replace function public\.request_crm_ticket_deletion[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  const caseRequest = visibilityMigration.match(/create or replace function public\.request_crm_case_deletion[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(ticketRequest, /'DELETE_TICKET'/)
  assert.match(caseRequest, /'DELETE_CASE'/)
  assert.equal(ticketRequest.includes("set status = 'archived'"), false)
  assert.equal(caseRequest.includes('set deleted_at = now()'), false)
  assert.match(visibilityMigration, /revoke execute on function public\.archive_crm_ticket\(uuid\) from authenticated/)
  assert.match(visibilityMigration, /revoke execute on function public\.archive_crm_case\(uuid\) from authenticated/)
})

test('26. manager approval atomically archives deletion requests', () => {
  const review = visibilityMigration.match(/create or replace function public\.review_crm_ticket_request[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(review, /request_record\.request_type = 'DELETE_TICKET'/)
  assert.match(review, /status = 'archived', deleted_at = now\(\), deleted_by_user_id = actor/)
  assert.match(review, /request_record\.request_type = 'DELETE_CASE'/)
  assert.match(review, /update public\.crm_ticket_permission_requests set[\s\S]*status = decision/)
})

test('27. company-wide Ticket visibility does not expose the manager review queue', () => {
  const policy = visibilityMigration.match(/create policy crm_requests_read[\s\S]*?\n\);/)?.[0] ?? ''
  assert.match(policy, /requested_by_user_id = \(select auth\.uid\(\)\)/)
  assert.match(policy, /current_user_has_permission\('tickets\.requests\.review'\)/)
  assert.equal(policy.includes("crm_can_access_ticket(ticket_id, 'tickets.read')"), false)
})

test('28. one Ticket supports multiple simultaneous assignees', () => {
  assert.match(migration, /primary key \(ticket_id, user_id\)/)
  assert.match(multiAssigneeMigration, /from unnest\(distinct_ids\) as selected\(user_id\)/)
  assert.match(multiAssigneeMigration, /on conflict \(ticket_id, user_id\) do update/)
  assert.equal(multiAssigneeMigration.includes('delete from public.crm_ticket_assignments'), false)
})

test('29. managers can select multiple assignees while creating a Ticket', () => {
  assert.match(creationFlow, /assigneeIds: \[\]/)
  assert.match(creationFlow, /type="checkbox"/)
  assert.match(creationFlow, /can\(PERMISSIONS\.TICKET_REQUESTS_REVIEW\)/)
  assert.match(caseTicketService, /p_assignee_ids: input\.assigneeIds \?\? \[\]/)
  assert.match(caseTicketService, /create_crm_ticket_with_assignees/)
})

test('30. all managerial roles can create Cases and Tickets', () => {
  for (const role of ['sales_manager', 'marketing_manager', 'leadership']) {
    assert.ok(migration.includes(`('${role}', 'cases.create'`))
    assert.ok(migration.includes(`('${role}', 'tickets.create'`))
  }
  assert.match(multiAssigneeMigration, /role\.slug = 'delivery_manager'/)
  assert.match(multiAssigneeMigration, /array\['cases\.create', 'tickets\.create'\]/)
  assert.match(migration, /r\.slug = 'system_admin'[\s\S]*p\.slug like any \(array\['cases\.%', 'tickets\.%'\]\)/)
})

test('31. only Sales and Delivery Managers are eligible responsible managers', () => {
  assert.match(managerWorkflowMigration, /role\.slug = any\(array\['sales_manager', 'delivery_manager'\]\)/)
  const managerList = managerWorkflowMigration.match(/'managers',[\s\S]*?\) eligible_managers\)/)?.[0] ?? ''
  assert.match(managerList, /array\['sales_manager', 'delivery_manager'\]/)
  assert.doesNotMatch(managerList, /marketing_manager|leadership|system_admin/)
})

test('32. Sales and Delivery require their matching manager role', () => {
  assert.match(managerWorkflowMigration, /when p_department = 'sales' then 'sales_manager'/)
  assert.match(managerWorkflowMigration, /when p_department = 'delivery' then 'delivery_manager'/)
})

test('33. missing or ambiguous managers produce clear validation errors', () => {
  assert.match(managerWorkflowMigration, /No eligible % is configured/)
  assert.match(managerWorkflowMigration, /Select a responsible %/)
})

test('34. invalid historical department-manager mappings are ignored and removed', () => {
  assert.match(managerWorkflowMigration, /delete from public\.crm_department_managers/)
  assert.match(managerWorkflowMigration, /not public\.crm_is_eligible_responsible_manager/)
})

test('35. department transfers do not change the pipeline stage or convert a lead', () => {
  const transfer = pipelineStageMigration.match(/create or replace function public\.crm_apply_ticket_transfer[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  const ticketUpdate = transfer.match(/update public\.crm_tickets set[\s\S]*?where id = p_ticket_id/)?.[0] ?? ''
  assert.match(transfer, /'stage', ticket_record\.stage/)
  assert.doesNotMatch(transfer, /destination_stage/)
  assert.doesNotMatch(ticketUpdate, /stage\s*=/)
})

test('36. transfer updates the same Ticket and preserves its relationships', () => {
  const transfer = pipelineStageMigration.match(/create or replace function public\.crm_apply_ticket_transfer[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(transfer, /update public\.crm_tickets set/)
  assert.match(transfer, /where id = p_ticket_id/)
  assert.doesNotMatch(transfer, /insert into public\.crm_tickets/)
  assert.doesNotMatch(transfer, /delete from public\.crm_ticket_(contacts|notes|assignments)/)
})

test('37. rejected transfers never invoke the transfer helper', () => {
  const review = managerWorkflowMigration.match(/create or replace function public\.review_crm_ticket_request[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(review, /decision in \('APPROVED','MODIFIED'\) and request_record\.request_type = 'POST_TICKET'/)
})

test('38. manager Assign to Me is direct and audited', () => {
  const assignment = managerWorkflowMigration.match(/create or replace function public\.request_crm_ticket_assignment[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(assignment, /tickets\.requests\.review/)
  assert.match(assignment, /insert into public\.crm_ticket_assignments/)
  assert.match(assignment, /'ASSIGNMENT_DIRECT'/)
  assert.match(assignment, /'mode', 'direct'/)
})

test('39. manager Post Ticket and Delete Ticket are direct and audited', () => {
  const post = managerWorkflowMigration.match(/create or replace function public\.request_crm_ticket_post[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  const deletion = managerWorkflowMigration.match(/create or replace function public\.request_crm_ticket_deletion[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(post, /'TRANSFER_DIRECT'/)
  assert.match(deletion, /tickets\.delete/)
  assert.match(deletion, /'TICKET_DELETE_DIRECT'/)
})

test('40. executives still create pending permission requests', () => {
  for (const functionName of ['request_crm_ticket_assignment', 'request_crm_ticket_post', 'request_crm_ticket_deletion']) {
    const body = managerWorkflowMigration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?end;\\n\\$\\$;`))?.[0] ?? ''
    assert.match(body, /'mode', 'requested'/)
    assert.match(body, /'status', 'PENDING'/)
  }
})

test('41. self-addressed creation and self-review are rejected server-side', () => {
  assert.match(managerWorkflowMigration, /A request cannot be assigned to its requester/)
  assert.match(managerWorkflowMigration, /if request_record\.requested_by_user_id = actor then raise exception 'You cannot review your own request'/)
})

test('42. Ticket details render one accessible active tab panel', () => {
  for (const label of ['Overview', 'Contacts', 'Notes', 'Activity', 'Permissions', 'Timeline']) assert.ok(ticketPage.includes(`'${label}'`))
  assert.doesNotMatch(ticketPage, /\['cases', 'Cases'\]/)
  assert.match(ticketPage, /role="tablist"/)
  assert.match(ticketPage, /aria-selected=/)
  assert.match(ticketPage, /role="tabpanel"/)
  assert.match(ticketPage, /activeTab === 'overview'/)
})

test('43. tab keyboard navigation and mobile horizontal scrolling are supported', () => {
  assert.match(ticketPage, /ArrowLeft.*ArrowRight.*Home.*End/)
  assert.match(styles, /\.ticket-tabs[\s\S]*overflow-x:auto/)
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.ticket-primary-actions[\s\S]*overflow-x:auto/)
})

test('44. Cases is global while the separate Ticket Timeline remains query-free', () => {
  assert.match(consolePage, /path: '\/console\/cases', label: 'Cases'/)
  assert.match(consolePage, /path: '\/console\/timeline', label: 'Timeline'/)
  assert.match(ticketPage, /activeTab === 'timeline'.*<PlaceholderTab/)
  assert.doesNotMatch(caseTicketService, /(getRelatedCases|getTimeline)/)
})

test('45. responsible manager editing uses the eligible reference list', () => {
  assert.match(ticketPage, /reference\.managers\.filter/)
  assert.match(ticketPage, /Select Sales or Delivery Manager/)
  assert.match(ticketPage, /existing manager is no longer eligible/)
})

test('46. successful direct deletion navigates away without reloading the archived Ticket', () => {
  assert.match(ticketPage, /result\?\.mode === 'direct' && result\.archived/)
  assert.match(ticketPage, /navigate\(`\/console\/cases\/\$\{ticket\.caseId\}`\)/)
  assert.match(ticketPage, /requestTicketDeletion\(ticketId\)[\s\S]*afterDirectDeletion/)
})

test('47. unassigned Ticket viewers can only request assignment for themselves', () => {
  const assignment = selfAssignmentMigration.match(/create or replace function public\.request_crm_ticket_assignment[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(assignment, /crm_can_access_ticket\(p_ticket_id, 'tickets\.read'\)/)
  assert.doesNotMatch(assignment, /crm_can_access_ticket\(p_ticket_id, 'tickets\.requests\.create'\)/)
  assert.match(assignment, /requested_by_user_id[\s\S]*requested_assignee_id[\s\S]*actor[\s\S]*actor/)
  assert.match(ticketPage, /maySelfAssign = can\(PERMISSIONS\.TICKETS_READ\)/)
  assert.match(ticketPage, /mayRequest && <button className="button button-primary"/)
})

test('48. assignment state is scoped to the signed-in user', () => {
  assert.match(ticketPage, /assignedUser\.id === user\?\.id/)
  assert.match(ticketPage, /request\.requestedAssigneeId === user\?\.id/)
  assert.match(ticketPage, /alreadyAssigned \? 'Already Assigned' : pendingAssignment \? 'Assignment Pending' : 'Assign to Me'/)
})

test('49. managers can add and remove Ticket assignees without replacing the team', () => {
  const assignmentUpdate = assignmentManagementMigration.match(/create or replace function public\.update_crm_ticket_assignments[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(assignmentUpdate, /crm_can_access_ticket\(p_ticket_id, 'tickets\.requests\.review'\)/)
  assert.match(assignmentUpdate, /on conflict \(ticket_id, user_id\) do update/)
  assert.match(assignmentUpdate, /set removed_at = now\(\)/)
  assert.doesNotMatch(assignmentUpdate, /delete from public\.crm_ticket_assignments/)
  assert.match(caseTicketService, /updateAssignments/)
})

test('50. the Ticket header provides removable chips and a searchable multi-user picker', () => {
  assert.match(ticketPage, /className="assignee-chip removable"/)
  assert.match(ticketPage, /aria-label="Add assigned members"/)
  assert.match(ticketPage, /<AssigneeManagerDialog/)
  assert.match(assigneeManagerDialog, /Search users/)
  assert.match(assigneeManagerDialog, /aria-multiselectable="true"/)
  assert.match(assigneeManagerDialog, /Add selected/)
})

test('51. assignment changes are audited and notify affected users', () => {
  assert.match(assignmentManagementMigration, /'ASSIGNEES_ADDED'/)
  assert.match(assignmentManagementMigration, /'ASSIGNEES_REMOVED'/)
  assert.match(assignmentManagementMigration, /'assignment_added'/)
  assert.match(assignmentManagementMigration, /'assignment_removed'/)
})
