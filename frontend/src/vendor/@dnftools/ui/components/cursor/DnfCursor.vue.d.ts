import type { DnfCursorName } from './cursors';
type __VLS_Props = {
    name?: DnfCursorName;
    frame?: number;
    disabled?: boolean;
    hotspot?: readonly [number, number];
};
declare var __VLS_1: {};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_1) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    name: "split" | "details" | "menu" | "select" | "scroll" | "cancel" | "copy" | "wheel" | "remove" | "normal" | "lock" | "gift" | "special" | "content" | "hint" | "add" | "animation" | "learn" | "menu-mouse" | "unlock" | "learn-remove" | "gold-normal" | "buy" | "disassemble" | "sell" | "repair" | "rent" | "rotate" | "try" | "checkout" | "equip" | "put" | "take" | "produce" | "enhance" | "challenge" | "enchant" | "buy-now" | "bid" | "reforge" | "purify" | "amplify" | "convert" | "try-alt" | "lock-alt" | "unlock-alt" | "reform" | "lock-command" | "move" | "talk" | "talk-blue" | "enter" | "effect" | "resize-v" | "resize-diagonal" | "pointer" | "flag" | "forge" | "forge-alt" | "wear" | "cost" | "upgrade" | "greet" | "resize-diagonal-alt" | "multi" | "edit" | "return" | "withdraw" | "unblock" | "details-alt" | "unseal" | "smelt" | "copy-alt" | "wear-mouse" | "talk-mouse";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
