/**
 * FORGE Banner Display
 */

const ORANGE = '\x1b[38;2;249;115;22m';
const DARK = '\x1b[38;2;30;30;30m';
const DIM = '\x1b[38;2;120;80;40m';
const SPARK = '\x1b[38;2;255;200;60m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export const banner = `
${ORANGE}${BOLD}
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║    ${SPARK}       ✦  ·  ✧                                         ${ORANGE}║
    ║    ${SPARK}      ✧ · ✦  ·                                         ${ORANGE}║
    ║    ${DIM}        ╔═══╗          ${ORANGE}${BOLD} ███████╗ ██████╗  ██████╗  ██████╗ ███████╗${ORANGE}  ║
    ║    ${DIM}       ╔╝   ╚╗         ${ORANGE}${BOLD} ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝${ORANGE}  ║
    ║    ${DIM}      ╔╝ ▄█▄ ╚╗        ${ORANGE}${BOLD} █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ${ORANGE}  ║
    ║    ${DIM}     ╔╝ █████ ╚╗       ${ORANGE}${BOLD} ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ${ORANGE}  ║
    ║    ${DIM}    ╔╝ ███████ ╚╗      ${ORANGE}${BOLD} ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗${ORANGE}  ║
    ║    ${DIM}    ║ █████████ ║      ${ORANGE}${BOLD} ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝${ORANGE}  ║
    ║    ${DIM}    ╠═══════════╣      ${ORANGE}                                        ║
    ║    ${DIM}    ║ ░░░▓▓▓░░░ ║      ${SPARK}⚒  CUSTOM TOOL FACTORY                  ${ORANGE}║
    ║    ${DIM}    ╚═══════════╝                                         ${ORANGE}║
    ║                                                              ║
    ║    ${DIM}  Build MCP tools from YAML · Share via Marketplace       ${ORANGE}║
    ║    ${DIM}  Schema generation · Tool registry · MCP server          ${ORANGE}║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
${RESET}`;

export function showBanner() {
  console.log(banner);
}

if (process.argv[1] && process.argv[1].endsWith('banner.mjs')) {
  showBanner();
}

export default { banner, showBanner };
