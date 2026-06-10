import fs from 'fs';
import path from 'path';
import { generate } from '../utils/gemini';
import { logger } from '../utils/logger';

export async function parseResume(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  logger.debug('Parsing resume', { ext });

  if (ext === '.pdf') {
    const pdfParse = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse.default(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// Must be called on raw (pre-stripPII) text — emails are replaced with [EMAIL] after stripping.
export function extractEmail(rawText: string): string | null {
  const match = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

export async function extractCandidateName(rawText: string): Promise<string> {
  try {
    const raw = await generate(
      'You are a resume parser. Return only valid JSON, no markdown.',
      `Extract the candidate full name from the resume below.\nReturn ONLY: {"name": "Full Name"}\nIf not found, return {"name": "Candidate"}.\n\nRESUME:\n${rawText.slice(0, 1500)}`,
      256
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return parsed.name || 'Candidate';
  } catch {
    return 'Candidate';
  }
}

export interface PiiReport {
  emails:    string[];
  phones:    string[];
  linkedins: string[];
  githubs:   string[];
}

export function stripPIIWithReport(text: string): { cleanText: string; report: PiiReport } {
  const emails: string[]    = [];
  const phones: string[]    = [];
  const linkedins: string[] = [];
  const githubs: string[]   = [];

  const cleanText = text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (m) => { emails.push(m); return '[EMAIL]'; })
    .replace(/(\+?[\d\s\-\(\)]{10,})/g, (m) => { const t = m.trim(); if (t) phones.push(t); return '[PHONE]'; })
    .replace(/linkedin\.com\/in\/[\w-]+/gi, (m) => { linkedins.push(m); return '[LINKEDIN]'; })
    .replace(/github\.com\/[\w-]+/gi, (m) => { githubs.push(m); return '[GITHUB]'; });

  return { cleanText, report: { emails, phones, linkedins, githubs } };
}

export function stripPII(text: string): string {
  return stripPIIWithReport(text).cleanText;
}
