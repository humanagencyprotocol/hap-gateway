/**
 * GET /events — Server-Sent Events stream.
 *
 * Auth-guarded. Subscribes to the shared EventBus and pushes events to the
 * connected browser client as SSE frames. A keepalive comment is written every
 * 25s to defeat reverse-proxy idle-close.
 *
 * Mount in index.ts:
 *   app.get('/events', requireAuth(vault), createEventsHandler());
 */

import type { Request, Response } from 'express';
import { eventBus } from '../lib/event-bus';

const KEEPALIVE_INTERVAL_MS = 25_000;

export function createEventsHandler() {
  return function eventsHandler(_req: Request, res: Response): void {
    // SSE headers — must be set before any body bytes are written.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Disable Nginx/proxy response buffering so events reach the client immediately.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Subscribe to all bus events and forward them as SSE frames.
    const unsubscribe = eventBus.subscribe(event => {
      const data = JSON.stringify(event.payload ?? null);
      res.write(`event: ${event.type}\ndata: ${data}\n\n`);
    });

    // Keepalive — SSE comment syntax (lines starting with ':' are ignored by clients).
    const keepalive = setInterval(() => {
      res.write(':ka\n\n');
    }, KEEPALIVE_INTERVAL_MS);

    // Cleanup when the client disconnects (tab close, navigation, network drop).
    _req.on('close', () => {
      clearInterval(keepalive);
      unsubscribe();
    });
  };
}
