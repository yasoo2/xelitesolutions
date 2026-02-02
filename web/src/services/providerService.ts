/**
 * Provider Service
 * Handles communication with the providers API endpoint
 */

import { API_URL as API_BASE } from '../config';

export interface SetKeyResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export interface StatusResponse {
  provider: string;
  configured: boolean;
  timestamp: string;
}

export interface TestResponse {
  success: boolean;
  message: string;
  modelsAvailable?: boolean;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: string;
}

/**
 * Set OpenAI API key
 */
export async function setOpenAIKey(apiKey: string): Promise<SetKeyResponse> {
  try {
    const response = await fetch(`${API_BASE}/providers/openai/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.message || 'Failed to set API key');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error setting OpenAI key:', error);
    throw error;
  }
}

/**
 * Check OpenAI API key status
 */
export async function checkOpenAIStatus(): Promise<StatusResponse> {
  try {
    const response = await fetch(`${API_BASE}/providers/openai/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check API key status');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error checking OpenAI status:', error);
    throw error;
  }
}

/**
 * Test OpenAI API connection
 */
export async function testOpenAIConnection(apiKey: string): Promise<TestResponse> {
  try {
    const response = await fetch(`${API_BASE}/providers/openai/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.message || 'Failed to test API connection');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error testing OpenAI connection:', error);
    throw error;
  }
}

/**
 * Test Gemini API connection
 */
export async function testGeminiConnection(apiKey: string): Promise<TestResponse> {
  try {
    const response = await fetch(`${API_BASE}/providers/gemini/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.message || 'Failed to test Gemini connection');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error testing Gemini connection:', error);
    throw error;
  }
}

/**
 * Clear all provider configurations
 */
export async function clearProviders(): Promise<SetKeyResponse> {
  try {
    const response = await fetch(`${API_BASE}/providers/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to clear providers');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error clearing providers:', error);
    throw error;
  }
}

/**
 * Store API key in local storage (client-side only, for UI state)
 */
export function storeAPIKeyLocally(apiKey: string): void {
  try {
    localStorage.setItem('openai_api_key', apiKey);
  } catch (error) {
    console.warn('Failed to store API key locally:', error);
  }
}

/**
 * Retrieve API key from local storage (client-side only, for UI state)
 */
export function getStoredAPIKey(): string | null {
  try {
    return localStorage.getItem('openai_api_key');
  } catch (error) {
    console.warn('Failed to retrieve API key from local storage:', error);
    return null;
  }
}

/**
 * Clear stored API key from local storage
 */
export function clearStoredAPIKey(): void {
  try {
    localStorage.removeItem('openai_api_key');
  } catch (error) {
    console.warn('Failed to clear stored API key:', error);
  }
}
