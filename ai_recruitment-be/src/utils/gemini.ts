import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required in .env');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const MODEL_NAME = 'gemini-2.5-flash';

export function getModel() {
  return genAI.getGenerativeModel({ model: MODEL_NAME });
}

/**
 * Simple helper — send a prompt, get text back
 */
export async function generate(
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 4096
): Promise<string> {
  const model = getModel();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens,
    },
  });
  return result.response.text();
}
