import { db } from './db';
import { logger } from './logger';

// ── Hardcoded defaults (backward-compat + DB fallback) ────────────────────────
export const NULOGIC_CONTEXT = {
  name: 'NULogic',
  website: 'https://www.nulogic.io',
  tagline: 'Digital Commerce & Transformation Experts',
  overview: `NULogic is a digital commerce and transformation company with over 17 years \
in business, 250+ experts, and 40+ global clients. We are engineers at heart, crafting \
cutting-edge solutions with a mindset rooted in scalability, reliability, and innovation. \
Global businesses — including Sephora, Reebok, UPPAbaby, Eddie Bauer, and Pokémon — choose \
NULogic to build, transform, and optimize their digital experiences. Our services span \
Digital Commerce, Cloud Infrastructure, Data & AI, Enterprise Integration, Experience Design, \
and Managed Services. We combine cloud engineering, AI, and automation to help enterprises \
modernize faster — reducing costs while increasing speed to market.`,
  services: [
    'Digital Commerce', 'Cloud Infrastructure', 'Data & AI',
    'Enterprise Integration', 'Experience Design', 'Managed Services', 'Agentic Commerce',
  ],
  stats: { yearsInBusiness: 17, experts: 250, certifications: 180, clients: 40, locations: 5 },
  contact: { email: 'talent@nulogic.io', phone: '+1 (469) 922-6985' },
  recruiter_name: 'Alex Morgan',
} as const;

// ── Dynamic context type passed to every AI agent ─────────────────────────────

export interface CompanyContext {
  name: string;
  tagline: string;
  overview: string;
  industry: string;
  workMode: string;
  techStack: string[];
  services: string[];
  cultureValues: string[];
  benefits: string[];
  contactEmail: string;
  recruiterName: string;
}

export const DEFAULT_CONTEXT: CompanyContext = {
  name: NULOGIC_CONTEXT.name,
  tagline: NULOGIC_CONTEXT.tagline,
  overview: NULOGIC_CONTEXT.overview,
  industry: 'Technology',
  workMode: 'hybrid',
  techStack: ['React', 'Node.js', 'TypeScript', 'AWS'],
  services: [...NULOGIC_CONTEXT.services],
  cultureValues: ['Engineering-first', 'Innovation-driven', 'Customer-centric'],
  benefits: ['Competitive salary', 'Health insurance', 'Learning budget', 'Flexible PTO'],
  contactEmail: NULOGIC_CONTEXT.contact.email,
  recruiterName: NULOGIC_CONTEXT.recruiter_name,
};

// ── Fetch live context from DB, fall back to defaults on any error ─────────────

export async function getCompanyContext(): Promise<CompanyContext> {
  try {
    const result = await db.query(`SELECT * FROM company_profile LIMIT 1`);
    const row = result.rows[0];
    if (!row) return DEFAULT_CONTEXT;

    return {
      name:          row.name          || DEFAULT_CONTEXT.name,
      tagline:       row.tagline       || DEFAULT_CONTEXT.tagline,
      overview:      row.overview      || DEFAULT_CONTEXT.overview,
      industry:      row.industry      || DEFAULT_CONTEXT.industry,
      workMode:      row.work_mode     || DEFAULT_CONTEXT.workMode,
      techStack:     Array.isArray(row.tech_stack)    ? row.tech_stack    : DEFAULT_CONTEXT.techStack,
      services:      Array.isArray(row.services)      ? row.services      : DEFAULT_CONTEXT.services,
      cultureValues: Array.isArray(row.culture_values)? row.culture_values: DEFAULT_CONTEXT.cultureValues,
      benefits:      Array.isArray(row.benefits)      ? row.benefits      : DEFAULT_CONTEXT.benefits,
      contactEmail:  row.contact_email || DEFAULT_CONTEXT.contactEmail,
      recruiterName: row.recruiter_name|| DEFAULT_CONTEXT.recruiterName,
    };
  } catch (err) {
    logger.warn('getCompanyContext: DB error, using defaults', { err });
    return DEFAULT_CONTEXT;
  }
}
