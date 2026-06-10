const NOISE_WORDS = [
  'resume', 'cv', 'curriculum', 'vitae',
  'test', 'final', 'draft', 'copy', 'new',
  'updated', 'latest', 'version', 'sample',
  'upload', 'doc', 'file', 'candidate',
  'application', 'apply', 'job', 'hire',
];

const NOISE_PATTERN = new RegExp(`\\b(${NOISE_WORDS.join('|')})\\b`, 'gi');

export function cleanCandidateName(fileName: string): string {
  // Strip extension
  let name = fileName.replace(/\.[^/.]+$/, '');

  // Replace underscores and hyphens with spaces
  name = name.replace(/[_\-]/g, ' ');

  // Remove noise words
  name = name.replace(NOISE_PATTERN, '');

  // Remove numeric sequences
  name = name.replace(/\b\d+\b/g, '');

  // Remove non-alpha characters except spaces
  name = name.replace(/[^a-zA-Z\s]/g, '');

  // Collapse multiple spaces and trim
  name = name.replace(/\s+/g, ' ').trim();

  // Title-case each word
  name = name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return name || 'Candidate';
}
