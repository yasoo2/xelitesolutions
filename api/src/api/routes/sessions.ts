import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as SessionController from '../controllers/sessionController';

const router = Router();

// Create Session
router.post('/', authenticate as any, SessionController.createSession);
router.post('/merge', authenticate as any, SessionController.mergeSessions);

// List Sessions
router.get('/', authenticate as any, SessionController.listSessions);

// Search Sessions
router.get('/search', authenticate as any, SessionController.searchSessions);

// Get Session Messages (History)
router.get('/:id/messages', authenticate as any, SessionController.listSessionMessages);

// Send Message
router.post('/:id/message', authenticate as any, SessionController.addMessage);

// Compatibility alias for CommandComposer.tsx
router.get('/:id/history', authenticate as any, SessionController.listSessionMessages);

// Session-bound work queue.  The composer keeps a friendly local rendering,
// while this endpoint makes the ordered work survive a reload or API restart.
router.get('/:id/queue', authenticate as any, SessionController.getSessionQueue);
router.put('/:id/queue', authenticate as any, SessionController.replaceSessionQueue);

//  What this session PRODUCED — the built page and the run's log lines.
//  The chat was always asked for; the work never was, so every reopened
//  session showed an empty Preview and an empty Logs panel.
router.get('/:id/workspace', authenticate as any, SessionController.sessionWorkspace);


// Delete All Sessions
router.delete('/', authenticate as any, SessionController.deleteAllSessions);

// Delete Session
router.delete('/:id', authenticate as any, SessionController.deleteSession);

// Pin/Unpin
router.patch('/:id/pin', authenticate as any, SessionController.togglePin);

// Move Folder
router.patch('/:id/move', authenticate as any, SessionController.moveSession);

// Set Secrets & Trigger Agent
router.post('/:id/secrets', authenticate as any, SessionController.updateSecrets);

export default router;
