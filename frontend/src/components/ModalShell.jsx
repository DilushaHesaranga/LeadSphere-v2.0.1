import { useEffect, useRef } from 'react'
import { Icon } from './Icons.jsx'

export function ModalShell({ title, kicker, onClose, children, wide = false }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const focusable = dialogRef.current?.querySelector('button, input, select, textarea, [href]')
    focusable?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]')]
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="modal-header">
          <div>{kicker && <span className="section-kicker">{kicker}</span>}<h2 id="dialog-title">{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
