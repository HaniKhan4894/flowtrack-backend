/**
 * System-wide input signals for activity % and idle detection.
 * Uses Electron powerMonitor (OS-level idle time).
 */
const { powerMonitor } = require('electron');

const activityCounters = {
    mouseMovements: 0,
    clicks: 0,
    keystrokes: 0,
};

let lastSystemIdleSec = 0;

function sampleSystemActivity() {
    const systemIdle = powerMonitor.getSystemIdleTime();
    const wasIdle = lastSystemIdleSec >= 5;
    const isActive = systemIdle < 10;
    const isHighlyActive = systemIdle < 3;

    if (isHighlyActive) {
        activityCounters.mouseMovements += 4;
        activityCounters.keystrokes += 2;
        if (wasIdle) {
            activityCounters.clicks += 1;
        }
    } else if (isActive) {
        activityCounters.mouseMovements += 2;
    }

    lastSystemIdleSec = systemIdle;
    return { systemIdleSec: systemIdle, isActive, isHighlyActive };
}

function bumpActivity(type) {
    if (type === 'mousemove') activityCounters.mouseMovements += 1;
    else if (type === 'click') activityCounters.clicks += 1;
    else if (type === 'keydown') activityCounters.keystrokes += 1;
}

function getSystemIdleSeconds() {
    return powerMonitor.getSystemIdleTime();
}

function getActivityCounters() {
    return { ...activityCounters };
}

function resetActivityCounters() {
    activityCounters.mouseMovements = 0;
    activityCounters.clicks = 0;
    activityCounters.keystrokes = 0;
}

function calculateActivityLevel(counters = activityCounters) {
    const systemIdle = powerMonitor.getSystemIdleTime();
    const inputScore = Math.min(
        100,
        Math.round((counters.mouseMovements + counters.clicks * 5 + counters.keystrokes * 3) / 8),
    );
    const systemScore =
        systemIdle < 3 ? 90 :
        systemIdle < 15 ? 65 :
        systemIdle < 60 ? 35 :
        systemIdle < 180 ? 15 : 5;

    return Math.min(100, Math.round(inputScore * 0.55 + systemScore * 0.45));
}

function init() {
    resetActivityCounters();
    lastSystemIdleSec = powerMonitor.getSystemIdleTime();
}

function shutdown() {
    resetActivityCounters();
    lastSystemIdleSec = 0;
}

module.exports = {
    init,
    shutdown,
    sampleSystemActivity,
    bumpActivity,
    getSystemIdleSeconds,
    getActivityCounters,
    resetActivityCounters,
    calculateActivityLevel,
};
