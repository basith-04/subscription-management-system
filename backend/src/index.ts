import 'dotenv/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = createApp(config)

const server = app.listen(config.port, config.host, () => {
  console.log(
    `brightloop-api listening on http://${config.host}:${config.port} (env=${config.env})`,
  )
})

function shutdown(signal: NodeJS.Signals): void {
  console.log(`received ${signal}, shutting down brightloop-api`)

  const forceExit = setTimeout(() => {
    console.error('forced shutdown after timeout')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  server.close((error) => {
    if (error) {
      console.error('graceful shutdown failed', error)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
