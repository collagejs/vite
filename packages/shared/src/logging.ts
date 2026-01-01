import pc from "picocolors";

export const fmt = {
    url(url: string | undefined): string {
        return pc.blueBright(url);

    },
    keyword(keyword: string | undefined): string {
        return pc.cyan(keyword);
    },
    value(value: any): string {
        return pc.inverse(value);
    },
    success(text: string | undefined): string {
        return pc.bgGreen(pc.whiteBright(text));
    }
};
