export declare const cursorDefinitions: {
    readonly normal: {
        readonly label: "正常操作";
        readonly normal: {
            readonly mode: "press";
            readonly source: "basic.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly pressed: {
            readonly mode: "press";
            readonly source: "basic_press.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [];
    };
    readonly learn: {
        readonly label: "技能学习";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "VP_leftclick.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "VP_leftclick_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [string, string];
    };
    readonly menu: {
        readonly label: "物品查看菜单 · 手形";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "seemenu.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "seemenu_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [string, string, string, string];
    };
    readonly 'menu-mouse': {
        readonly label: "查看菜单 · 鼠标按键图示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "notimenu.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "notimenu_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [string, string];
    };
    readonly lock: {
        readonly label: "锁定";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "sortlock.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly unlock: {
        readonly label: "解除锁定";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "sortunlock.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'learn-remove': {
        readonly label: "解除 · 鼠标按键图示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "VP_rightclick.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "VP_rightclick_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [string, string];
    };
    readonly 'gold-normal': {
        readonly label: "金色普通光标";
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [];
        readonly normal: {
            readonly mode: "press";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly pressed: {
            readonly mode: "press";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
    };
    readonly buy: {
        readonly label: "购买";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "buy.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly disassemble: {
        readonly label: "分解";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "dismantle.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly sell: {
        readonly label: "出售";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "sell.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly repair: {
        readonly label: "修理";
        readonly normal: {
            readonly mode: "static";
            readonly source: "repair.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string];
        readonly disabledFrames: readonly [];
    };
    readonly rent: {
        readonly label: "租赁";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "rental.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly rotate: {
        readonly label: "旋转形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "wait.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly try: {
        readonly label: "试穿";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "puton.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly checkout: {
        readonly label: "结算";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "payment.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly equip: {
        readonly label: "装入";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "tocart.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly put: {
        readonly label: "放入";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "push.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly take: {
        readonly label: "取出";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "remove.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly produce: {
        readonly label: "生产";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "produce.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly enhance: {
        readonly label: "强化";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "reinforce.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly challenge: {
        readonly label: "挑战";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "letsfight.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly enchant: {
        readonly label: "附魔";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "enchant.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'buy-now': {
        readonly label: "立即购买";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "buynow.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly bid: {
        readonly label: "竞拍";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "bid.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly cancel: {
        readonly label: "取消";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "cancel.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly reforge: {
        readonly label: "重铸";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "avatar_convert.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly purify: {
        readonly label: "净化";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "purify.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly amplify: {
        readonly label: "增幅";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "amplify.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly convert: {
        readonly label: "扭转";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "distort.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'try-alt': {
        readonly label: "试穿 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "grant.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly gift: {
        readonly label: "赠送";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "gift.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'lock-alt': {
        readonly label: "锁定 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "tradelock.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'unlock-alt': {
        readonly label: "解除锁定 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "tradeunlock.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly reform: {
        readonly label: "改造";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "chronicleupgrade.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'lock-command': {
        readonly label: "锁定指令";
        readonly pending: true;
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
        readonly normal: {
            readonly mode: "static";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
    };
    readonly remove: {
        readonly label: "解除 · 手形";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "release.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly move: {
        readonly label: "移动";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "move.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly talk: {
        readonly label: "对话形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "conv_npc.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'talk-blue': {
        readonly label: "蓝色对话形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "conv_pc.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly enter: {
        readonly label: "入口形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "enter.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly scroll: {
        readonly label: "卷轴形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "questscroll.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly effect: {
        readonly label: "旋转标记形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "fightwait.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly details: {
        readonly label: "查看详情";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "detailview.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'resize-v': {
        readonly label: "纵向调整";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "resize_vertical.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'resize-diagonal': {
        readonly label: "斜向调整";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "resize_diagonal.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [10, 10];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [10, 10];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [10, 10];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [10, 10];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly pointer: {
        readonly label: "箭头形态";
        readonly normal: {
            readonly mode: "static";
            readonly source: "diagonal.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string];
        readonly disabledFrames: readonly [];
    };
    readonly flag: {
        readonly label: "旗帜形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "teleportparty.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly hint: {
        readonly label: "提示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "register.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly forge: {
        readonly label: "锻造";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "genuine_damage_upgrade.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'forge-alt': {
        readonly label: "锻造 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "dye.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly wear: {
        readonly label: "穿戴";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "equip.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly cost: {
        readonly label: "倍率提示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "locationguide.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 30;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly upgrade: {
        readonly label: "升级";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "grow.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly animation: {
        readonly label: "替换动画";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "applyskin.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly select: {
        readonly label: "选择";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "select.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly greet: {
        readonly label: "打招呼";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "bow.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 30;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 30;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 30;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 30;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'resize-diagonal-alt': {
        readonly label: "反向斜线调整";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "resize_diagonal2.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [9, 9];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [10, 9];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [11, 9];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [11, 9];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly multi: {
        readonly label: "多选";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "multiselect.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly edit: {
        readonly label: "编辑";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "raid_match.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly return: {
        readonly label: "弯箭头形态";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "raid_move.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [];
    };
    readonly withdraw: {
        readonly label: "撤回道具";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "deselect.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly add: {
        readonly label: "添加";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "register2.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly split: {
        readonly label: "拆解";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "decomposition.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly unblock: {
        readonly label: "解除屏蔽";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "unblock.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'details-alt': {
        readonly label: "查看详情 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "web.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 24;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly wheel: {
        readonly label: "滚轮按键图示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "mousewheel.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 25;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 15;
            }];
        };
        readonly frames: readonly [string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly unseal: {
        readonly label: "人物解禁";
        readonly normal: {
            readonly mode: "static";
            readonly source: "npcbook.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string];
        readonly disabledFrames: readonly [];
    };
    readonly content: {
        readonly label: "查看内容";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "Components.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly smelt: {
        readonly label: "冶炼";
        readonly normal: {
            readonly mode: "static";
            readonly source: "selectBakalWeapon.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string];
        readonly disabledFrames: readonly [];
    };
    readonly special: {
        readonly label: "特殊效果";
        readonly normal: {
            readonly mode: "static";
            readonly source: "SpecialEffect.cur";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 0;
            }];
        };
        readonly frames: readonly [string];
        readonly disabledFrames: readonly [];
    };
    readonly copy: {
        readonly label: "复制";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "CopySkilltree.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'copy-alt': {
        readonly label: "复制 · 另一组";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "CopySkilltree_Press.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string, string, string];
        readonly disabledFrames: readonly [];
    };
    readonly 'wear-mouse': {
        readonly label: "穿戴 · 鼠标按键图示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "EquipmentSimulator.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "EquipmentSimulator_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 20;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [string, string];
    };
    readonly 'talk-mouse': {
        readonly label: "调适 · 鼠标滚轮图示";
        readonly normal: {
            readonly mode: "animation";
            readonly source: "mousewheel_tuning.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly disabled: {
            readonly mode: "animation";
            readonly source: "mousewheel_tuning_trans.ani";
            readonly steps: readonly [{
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }, {
                readonly src: string;
                readonly hotspot: readonly [0, 0];
                readonly jiffies: 10;
            }];
        };
        readonly frames: readonly [string, string];
        readonly disabledFrames: readonly [string, string];
    };
};
