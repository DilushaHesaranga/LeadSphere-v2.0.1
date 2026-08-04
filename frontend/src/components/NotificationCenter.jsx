import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateTime } from '../config/crm.js'
import { notificationService } from '../services/notificationService.js'
import { navigate } from '../utils/router.js'
import { Icon } from './Icons.jsx'

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const wrapperRef = useRef(null)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await notificationService.list()
      setItems(data?.items ?? [])
      setUnreadCount(Number(data?.unreadCount ?? 0))
      setError('')
    } catch {
      if (!quiet) setError('Notifications could not be loaded.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load({ quiet: true }), 30000)
    const refreshVisible = () => document.visibilityState === 'visible' && load({ quiet: true })
    document.addEventListener('visibilitychange', refreshVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event) => { if (!wrapperRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [open])

  const toggle = () => {
    setOpen((current) => !current)
    if (!open) load()
  }
  const openNotification = async (notification) => {
    if (!notification.readAt) {
      try {
        await notificationService.markRead(notification.id)
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch { setError('The notification could not be marked as read.') }
    }
    setOpen(false)
    if (notification.link) navigate(notification.link)
  }
  const markAll = async () => {
    try {
      await notificationService.markAllRead()
      const readAt = new Date().toISOString()
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })))
      setUnreadCount(0)
      setError('')
    } catch { setError('Notifications could not be marked as read.') }
  }

  return <div className="notification-center" ref={wrapperRef}>
    <button type="button" className="notification-trigger icon-button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={open} aria-controls="notification-panel" onClick={toggle}>
      <Icon name="bell" size={20}/>
      {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Notifications">
      <header><div><span className="section-kicker">Updates</span><h2>Notifications</h2></div>{unreadCount > 0 && <button type="button" className="text-button" onClick={markAll}>Mark all read</button>}</header>
      {error && <div className="notification-message" role="alert">{error}<button type="button" className="text-button" onClick={() => load()}>Retry</button></div>}
      {loading ? <div className="notification-message">Loading notifications...</div> : items.length ? <div className="notification-list">{items.map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.readAt ? '' : 'unread'}`} onClick={() => openNotification(notification)}><span className="notification-dot"/><span><strong>{notification.title}</strong><small>{notification.message}</small><time>{formatDateTime(notification.createdAt)}</time></span></button>)}</div> : <div className="notification-message"><Icon name="bell" size={24}/><strong>You’re all caught up.</strong><span>New permission and Ticket updates will appear here.</span></div>}
    </section>}
  </div>
}
