import { useEffect, useState } from 'react'
import { deletePlan, replacePlanProducts } from '../../../api/plans'
import { newRowKey, PlanProductsEditor } from '../components/PlanProductsEditor'
import type { ProductEditorSlots } from '../components/product-slots'
import { PolicyToggles } from '../components/PolicyToggles'
import { usePlan } from '../hooks/usePlans'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { toProductPayload, validateProductRows } from '../schemas'
import { FREQUENCY_LABELS, type PlanDetail, type PlanPageNav, type PlanProduct, type PlanViewerRole, type ProductRowDraft } from '../types'
import '../plans.css'

interface Props extends PlanPageNav {
  role: PlanViewerRole
  planId: number
  slots?: ProductEditorSlots
}

const toDrafts = (products: PlanProduct[]): ProductRowDraft[] =>
  products.map((p) => ({
    key: newRowKey(),
    product_id: p.product_id,
    variant_id: p.variant_id,
    default_quantity: String(p.default_quantity),
    unit_price_override: p.unit_price_override ?? '',
    product_name: p.product_name,
    variant_label: p.variant_label,
    product_is_active: p.product_is_active,
  }))

const signature = (rows: ProductRowDraft[]) =>
  JSON.stringify(rows.map((r) => [r.product_id, r.variant_id, r.default_quantity.trim(), r.unit_price_override.trim()]))

export function PlanDetailPage({ role, planId, onNavigate, slots }: Props) {
  const [state, reload] = usePlan(planId)
  if (state.status === 'loading') return <p role="status">Loading plan…</p>
  if (state.status === 'error') {
    return (
      <div role="alert" className="plans-error">
        <p>Could not load plan: {state.message}</p>
        <button type="button" onClick={reload}>Retry</button>
        <button type="button" onClick={() => onNavigate('/plans')}>Back to plans</button>
      </div>
    )
  }
  return <Detail plan={state.data} role={role} onNavigate={onNavigate} reload={reload} slots={slots} />
}

function Detail({ plan, role, onNavigate, reload, slots }: PlanPageNav & { plan: PlanDetail; role: PlanViewerRole; reload: () => void; slots: ProductEditorSlots | undefined }) {
  const canEdit = role === 'admin'
  const [rows, setRows] = useState(() => toDrafts(plan.products))
  const [baseline, setBaseline] = useState(() => signature(rows))
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const drafts = toDrafts(plan.products)
    setRows(drafts)
    setBaseline(signature(drafts))
  }, [plan])

  const dirty = canEdit && signature(rows) !== baseline
  const confirmLeave = useUnsavedChangesGuard(dirty)

  async function saveProducts() {
    const errs = validateProductRows(rows)
    setRowErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    setMessage(null)
    try {
      await replacePlanProducts(plan.id, toProductPayload(rows))
      setMessage({ kind: 'ok', text: 'Products saved.' })
      reload()
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save products' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return
    setBusy(true)
    setMessage(null)
    try {
      await deletePlan(plan.id)
      onNavigate('/plans')
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not delete the plan' })
      setBusy(false)
    }
  }

  const go = (path: string) => confirmLeave() && onNavigate(path)

  return (
    <section className="plans-page">
      <header className="plans-header">
        <h1>{plan.name}</h1>
        <div className="plans-actions">
          <button type="button" onClick={() => go('/plans')}>Back to plans</button>
          {canEdit && (
            <>
              <button type="button" onClick={() => go(`/plans/${plan.id}/edit`)}>Edit</button>
              <button type="button" disabled={busy} onClick={remove}>Delete</button>
            </>
          )}
        </div>
      </header>

      {!canEdit && <p className="plans-notice" role="note">You have read-only access to plans.</p>}
      {message && (
        <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'plans-success' : 'plans-error'}>
          {message.text}
        </p>
      )}

      <dl className="plans-summary">
        <dt>Billing frequency</dt><dd>{FREQUENCY_LABELS[plan.billing_frequency]}</dd>
        <dt>Price</dt><dd>{plan.price}</dd>
        <dt>Minimum quantity</dt><dd>{plan.min_quantity}</dd>
        <dt>Available</dt><dd>{plan.available_from} → {plan.available_to ?? 'open-ended'}</dd>
        <dt>Status</dt><dd>{plan.is_active ? 'Active' : 'Inactive'}</dd>
        {plan.notes && (<><dt>Notes</dt><dd>{plan.notes}</dd></>)}
      </dl>

      <PolicyToggles value={plan.policies} onChange={() => {}} disabled />

      <h2>Products</h2>
      <PlanProductsEditor rows={rows} onChange={setRows} errors={rowErrors} readOnly={!canEdit} disabled={busy} slots={slots} />
      {canEdit && (
        <div className="plans-actions">
          <button type="button" disabled={!dirty || busy} onClick={saveProducts}>Save products</button>
          {dirty && (
            <>
              <span role="status">Unsaved changes</span>
              <button type="button" disabled={busy} onClick={() => { setRows(toDrafts(plan.products)); setRowErrors({}) }}>Discard</button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

