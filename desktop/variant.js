/** FlowTrack desktop tracker shell configuration. */
const config = {
    appUserModelId: 'com.flowtrack.tracker',
    productName: 'FlowTrack Tracker',
    width: 680,
    height: 780,
    minWidth: 560,
    minHeight: 520,
    entryPath: '/tracker/login',
    trayTooltip: 'FlowTrack Tracker — running in background',
    trayShowLabel: 'Show Tracker',
    trayExitLabel: 'Exit Tracker',
};

module.exports = {
    variant: 'tracker',
    config,
};
