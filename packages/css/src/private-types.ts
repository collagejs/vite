import { MountFn, UnmountFn } from "@collagejs/core";

export type CssRecord = {
    static: string[];
    dynamic: string[];
};

export type CssMap = Record<string, CssRecord>;

export interface RelocateContext { 
    mount: MountFn;
    unmount: UnmountFn | undefined;
}
