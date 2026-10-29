import type { DnfTreeNode, DnfValue } from '../types';
export declare function flattenTree(nodes: DnfTreeNode[]): DnfTreeNode[];
export declare function findTreePath(nodes: DnfTreeNode[], value: DnfValue, ancestors?: DnfTreeNode[]): DnfTreeNode[];
export declare function filterTree(nodes: DnfTreeNode[], query: string): DnfTreeNode[];
