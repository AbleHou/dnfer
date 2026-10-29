import DnfSelect from './DnfSelect.vue';
export { DnfSelect };
import type { DnfOption } from '../../types';
export type DnfSelectProps<T extends DnfOption = DnfOption> = Parameters<typeof DnfSelect<T>>[0];
