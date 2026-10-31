// HTTP handlers for plans — parse validated input, call one service fn.
import type { Request, Response } from 'express'
import { created, list, noContent, ok } from '../../lib/responses.js'
import type { CreatePlanInput, ListPlansQuery, PlanProductInput, UpdatePlanInput } from './plans.schemas.js'
import * as service from './plans.service.js'

const planId = (req: Request) => Number(req.params.id)

export async function listPlans(req: Request, res: Response): Promise<void> {
  const { data, meta } = await service.listPlans(res.locals.query as ListPlansQuery)
  list(res, data, meta)
}

export async function createPlan(req: Request, res: Response): Promise<void> {
  const plan = await service.createPlan(req.body as CreatePlanInput)
  created(res, plan, `/api/v1/plans/${plan.id}`)
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  ok(res, await service.getPlan(planId(req)))
}

export async function updatePlan(req: Request, res: Response): Promise<void> {
  ok(res, await service.updatePlan(planId(req), req.body as UpdatePlanInput))
}

export async function replacePlanProducts(req: Request, res: Response): Promise<void> {
  const { products } = req.body as { products: PlanProductInput[] }
  ok(res, await service.replacePlanProducts(planId(req), products))
}

export async function deletePlan(req: Request, res: Response): Promise<void> {
  await service.deletePlan(planId(req))
  noContent(res)
}
