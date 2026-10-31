import cron, { type ScheduledTask } from 'node-cron'

const jobs = new Map<string, { task: ScheduledTask; fn: () => Promise<void> }>()

export function registerJob(name: string, schedule: string, fn: () => Promise<void>): void {
  if (jobs.has(name)) throw new Error(`Job ${name} already registered`)
  const task = cron.schedule(schedule, async () => {
    try {
      await fn()
    } catch (error) {
      console.error(`[job:${name}] failed`, error)
    }
  })
  jobs.set(name, { task, fn })
}

export async function runJobNow(name: string): Promise<void> {
  const job = jobs.get(name)
  if (!job) throw new Error(`Job ${name} not found`)
  await job.fn()
}

export function stopScheduler(): void {
  for (const { task } of jobs.values()) task.stop()
  jobs.clear()
}
