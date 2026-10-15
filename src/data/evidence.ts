// Evidence labels used on every card, table row and result in the app.
export type EvidenceKind =
  | 'published'
  | 'internal'
  | 'assumption'
  | 'calculated'
  | 'proposed'
  | 'missing';

export const EVIDENCE: Record<EvidenceKind, { label: string; tone: string; description: string }> = {
  published: {
    label: 'Published source',
    tone: 'published',
    description: 'Supported by a linked provider, operator or distribution-partner page.',
  },
  internal: {
    label: 'Internal observation',
    tone: 'internal',
    description: 'Reported by our team, not independently verified.',
  },
  assumption: {
    label: 'Illustrative assumption',
    tone: 'assumption',
    description: 'Entered solely to demonstrate calculations.',
  },
  calculated: {
    label: 'Calculated result',
    tone: 'calculated',
    description: 'Computed from explicitly displayed inputs.',
  },
  proposed: {
    label: 'Proposed design',
    tone: 'proposed',
    description: 'A recommendation, not an established competitor practice.',
  },
  missing: {
    label: 'Missing data',
    tone: 'missing',
    description: 'Required information has not been supplied.',
  },
};

export const EVIDENCE_ORDER: EvidenceKind[] = [
  'published',
  'internal',
  'assumption',
  'calculated',
  'proposed',
  'missing',
];
