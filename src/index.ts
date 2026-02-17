import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import { connectDb, disconnectDb } from './db.js'
import routes from './routes.js'

const app = express()

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', routes)

// Root redirect
app.get('/', (_req, res) => {
  res.redirect('/api/health')
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  })
})

// Start server
async function main() {
  await connectDb()

  const port = config.PORT
  app.listen(port, () => {
    console.log(`Laguna Agent API running on port ${port}`)
    console.log(`Health: http://localhost:${port}/api/health`)
    console.log(`Docs: http://localhost:${port}/api/docs`)
  })

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...')
    await disconnectDb()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
