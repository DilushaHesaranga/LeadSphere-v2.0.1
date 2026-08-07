import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDateTime } from '../config/crm.js'
import { notificationService } from '../services/notificationService.js'
import { navigate } from '../utils/router.js'
import { Icon } from './Icons.jsx'

const PRESENTED_NOTIFICATIONS_KEY = 'leadsphere:presented-notifications'
const PREVIEW_DURATION_MS = 7000

function claimNotificationPresentation(notificationId) {
  const claim = () => {
    try {
      const presented = JSON.parse(window.localStorage.getItem(PRESENTED_NOTIFICATIONS_KEY) ?? '[]')
      if (Array.isArray(presented) && presented.includes(notificationId)) return false
      const next = [notificationId, ...(Array.isArray(presented) ? presented : [])].slice(0, 100)
      window.localStorage.setItem(PRESENTED_NOTIFICATIONS_KEY, JSON.stringify(next))
      return true
    } catch {
      return true
    }
  }

  if (navigator.locks?.request) {
    return navigator.locks.request('leadsphere-notification-presentation', { mode: 'exclusive' }, claim)
  }
  return Promise.resolve(claim())
}

function playNotificationChime(audioContext) {
  if (!audioContext || audioContext.state !== 'running') return
  const startedAt = audioContext.currentTime
  const masterGain = audioContext.createGain()
  masterGain.gain.setValueAtTime(0.0001, startedAt)
  masterGain.gain.exponentialRampToValueAtTime(0.14, startedAt + 0.025)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.48)
  masterGain.connect(audioContext.destination)

  for (const [frequency, delay] of [[659.25, 0], [880, 0.13]]) {
    const oscillator = audioContext.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, startedAt + delay)
    oscillator.connect(masterGain)
    oscillator.start(startedAt + delay)
    oscillator.stop(startedAt + delay + 0.32)
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [previews, setPreviews] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const wrapperRef = useRef(null)
  const audioContextRef = useRef(null)
  const initialLoadCompleteRef = useRef(false)
  const knownNotificationIdsRef = useRef(new Set())
  const previewTimersRef = useRef(new Map())

  const dismissPreview = useCallback((notificationId) => {
    const timer = previewTimersRef.current.get(notificationId)
    if (timer) window.clearTimeout(timer)
    previewTimersRef.current.delete(notificationId)
    setPreviews((current) => current.filter((notification) => notification.id !== notificationId))
  }, [])

  const presentNotifications = useCallback(async (notifications) => {
    const accepted = []
    for (const notification of notifications) {
      if (await claimNotificationPresentation(notification.id)) accepted.push(notification)
    }
    if (!accepted.length) return

    playNotificationChime(audioContextRef.current)
    setPreviews((current) => [...accepted, ...current.filter((item) => !accepted.some(({ id }) => id === item.id))].slice(0, 3))
    for (const notification of accepted) {
      const existingTimer = previewTimersRef.current.get(notification.id)
      if (existingTimer) window.clearTimeout(existingTimer)
      previewTimersRef.current.set(notification.id, window.setTimeout(() => dismissPreview(notification.id), PREVIEW_DURATION_MS))
    }
  }, [dismissPreview])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await notificationService.list()
      const nextItems = data?.items ?? []
      if (initialLoadCompleteRef.current) {
        const arrivals = nextItems.filter((notification) => !notification.readAt && !knownNotificationIdsRef.current.has(notification.id))
        for (const notification of nextItems) knownNotificationIdsRef.current.add(notification.id)
        if (arrivals.length) void presentNotifications(arrivals)
      } else {
        for (const notification of nextItems) knownNotificationIdsRef.current.add(notification.id)
        initialLoadCompleteRef.current = true
      }
      setItems(nextItems)
      setUnreadCount(Number(data?.unreadCount ?? 0))
      setError('')
    } catch {
      if (!quiet) setError('Notifications could not be loaded.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [presentNotifications])

  useEffect(() => {
    const previewTimers = previewTimersRef.current
    const unlockAudio = () => {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContext) return
      if (!audioContextRef.current) audioContextRef.current = new AudioContext()
      if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume().catch(() => {})
    }
    document.addEventListener('pointerdown', unlockAudio, { once: true })
    document.addEventListener('keydown', unlockAudio, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
      for (const timer of previewTimers.values()) window.clearTimeout(timer)
      previewTimers.clear()
      const audioContext = audioContextRef.current
      audioContextRef.current = null
      void audioContext?.close().catch(() => {})
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
    dismissPreview(notification.id)
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
      {loading ? <div className="notification-message">Loading notifications...</div> : items.length ? <div className="notification-list">{items.map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.readAt ? '' : 'unread'}`} onClick={() => openNotification(notification)}><span className="notification-dot"/><span><strong>{notification.title}</strong><small>{notification.message}</small><time>{formatDateTime(notification.createdAt)}</time></span></button>)}</div> : <div className="notification-message"><Icon name="bell" size={24}/><strong>You&apos;re all caught up.</strong><span>New permission, Ticket, and Follow Up updates will appear here.</span></div>}
    </section>}
    {createPortal(<div className="notification-preview-stack" aria-live="polite" aria-label="New notifications">
      {previews.map((notification) => <article className="notification-preview" key={notification.id}>
        <button type="button" className="notification-preview-content" onClick={() => openNotification(notification)}>
          <span className="notification-preview-icon"><Icon name="bell" size={18}/></span>
          <span><small>New notification</small><strong>{notification.title}</strong><span>{notification.message}</span></span>
        </button>
        <button type="button" className="notification-preview-close" aria-label={`Dismiss ${notification.title}`} onClick={() => dismissPreview(notification.id)}><Icon name="close" size={15}/></button>
      </article>)}
    </div>, document.body)}
  </div>
}
