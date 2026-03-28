import { AuthPayload } from '../../api/middleware/auth';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}
