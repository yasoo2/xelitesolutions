import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/speech', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { text, voice = 'alloy' } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(503).json({ error: 'No OpenAI API key configured' });
    }

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });

    // Use mp3 for compatibility
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
    });
    
    res.send(buffer);
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
});

export default router;
