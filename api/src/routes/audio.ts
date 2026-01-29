import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/speech', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { text, voice = 'alloy' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

    if (apiKey) {
      const openai = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });

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

      return res.send(buffer);
    }

    const requestedVoice = String(voice || '').trim() || 'Brian';
    const fallbackVoice = requestedVoice === 'Brian' ? 'Amy' : 'Brian';
    const makeUrl = (v: string) =>
      `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(v)}&text=${encodeURIComponent(String(text))}`;

    let resp = await fetch(makeUrl(requestedVoice));
    if (!resp.ok) {
      resp = await fetch(makeUrl(fallbackVoice));
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'Free TTS provider failed', details: body.slice(0, 300) });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
    });

    return res.send(buffer);
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
});

export default router;
