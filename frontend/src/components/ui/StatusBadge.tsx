export function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(156, 163, 175, 0.15)',
        color: isActive ? '#15803d' : '#4b5563',
        border: `1px solid ${isActive ? '#86efac' : '#d1d5db'}`,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isActive ? '#22c55e' : '#9ca3af',
          marginRight: '6px',
        }}
      />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}
