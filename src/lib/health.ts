/**
 * Health check HTTP server.
 * Provides a simple endpoint for container orchestration (Docker, Kubernetes, Railway).
 * @module lib/health
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { getMetricsSummary } from './metrics.js';

/** Health check server state */
let server: Server | null = null;

/** Additional health check data provider */
type HealthDataProvider = () => Record<string, unknown>;
let healthDataProvider: HealthDataProvider | null = null;

/**
 * Start the health check HTTP server.
 * 
 * @param port - Port to listen on (default: HEALTH_PORT env or 8080)
 * @returns The HTTP server instance
 * 
 * @example
 * // Start health server on default port
 * startHealthServer();
 * 
 * @example
 * // Start on custom port
 * startHealthServer(9090);
 * 
 * @example
 * // Check health: curl http://localhost:8080/health
 */
export function startHealthServer(port?: number): Server {
  const healthPort = port ?? parseInt(process.env.HEALTH_PORT || '8080', 10);
  
  if (server) {
    console.log('Health server already running');
    return server;
  }
  
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for browser access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.url === '/health' || req.url === '/') {
      const metrics = getMetricsSummary();
      const customData = healthDataProvider ? healthDataProvider() : {};
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        ...customData,
        metrics,
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(health, null, 2));
    } else if (req.url === '/ready') {
      // Readiness probe - always ready once started
      res.writeHead(200);
      res.end(JSON.stringify({ ready: true }));
    } else if (req.url === '/live') {
      // Liveness probe - always alive
      res.writeHead(200);
      res.end(JSON.stringify({ alive: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(healthPort, () => {
    console.log(`🏥 Health check server listening on http://localhost:${healthPort}/health`);
  });
  
  return server;
}

/**
 * Stop the health check server.
 */
export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Set a custom health data provider.
 * The returned object will be merged into the health response.
 * 
 * @param provider - Function that returns custom health data
 * 
 * @example
 * setHealthDataProvider(() => ({
 *   lastCycleTime: state.lastCycleTime,
 *   cycleCount: state.cycleCount,
 * }));
 */
export function setHealthDataProvider(provider: HealthDataProvider): void {
  healthDataProvider = provider;
}

/**
 * Check if health server is running.
 */
export function isHealthServerRunning(): boolean {
  return server !== null;
}
