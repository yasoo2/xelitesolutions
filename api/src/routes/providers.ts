import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { setDynamicOpenAIKey, getDynamicOpenAIKey } from '../llm';

const router = Router();

/**
 * POST /providers/openai/key
 * Set OpenAI API key from client
 */
router.post('/openai/key', (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({
        error: 'Invalid API key',
        message: 'apiKey must be a non-empty string'
      });
    }

    // Validate OpenAI API key format (should start with sk-)
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'OpenAI API key should start with "sk-"'
      });
    }

    // Set the dynamic API key for this user
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
    }
    setDynamicOpenAIKey(userId, apiKey);

    res.json({
      success: true,
      message: 'OpenAI API key set successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error setting OpenAI API key:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to set API key'
    });
  }
});

/**
 * GET /providers/openai/status
 * Check if OpenAI API key is configured
 */
router.get('/openai/status', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
    }
    const dynamicKey = String(getDynamicOpenAIKey(userId) || '').trim();
    const envKey = String(process.env.OPENAI_API_KEY || '').trim();
    const hasKey = Boolean(dynamicKey || envKey);

    res.json({
      provider: 'openai',
      configured: hasKey,
      source: dynamicKey ? 'dynamic' : (envKey ? 'env' : 'none'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking OpenAI status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check API key status'
    });
  }
});

/**
 * POST /providers/openai/test
 * Test OpenAI API connection
 */
router.post('/openai/test', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({
        error: 'Invalid API key',
        message: 'apiKey must be a non-empty string'
      });
    }

    // Validating key format
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid Key', message: 'Key must start with sk-' });
    }

    const testClient = new OpenAI({
      apiKey: apiKey,
      timeout: 10000,
    });

    // Try to list models as a simple test
    const models = await testClient.models.list();

    res.json({
      success: true,
      message: 'OpenAI API connection successful',
      modelsAvailable: models.data.length > 0,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing OpenAI API:', error);

    let errorMessage = 'Failed to connect to OpenAI API';
    if (error.status === 401) {
      errorMessage = 'Invalid API key';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - check your network';
    }

    res.status(error.status || 500).json({
      error: 'API connection failed',
      message: errorMessage,
      details: error.message
    });
  }

});

import { setActiveProvider, getActiveProvider } from '../llm';

/**
 * POST /providers/switch
 * Switch between AI Providers (joe, gemini, openai)
 */
router.post('/switch', (req: Request, res: Response) => {
  const { provider } = req.body;
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  setActiveProvider(userId, provider);
  res.json({ success: true, provider: getActiveProvider(userId) });
});

import { GeminiProvider } from '../llm/providers/gemini';

/**
 * POST /providers/gemini/key
 * Set Gemini API Key
 */
router.post('/gemini/key', (req: Request, res: Response) => {
  const { apiKey } = req.body;
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Use the same storage as OpenAI key, assuming user switches fully
  setDynamicOpenAIKey(userId, apiKey);
  // Auto-switch to gemini
  setActiveProvider(userId, 'gemini');

  res.json({ success: true, message: 'Gemini Key Configured' });
});

/**
 * GET /providers/gemini/status
 * Check if Gemini API key is configured
 */
router.get('/gemini/status', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
    }
    const dynamicKey = String(getDynamicOpenAIKey(userId) || '').trim();
    const envKey = String(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();

    // Check if the current provider is actually gemini
    const activeInfo = getActiveProvider(userId);
    const isGeminiActive = activeInfo === 'gemini';

    const hasKey = Boolean(dynamicKey || envKey);

    res.json({
      provider: 'gemini',
      configured: hasKey,
      isActive: isGeminiActive,
      source: dynamicKey ? 'dynamic' : (envKey ? 'env' : 'none'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking Gemini status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check API key status'
    });
  }
});

/**
 * POST /providers/gemini/test
 * Test Gemini API connection
 */
router.post('/gemini/test', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({
        error: 'Invalid API key',
        message: 'apiKey must be a non-empty string'
      });
    }

    // Gemini keys start with AIza
    if (!apiKey.startsWith('AIza')) {
      // Warn but don't block, in case format changes
      console.warn('Gemini Key format warning: Does not start with AIza');
    }

    const testProvider = new GeminiProvider(apiKey);

    // Simple test chat
    await testProvider.chatComplete([{ role: 'user', content: 'Hi' }]);

    res.json({
      success: true,
      message: 'Gemini API connection successful',
      modelsAvailable: true,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing Gemini API:', error);

    let errorMessage = 'Failed to connect to Gemini API';
    if (error.status === 401 || error.message?.includes('API key')) {
      errorMessage = 'Invalid API key';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded';
    }

    res.status(error.status || 500).json({
      error: 'API connection failed',
      message: errorMessage,
      details: error.message
    });
  }
});

/**
 * POST /providers/clear
 * Clear all provider configurations
 */
router.post('/clear', (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (userId) {
      setDynamicOpenAIKey(userId, '');
    }

    res.json({
      success: true,
      message: 'Provider configuration cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing providers:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to clear provider configurations'
    });
  }
});

export default router;
