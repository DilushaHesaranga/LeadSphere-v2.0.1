import { useState } from 'react'
import { CASE_LIFECYCLES, CASE_PRIORITIES, CASE_STATUSES } from '../config/cases.js'
import { ModalShell } from './ModalShell.jsx'

export function CaseEditDialog({ caseData, reference, onClose, onSave }) {
  const [form, setForm] = useState({
    companyName: caseData.companyName ?? '', displayName: caseData.displayName ?? '', legalName: caseData.legalName ?? '',
    industry: caseData.industry ?? '', companyType: caseData.companyType ?? '', website: caseData.website ?? '',
    primaryEmail: caseData.primaryEmail ?? '', primaryPhone: caseData.primaryPhone ?? '', additionalEmails: (caseData.additionalEmails ?? []).join(', '), additionalPhones: (caseData.additionalPhones ?? []).join(', '), address: caseData.address ?? '',
    city: caseData.city ?? '', region: caseData.region ?? '', country: caseData.country ?? '', companySize: caseData.companySize ?? '',
    employeeCount: caseData.employeeCount ?? '', annualRevenue: caseData.annualRevenue ?? '', lifecycleStage: caseData.lifecycleStage ?? 'prospect',
    status: caseData.status ?? 'active', source: caseData.source ?? '', firstContactDate: caseData.firstContactDate ?? '',
    ownerId: caseData.ownerId ?? '', salesManagerId: caseData.salesManagerId ?? '', deliveryManagerId: caseData.deliveryManagerId ?? '',
    priority: caseData.priority ?? 'normal', tags: (caseData.tags ?? []).join(', '), description: caseData.description ?? '',
    riskLevel: caseData.riskLevel ?? 'low', opportunityLevel: caseData.opportunityLevel ?? 'medium',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (form.companyName.trim().length < 2) return setError('Company name is required.')
    if (form.primaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.primaryEmail)) return setError('Enter a valid primary email address.')
    setBusy(true)
    try { await onSave({ ...form, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), additionalEmails: form.additionalEmails.split(',').map((value) => value.trim()).filter(Boolean), additionalPhones: form.additionalPhones.split(',').map((value) => value.trim()).filter(Boolean) }); onClose() }
    catch (saveError) { setError(saveError.message) }
    finally { setBusy(false) }
  }
  return <ModalShell title="Edit Case" kicker="Company profile" onClose={onClose} wide>
    {error && <div className="alert alert-error">{error}</div>}
    <form onSubmit={submit}><div className="form-grid case-edit-grid">
      <label className="field"><span>Company name</span><input required value={form.companyName} onChange={(e)=>change('companyName',e.target.value)}/></label>
      <label className="field"><span>Display name</span><input value={form.displayName} onChange={(e)=>change('displayName',e.target.value)}/></label>
      <label className="field"><span>Registered name</span><input value={form.legalName} onChange={(e)=>change('legalName',e.target.value)}/></label>
      <label className="field"><span>Industry</span><input value={form.industry} onChange={(e)=>change('industry',e.target.value)}/></label>
      <label className="field"><span>Company type</span><input value={form.companyType} onChange={(e)=>change('companyType',e.target.value)}/></label>
      <label className="field"><span>Website</span><input type="url" placeholder="https://" value={form.website} onChange={(e)=>change('website',e.target.value)}/></label>
      <label className="field"><span>Primary email</span><input type="email" value={form.primaryEmail} onChange={(e)=>change('primaryEmail',e.target.value)}/></label>
      <label className="field"><span>Primary phone</span><input value={form.primaryPhone} onChange={(e)=>change('primaryPhone',e.target.value)}/></label>
      <label className="field"><span>Additional emails <small>(comma separated)</small></span><input value={form.additionalEmails} onChange={(e)=>change('additionalEmails',e.target.value)}/></label>
      <label className="field"><span>Additional phones <small>(comma separated)</small></span><input value={form.additionalPhones} onChange={(e)=>change('additionalPhones',e.target.value)}/></label>
      <label className="field field-wide"><span>Address</span><input value={form.address} onChange={(e)=>change('address',e.target.value)}/></label>
      <label className="field"><span>City</span><input value={form.city} onChange={(e)=>change('city',e.target.value)}/></label>
      <label className="field"><span>District / region</span><input value={form.region} onChange={(e)=>change('region',e.target.value)}/></label>
      <label className="field"><span>Country</span><input value={form.country} onChange={(e)=>change('country',e.target.value)}/></label>
      <label className="field"><span>Company size</span><input value={form.companySize} onChange={(e)=>change('companySize',e.target.value)}/></label>
      <label className="field"><span>Employees</span><input min="0" type="number" value={form.employeeCount} onChange={(e)=>change('employeeCount',e.target.value)}/></label>
      <label className="field"><span>Annual revenue</span><input min="0" type="number" step="0.01" value={form.annualRevenue} onChange={(e)=>change('annualRevenue',e.target.value)}/></label>
      <label className="field"><span>Lifecycle</span><select value={form.lifecycleStage} onChange={(e)=>change('lifecycleStage',e.target.value)}>{CASE_LIFECYCLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>Status</span><select value={form.status} onChange={(e)=>change('status',e.target.value)}>{CASE_STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>Priority</span><select value={form.priority} onChange={(e)=>change('priority',e.target.value)}>{CASE_PRIORITIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>Risk</span><select value={form.riskLevel} onChange={(e)=>change('riskLevel',e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label className="field"><span>Opportunity</span><select value={form.opportunityLevel} onChange={(e)=>change('opportunityLevel',e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label className="field"><span>Source</span><input value={form.source} onChange={(e)=>change('source',e.target.value)}/></label>
      <label className="field"><span>First contact</span><input type="date" value={form.firstContactDate} onChange={(e)=>change('firstContactDate',e.target.value)}/></label>
      <label className="field"><span>Account owner</span><select value={form.ownerId} onChange={(e)=>change('ownerId',e.target.value)}><option value="">Unassigned</option>{(reference.assignees??[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="field"><span>Sales manager</span><select value={form.salesManagerId} onChange={(e)=>change('salesManagerId',e.target.value)}><option value="">Unassigned</option>{(reference.managers??[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="field"><span>Delivery manager</span><select value={form.deliveryManagerId} onChange={(e)=>change('deliveryManagerId',e.target.value)}><option value="">Unassigned</option>{(reference.managers??[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="field field-wide"><span>Tags <small>(comma separated)</small></span><input value={form.tags} onChange={(e)=>change('tags',e.target.value)}/></label>
      <label className="field field-wide"><span>Description</span><textarea rows="4" maxLength="5000" value={form.description} onChange={(e)=>change('description',e.target.value)}/></label>
    </div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Saving…':'Save Case'}</button></div></form>
  </ModalShell>
}

export function CaseContactDialog({ contact, onClose, onSave }) {
  const [form,setForm]=useState({name:contact?.name??'',jobTitle:contact?.jobTitle??'',department:contact?.department??'',email:contact?.email??'',phone:contact?.phone??'',secondaryPhone:contact?.secondaryPhone??'',preferredMethod:contact?.preferredMethod??'',decisionMaker:contact?.decisionMaker??false,primary:contact?.primary??false,notes:contact?.notes??'',status:contact?.status??'active'})
  const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  const submit=async(e)=>{e.preventDefault();setError('');if(form.name.trim().length<2)return setError('Contact name is required.');if(!form.email&&!form.phone)return setError('Add an email or phone number.');setBusy(true);try{await onSave(contact?.id,form);onClose()}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <ModalShell title={contact?'Edit Contact':'Add Contact'} kicker="Case address book" onClose={onClose}>{error&&<div className="alert alert-error">{error}</div>}<form onSubmit={submit}><div className="form-grid">
    <label className="field"><span>Full name</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field"><span>Job title</span><input value={form.jobTitle} onChange={e=>setForm({...form,jobTitle:e.target.value})}/></label>
    <label className="field"><span>Department</span><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></label><label className="field"><span>Email</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label className="field"><span>Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="field"><span>Secondary phone</span><input value={form.secondaryPhone} onChange={e=>setForm({...form,secondaryPhone:e.target.value})}/></label>
    <label className="field"><span>Preferred method</span><select value={form.preferredMethod} onChange={e=>setForm({...form,preferredMethod:e.target.value})}><option value="">Not set</option><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option></select></label><label className="field"><span>Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <label className="case-check"><input type="checkbox" checked={form.primary} onChange={e=>setForm({...form,primary:e.target.checked})}/>Primary contact</label><label className="case-check"><input type="checkbox" checked={form.decisionMaker} onChange={e=>setForm({...form,decisionMaker:e.target.checked})}/>Decision maker</label>
    <label className="field field-wide"><span>Notes</span><textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
  </div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Saving…':'Save Contact'}</button></div></form></ModalShell>
}
