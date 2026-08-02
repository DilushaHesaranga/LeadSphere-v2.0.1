import { Icon } from './Icons.jsx'

const modes = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

export function ThemeModeControl({ value, onChange, disabled = false, compact = false }) {
  return (
    <div className={`theme-mode-control ${compact ? 'compact' : ''}`} role="group" aria-label="Colour theme">
      {modes.map((mode) => (
        <button
          type="button"
          key={mode.value}
          className={value === mode.value ? 'active' : ''}
          aria-pressed={value === mode.value}
          aria-label={`${mode.label} theme`}
          disabled={disabled}
          onClick={() => onChange(mode.value)}
        >
          <Icon name={mode.icon} size={compact ? 15 : 17} />
          {!compact && <span>{mode.label}</span>}
        </button>
      ))}
    </div>
  )
}
