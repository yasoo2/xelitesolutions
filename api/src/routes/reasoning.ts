/**
 * Reasoning Trace API Routes
 * ==========================
 * 
 * API endpoints لتتبع عملية التفكير والبث الفوري للأحداث
 */

import { Router, Request, Response } from 'express';
import { reasoningTracer, ThinkingEventType } from '../reasoning/trace';
import { WebSocketServer } from 'ws';
import { Server } from 'http';

const router = Router();

/**
 * WebSocket للبث الفوري للأحداث
 */
export function setupReasoningWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/reasoning/ws' });

  // الاتصالات النشطة
  const clients = new Set<any>();

  wss.on('connection', (ws) => {
    console.log('🔗 عميل جديد متصل بنظام تتبع الأفكار');
    clients.add(ws);

    // إرسال الأحداث الحالية
    const currentTrace = reasoningTracer.getCurrentTrace();
    if (currentTrace) {
      ws.send(JSON.stringify({
        type: 'current_trace',
        data: currentTrace
      }));
    }

    // معالجة الرسائل
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleWebSocketMessage(data, ws);
      } catch (error) {
        console.error('خطأ في معالجة رسالة WebSocket:', error);
      }
    });

    ws.on('close', () => {
      console.log('❌ قطع اتصال العميل');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('خطأ في WebSocket:', error);
      clients.delete(ws);
    });
  });

  // إعداد مستمع الأحداث
  reasoningTracer.onThinking((event) => {
    const message = JSON.stringify({
      type: 'thinking_event',
      data: event
    });

    clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    });
  });

  return wss;
}

/**
 * معالج رسائل WebSocket
 */
function handleWebSocketMessage(data: any, ws: any) {
  switch (data.type) {
    case 'start_trace':
      const traceId = reasoningTracer.startTrace(data.taskDescription);
      ws.send(JSON.stringify({
        type: 'trace_started',
        traceId
      }));
      break;

    case 'get_current_trace':
      const trace = reasoningTracer.getCurrentTrace();
      ws.send(JSON.stringify({
        type: 'current_trace',
        data: trace
      }));
      break;

    case 'get_stats':
      const stats = reasoningTracer.getPerformanceStats();
      ws.send(JSON.stringify({
        type: 'performance_stats',
        data: stats
      }));
      break;

    default:
      console.warn('نوع رسالة غير معروف:', data.type);
  }
}

/**
 * POST /api/reasoning/start
 * بدء تتبع جديد
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { taskDescription } = req.body;

    if (!taskDescription) {
      return res.status(400).json({
        error: 'taskDescription مطلوب'
      });
    }

    const traceId = reasoningTracer.startTrace(taskDescription);

    res.json({
      success: true,
      traceId,
      message: 'تم بدء التتبع بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      error: String(error)
    });
  }
});

/**
 * POST /api/reasoning/event
 * إضافة حدث تفكير
 */
router.post('/event', (req: Request, res: Response) => {
  try {
    const { type, content, metadata, depth } = req.body;

    if (!type || !content) {
      return res.status(400).json({
        error: 'type و content مطلوبان'
      });
    }

    reasoningTracer.addThinkingEvent(
      type as ThinkingEventType,
      content,
      metadata,
      depth || 0
    );

    res.json({
      success: true,
      message: 'تم إضافة الحدث بنجاح'
    });
  } catch (error) {
    res.status(500).json({
      error: String(error)
    });
  }
});

/**
 * POST /api/reasoning/analyze-task
 * تسجيل تحليل المهمة
 */
router.post('/analyze-task', (req: Request, res: Response) => {
  try {
    const { goal, constraints, requiredTools, estimatedSteps } = req.body;

    reasoningTracer.analyzeTask({
      goal,
      constraints: constraints || [],
      requiredTools: requiredTools || [],
      estimatedSteps: estimatedSteps || 0
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/evaluate-tools
 * تقييم الأدوات
 */
router.post('/evaluate-tools', (req: Request, res: Response) => {
  try {
    const { tools } = req.body;

    if (!Array.isArray(tools)) {
      return res.status(400).json({
        error: 'tools يجب أن تكون مصفوفة'
      });
    }

    reasoningTracer.evaluateTools(tools);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/select-tool
 * تسجيل اختيار الأداة
 */
router.post('/select-tool', (req: Request, res: Response) => {
  try {
    const { toolName, reasoning, confidence } = req.body;

    reasoningTracer.selectTool(
      toolName,
      reasoning,
      confidence || 0.9
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/execute
 * تسجيل التنفيذ
 */
router.post('/execute', (req: Request, res: Response) => {
  try {
    const { toolName, input, output, duration } = req.body;

    reasoningTracer.startExecution(toolName, input);
    reasoningTracer.completeExecution(toolName, input, output, duration || 0);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/error
 * تسجيل خطأ
 */
router.post('/error', (req: Request, res: Response) => {
  try {
    const { error, context, recovery, success } = req.body;

    reasoningTracer.detectError(error, context);

    if (recovery) {
      reasoningTracer.attemptRecovery(recovery, context?.reason || '');
    }

    if (success) {
      reasoningTracer.recoverySuccess(recovery);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/decision
 * تسجيل قرار
 */
router.post('/decision', (req: Request, res: Response) => {
  try {
    const { decision, reasoning, alternatives } = req.body;

    reasoningTracer.makeDecision(
      decision,
      reasoning,
      alternatives || []
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/reasoning/conclude
 * إنهاء التتبع
 */
router.post('/conclude', (req: Request, res: Response) => {
  try {
    const { summary, success } = req.body;

    reasoningTracer.conclude(summary, success !== false);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/reasoning/current
 * الحصول على السلسلة الحالية
 */
router.get('/current', (req: Request, res: Response) => {
  try {
    const trace = reasoningTracer.getCurrentTrace();

    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/reasoning/:traceId
 * الحصول على سلسلة محددة
 */
router.get('/:traceId', (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const trace = reasoningTracer.getTrace(traceId);

    if (!trace) {
      return res.status(404).json({
        error: 'السلسلة غير موجودة'
      });
    }

    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/reasoning/all
 * الحصول على جميع السلاسل
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const traces = reasoningTracer.getAllTraces();

    res.json({
      success: true,
      data: traces,
      count: traces.length
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/reasoning/stats
 * الحصول على الإحصائيات
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = reasoningTracer.getPerformanceStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /api/reasoning/:traceId/export
 * تصدير السلسلة
 */
router.get('/:traceId/export', (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const { format } = req.query;

    let content: string;

    if (format === 'markdown') {
      content = reasoningTracer.exportAsMarkdown(traceId);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="trace-${traceId}.md"`);
    } else {
      content = reasoningTracer.exportTrace(traceId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="trace-${traceId}.json"`);
    }

    res.send(content);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * DELETE /api/reasoning
 * مسح جميع السلاسل
 */
router.delete('/', (req: Request, res: Response) => {
  try {
    reasoningTracer.reset();

    res.json({
      success: true,
      message: 'تم مسح جميع السلاسل'
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
