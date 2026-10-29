import DnfTable from './DnfTable.vue';
export { DnfTable };
export type DnfTableProps<T extends Record<string, unknown> = Record<string, unknown>> = Parameters<typeof DnfTable<T>>[0];
