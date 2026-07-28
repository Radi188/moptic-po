export type Branch = {
  id: string;
  name: string;
  location: string;
  /** Short ASCII code for the branch — used where Khmer text can't safely travel (e.g. filenames). */
  code: string;
};

/**
 * Branch list shown in the login picker. The `id` matches the backend branch id
 * (sent as `branch` in the /login payload).
 */
export const BRANCHES: Branch[] = [
  { id: '10', name: 'សាខាបាក់ទូក', location: 'Phnom Penh', code: 'BT' },
  { id: '11', name: 'សាខាសន្ធរមុខ', location: 'Phnom Penh', code: 'STM' },
  { id: '12', name: 'សាខាស៊ីសុវត្ថិ', location: 'Phnom Penh', code: 'SSW' },
  { id: '13', name: 'សាខាonline', location: 'Phnom Penh', code: 'STMC' },
  { id: '14', name: 'សាខាប៉េងហួត', location: 'Phnom Penh', code: 'PH' },
  { id: '15', name: 'សាខាតាខ្មៅ', location: 'Phnom Penh', code: 'TK' },
  { id: '17', name: 'សាខាចោមចៅ', location: 'ចោមចៅ', code: 'CC' },
];

/** Look up a branch's short ASCII code by id; falls back to the id itself. */
export function branchCode(id: string): string {
  return BRANCHES.find((b) => b.id === id)?.code ?? id;
}
