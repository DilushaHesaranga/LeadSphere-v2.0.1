import { supabase } from '../utils/supabase.js'

function messageFor(error) {
  const message = error?.message ?? 'The request could not be completed.'
  if (message.includes('duplicate key') || message.includes('already exists')) return 'A matching record already exists.'
  if (message.includes('Permission denied') || message.includes('access denied')) return 'Your role does not permit this action.'
  return message
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(messageFor(error))
  return data
}

export const caseTicketService = Object.freeze({
  getReferenceData: () => rpc('get_crm_reference_data'),
  findCases: (search = '') => rpc('find_crm_cases', { p_search: search }),
  listCases: ({ area, search = '', stage = '', department = '', sort = 'recent' }) => rpc('list_crm_cases', {
    p_area: area,
    p_search: search,
    p_stage: stage || null,
    p_department: department || null,
    p_sort: sort,
  }),
  getCase: (caseId) => rpc('get_crm_case', { p_case_id: caseId }),
  getTicket: (ticketId) => rpc('get_crm_ticket', { p_ticket_id: ticketId }),
  createCaseAndTicket: (input) => rpc('create_crm_case_and_ticket_with_assignees', {
    p_company_name: input.companyName,
    p_project_title: input.projectTitle,
    p_department: input.currentDepartment,
    p_stage: input.stage,
    p_responsible_manager_id: input.responsibleManagerId,
    p_contacts: input.contacts,
    p_assignee_ids: input.assigneeIds ?? [],
  }),
  createTicket: (input) => rpc('create_crm_ticket_with_assignees', {
    p_case_id: input.caseId,
    p_project_title: input.projectTitle,
    p_department: input.currentDepartment,
    p_stage: input.stage,
    p_responsible_manager_id: input.responsibleManagerId,
    p_contacts: input.contacts,
    p_assignee_ids: input.assigneeIds ?? [],
  }),
  updateTicket: (ticketId, input) => rpc('update_crm_ticket', {
    p_ticket_id: ticketId,
    p_project_title: input.projectTitle,
    p_stage: input.stage,
    p_responsible_manager_id: input.responsibleManagerId || null,
  }),
  addNote: (ticketId, content) => rpc('add_crm_ticket_note', { p_ticket_id: ticketId, p_content: content }),
  requestAssignment: (ticketId) => rpc('request_crm_ticket_assignment', { p_ticket_id: ticketId }),
  updateAssignments: (ticketId, { addUserIds = [], removeUserIds = [] }) => rpc('update_crm_ticket_assignments', {
    p_ticket_id: ticketId,
    p_add_user_ids: addUserIds,
    p_remove_user_ids: removeUserIds,
  }),
  requestPost: (ticketId, requestedDepartment, requestNote) => rpc('request_crm_ticket_post', {
    p_ticket_id: ticketId,
    p_requested_department: requestedDepartment,
    p_request_note: requestNote || null,
  }),
  requestTicketDeletion: (ticketId, requestNote = '') => rpc('request_crm_ticket_deletion', {
    p_ticket_id: ticketId,
    p_request_note: requestNote || null,
  }),
  requestCaseDeletion: (caseId, assignedManagerId, requestNote = '') => rpc('request_crm_case_deletion', {
    p_case_id: caseId,
    p_assigned_manager_id: assignedManagerId,
    p_request_note: requestNote || null,
  }),
  listRequests: (status = 'PENDING') => rpc('list_crm_ticket_requests', { p_status: status }),
  reviewRequest: (requestId, decision, options = {}) => rpc('review_crm_ticket_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_manager_comment: options.comment || null,
    p_modified_assignee_id: options.assigneeId || null,
    p_modified_department: options.department || null,
  }),
  closeTicket: (ticketId) => rpc('close_crm_ticket', { p_ticket_id: ticketId }),
})
