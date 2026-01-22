import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as SessionController from '../controllers/sessionController';

const router = Router();

// Create Session
router.post('/', authenticate as any, SessionController.createSession);

// List Sessions
router.get('/', authenticate as any, SessionController.listSessions);

// Search Sessions
router.get('/search', authenticate as any, SessionController.searchSessions);


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
