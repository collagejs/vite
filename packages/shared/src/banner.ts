import pc from "picocolors";

/**
 * Displays the CollageJS banner with branding information
 */
export function showCollageBanner(): void {
    console.info('');
    console.info(pc.cyan('  ╔═══════════════════════════════════════════════╗'));
    console.info(pc.cyan('  ║') + pc.bold(pc.bgBlue(pc.white('                   CollageJS                   '))) + pc.cyan('║'));
    console.info(pc.cyan('  ║') + pc.gray('          Micro-Frontends, Made Simple         ') + pc.cyan('║'));
    console.info(pc.cyan('  ║') + '                                               ' + pc.cyan('║'));
    console.info(pc.cyan('  ║') + pc.blue('             https://collagejs.dev             ') + pc.cyan('║'));
    console.info(pc.cyan('  ╚═══════════════════════════════════════════════╝'));
    console.info('');
}
