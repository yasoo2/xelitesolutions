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

    // Set the dynamic API key
    setDynamicOpenAIKey(apiKey);

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
    const dynamicKey = String(getDynamicOpenAIKey() || '').trim();
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

    // Set the key temporarily for testing
    setDynamicOpenAIKey(apiKey);

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

/**
 * POST /providers/clear
 * Clear all provider configurations
 */
router.post('/clear', (req: Request, res: Response) => {
  try {
    setDynamicOpenAIKey('');
    
    res.json({
      success: true,
      message: 'All provider configurations cleared',
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
