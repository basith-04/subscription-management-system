import { useEffect } from 'react'

export interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
  duration?: number
}

export function Toast({
  message,
  type = 'success',
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  const bgColor =
    type === 'success'
      ? '#ecfdf5'
      : type === 'error'
        ? '#fef2f2'
        : '#eff6ff'
  const textColor =
    type === 'success'
      ? '#065f46'
      : type === 'error'
        ? '#991b1b'
        : '#1e40af'
  const borderColor =
    type === 'success'
      ? '#a7f3d0'
      : type === 'error'
        ? '#fecaca'
        : '#bfdbfe'

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '12px 20px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 1100,
        fontWeight: 500,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: textColor,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '0 4px',
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  )
}
