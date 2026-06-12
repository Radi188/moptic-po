export type Branch = {
  id: string;
  name: string;
  location: string;
};

/**
 * Branch list shown in the login picker. The `id` matches the backend branch id
 * (sent as `branch` in the /login payload).
 */
export const BRANCHES: Branch[] = [
  { id: '10', name: 'សាខាបាក់ទូក', location: 'Phnom Penh' },
  { id: '11', name: 'សាខាសន្ធរមុខ', location: 'Phnom Penh' },
  { id: '12', name: 'សាខាស៊ីសុវត្ថិ', location: 'Phnom Penh' },
  { id: '13', name: 'សាខាonline', location: 'Phnom Penh' },
  { id: '14', name: 'សាខាប៉េងហួត', location: 'Phnom Penh' },
  { id: '15', name: 'សាខាតាខ្មៅ', location: 'Phnom Penh' },
  { id: '17', name: 'សាខាចោមចៅ', location: 'ចោមចៅ' },
];
