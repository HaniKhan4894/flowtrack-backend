/**
 * Foreground app polling (5s) with per-tab segments, flushed to backend every 60s.
 *
 * Idle/active for Analytics uses a soft OS-idle threshold (default 60s), not a 10s
 * flicker — short typing pauses must not inflate "Idle Breakdown".
 */
const systemInput = require('./systemInput');

const POLL_MS = 5000;
const SYNC_MS = 60 * 1000;
/** Poll counts as idle only when OS idle time is at least this many seconds. */
let activityIdleThresholdSec = 60;

let pollTimer = null;
let syncTimer = null;
let currentSegment = null;
let pendingSegments = [];
let pollCount = 0;
let activePollCount = 0;
let deps = null;

function setActivityIdleThreshold(seconds) {
    const n = Number(seconds);
    activityIdleThresholdSec = Number.isFinite(n)
        ? Math.max(15, Math.min(300, Math.round(n)))
        : 60;
}

function segmentKey(seg) {
    return `${seg.app_name}||${seg.window_title}||${seg.url || ''}`;
}

function isInternalApp(appName, windowTitle = '') {
    if (!deps?.isInternalTrackerApp) return false;
    return deps.isInternalTrackerApp(appName, windowTitle);
}

function finalizeCurrentSegment() {
    if (!currentSegment) return;
    if (!isInternalApp(currentSegment.app_name, currentSegment.window_title)) {
        pendingSegments.push({ ...currentSegment });
    }
    currentSegment = null;
}

function mergeSegments(segments) {
    const map = new Map();
    for (const seg of segments) {
        const key = segmentKey(seg);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { ...seg });
            continue;
        }
        existing.duration_seconds += seg.duration_seconds || 0;
        existing.mouse_movement += seg.mouse_movement || 0;
        existing.mouse_clicks += seg.mouse_clicks || 0;
        existing.keyboard_strokes += seg.keyboard_strokes || 0;
        existing.active_seconds += seg.active_seconds || 0;
    }
    return Array.from(map.values()).filter((s) => (s.duration_seconds || 0) > 0);
}

async function pollForeground() {
    if (!deps) return;

    const sample = systemInput.sampleSystemActivity();
    pollCount += 1;
    // Soft threshold: brief gaps between keystrokes stay "active".
    if (sample.systemIdleSec < activityIdleThresholdSec) {
        activePollCount += 1;
    }

    const { appName, windowTitle } = await deps.getForegroundApp();
    if (isInternalApp(appName, windowTitle)) {
        finalizeCurrentSegment();
        return;
    }

    const url = deps.extractUrlFromTitle(windowTitle, appName);
    const pollSec = Math.round(POLL_MS / 1000);
    const pollIsActive = sample.systemIdleSec < activityIdleThresholdSec;

    const inputBump = {
        mouse_movement: sample.isHighlyActive ? 3 : pollIsActive ? 1 : 0,
        mouse_clicks: 0,
        keyboard_strokes: sample.isHighlyActive ? 2 : 0,
        active_seconds: pollIsActive ? pollSec : 0,
    };

    if (
        !currentSegment ||
        currentSegment.app_name !== appName ||
        currentSegment.window_title !== windowTitle ||
        (currentSegment.url || '') !== (url || '')
    ) {
        finalizeCurrentSegment();
        currentSegment = {
            app_name: appName,
            window_title: windowTitle,
            url: url || '',
            duration_seconds: pollSec,
            mouse_movement: inputBump.mouse_movement,
            mouse_clicks: inputBump.mouse_clicks,
            keyboard_strokes: inputBump.keyboard_strokes,
            active_seconds: inputBump.active_seconds,
            logged_at: new Date().toISOString(),
        };
        return;
    }

    currentSegment.duration_seconds += pollSec;
    currentSegment.mouse_movement += inputBump.mouse_movement;
    currentSegment.mouse_clicks += inputBump.mouse_clicks;
    currentSegment.keyboard_strokes += inputBump.keyboard_strokes;
    currentSegment.active_seconds += inputBump.active_seconds;
}

function buildSyncPayload(timeEntryId) {
    finalizeCurrentSegment();
    const merged = mergeSegments(pendingSegments);
    pendingSegments = [];

    // Capture before reset — previously counters were zeroed first so every sync
    // reported ~60s idle / 0s active and Analytics "Idle Breakdown" inflated.
    const pollsThisWindow = pollCount;
    const activePollsThisWindow = activePollCount;
    pollCount = 0;
    activePollCount = 0;

    const counters = systemInput.getActivityCounters();
    const pollIntervalSec = Math.round(POLL_MS / 1000);
    const syncIntervalSec = Math.round(SYNC_MS / 1000);
    const idleSeconds = Math.min(
        syncIntervalSec,
        Math.max(0, (pollsThisWindow - activePollsThisWindow) * pollIntervalSec),
    );
    const activeSeconds = Math.min(
        syncIntervalSec,
        Math.max(0, activePollsThisWindow * pollIntervalSec),
    );

    const logs = merged.map((seg) => ({
        app_name: seg.app_name,
        window_title: seg.window_title,
        url: seg.url || '',
        duration_seconds: seg.duration_seconds,
        mouse_movement: seg.mouse_movement || 0,
        mouse_clicks: seg.mouse_clicks || 0,
        keyboard_strokes: seg.keyboard_strokes || 0,
        logged_at: seg.logged_at || new Date().toISOString(),
        metadata: deps.detectSensitiveApp(seg.app_name, seg.window_title),
    }));

    // Distribute shared input counters across segments proportionally
    if (logs.length > 0 && (counters.mouseMovements || counters.clicks || counters.keystrokes)) {
        const totalDur = logs.reduce((sum, l) => sum + l.duration_seconds, 0) || 1;
        for (const log of logs) {
            const ratio = log.duration_seconds / totalDur;
            log.mouse_movement += Math.round(counters.mouseMovements * ratio);
            log.mouse_clicks += Math.round(counters.clicks * ratio);
            log.keyboard_strokes += Math.round(counters.keystrokes * ratio);
        }
    }

    systemInput.resetActivityCounters();

    return {
        time_entry_id: timeEntryId,
        logs,
        idle_seconds: idleSeconds,
        active_seconds: activeSeconds,
    };
}

function start(dependencies) {
    deps = dependencies;
    systemInput.init();
    stop();

    pollTimer = setInterval(() => {
        pollForeground().catch((err) => console.error('[ActivityTracker] Poll error:', err.message));
    }, POLL_MS);

    syncTimer = setInterval(() => {
        if (deps?.onSync) {
            deps.onSync().catch((err) => console.error('[ActivityTracker] Sync error:', err.message));
        }
    }, SYNC_MS);

    // Immediate first poll
    pollForeground().catch(() => undefined);
    console.log(
        `[ActivityTracker] Polling every ${Math.round(POLL_MS / 1000)}s, `
        + `syncing every ${SYNC_MS / 1000}s, activity-idle≥${activityIdleThresholdSec}s.`,
    );
}

function stop() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    finalizeCurrentSegment();
    pendingSegments = [];
    currentSegment = null;
    pollCount = 0;
    activePollCount = 0;
    systemInput.shutdown();
}

function getScreenshotActivityLevel() {
    return systemInput.calculateActivityLevel();
}

function getLastInputTimestamp() {
    const idleSec = systemInput.getSystemIdleSeconds();
    return Date.now() - idleSec * 1000;
}

module.exports = {
    POLL_MS,
    SYNC_MS,
    start,
    stop,
    setActivityIdleThreshold,
    buildSyncPayload,
    getScreenshotActivityLevel,
    getLastInputTimestamp,
};
