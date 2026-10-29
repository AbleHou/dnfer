import DnfIconSelect from './DnfIconSelect.vue';
export { DnfIconSelect };
import type { DnfIconOption } from '../../types';
export type DnfIconSelectProps<T extends DnfIconOption = DnfIconOption> = Parameters<typeof DnfIconSelect<T>>[0];
