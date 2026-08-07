import { AcceptableTarget, UnmountFn } from "@collagejs/core";

export type CssRecord = {
    static: string[];
    dynamic: string[];
};

export type CssMap = Record<string, CssRecord>;

export interface RelocateContext { 
    mount: (target: AcceptableTarget) => Promise<UnmountFn>;
    unmount: UnmountFn | undefined;
}
