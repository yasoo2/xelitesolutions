# Backend System Blueprints: The Scaling Engine

## 1. Express Enterprise Boilerplate (Scaled Controllers)
```typescript
class BaseController {
  protected sendSuccess(res: Response, data: any, message: string = 'Success') {
    return res.status(200).json({ status: 'ok', message, data });
  }
  
  protected sendError(res: Response, error: any, code: number = 500) {
    console.error(`[ControllerError] ${error.message}`);
    return res.status(code).json({ status: 'error', error: error.message });
  }
}

// Global Exception Filter
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({
    status: 'fatal',
    code: status,
    timestamp: new Date().toISOString(),
    path: req.path,
    traceId: req.headers['x-trace-id']
  });
});
```

## 2. Real-time Communication (WebSocket Hive Mind)
```typescript
const io = new Server(server);
io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.emit('joined', { timestamp: Date.now() });
  });
  
  socket.on('broadcast-action', (data) => {
    socket.to(data.roomId).emit('action-performed', data.payload);
  });
});
```

## 3. High-Performance Caching (Redis Stratagem)
- **Pattern**: Cache-Aside (Lazy loading).
- **TTL**: Multi-tier expiration (1m for dynamic, 1h for static).
- **Safety**: Circuit breaker pattern if Redis is unavailable.
