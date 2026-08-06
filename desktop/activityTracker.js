/**
 * Foreground app polling (5s) with per-tab segments.
 * Live snapshot for the tracker UI; durable disk queue; ACK-only flush to backend.
 */
const fs = require('fs');
const path = require('path');
const { sessionAppLabel } = require('./browserTabName');
const crypto = require('crypto');
const systemInput = require('./systemInput');

const POLL_MS = 5000;
const SYNC_MS = 60 * 1000;
/** Soft cap — drop oldest finalized segments if exceeded. */
const MAX_QUEUE_SEGMENTS = 500;

/** Poll counts as idle only when OS idle time is at least this many seconds. */
let activityIdleThresholdSec = 60;

let pollTimer = null;
let syncTimer = null;
let currentSegment = null;
/** @type {Array<Record<string, unknown>>} */
let pendingSegments = [];
let pollCountSinceAck = 0;
let activePollCountSinceAck = 0;
let deps = null;
let queueFilePath = null;
let lastSyncAt = null;
let lastSyncError = null;
let syncInFlight = false;

function newClientId() {
    return crypto.randomUUID();
}

function setQueuePath(filePath) {
    queueFilePath = filePath || null;
}

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

function persistQueue() {
    if (!queueFilePath) return;
    try {
        const dir = path.dirname(queueFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(
            queueFilePath,
            JSON.stringify({ version: 1, segments: pendingSegments }),
            'utf8',
        );
    } catch (err) {
        console.error('[ActivityTracker] Failed to persist queue:', err.message);
    }
}

function loadQueue() {
    if (!queueFilePath || !fs.existsSync(queueFilePath)) return;
    try {
        const raw = fs.readFileSync(queueFilePath, 'utf8');
        const data = JSON.parse(raw);
        const segs = Array.isArray(data?.segments) ? data.segments : [];
        pendingSegments = segs
            .filter((s) => s && typeof s === 'object' && (s.duration_seconds || 0) > 0)
            .map((s) => ({
                ...s,
                client_id: s.client_id || newClientId(),
            }));
        if (pendingSegments.length > 0) {
            console.log(`[ActivityTracker] Loaded ${pendingSegments.length} queued segment(s) from disk.`);
        }
    } catch (err) {
        console.error('[ActivityTracker] Failed to load queue:', err.message);
        pendingSegments = [];
    }
}

function trimQueue() {
    if (pendingSegments.length <= MAX_QUEUE_SEGMENTS) return;
    const drop = pendingSegments.length - MAX_QUEUE_SEGMENTS;
    pendingSegments = pendingSegments.slice(drop);
    console.warn(`[ActivityTracker] Queue over cap — dropped ${drop} oldest segment(s).`);
}

function emitLiveUpdate() {
    if (typeof deps?.onLiveUpdate === 'function') {
        try {
            deps.onLiveUpdate(getLiveSnapshot());
        } catch (err) {
            console.error('[ActivityTracker] onLiveUpdate error:', err.message);
        }
    }
}

function finalizeCurrentSegment() {
    if (!currentSegment) return;
    if (!isInternalApp(currentSegment.app_name, currentSegment.window_title)) {
        pendingSegments.push({
            ...currentSegment,
            client_id: currentSegment.client_id || newClientId(),
        });
        trimQueue();
        persistQueue();
    }
    currentSegment = null;
}

function mergeSegments(segments) {
    const map = new Map();
    for (const seg of segments) {
        const key = segmentKey(seg);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, {
                ...seg,
                client_ids: [seg.client_id].filter(Boolean),
            });
            continue;
        }
        existing.duration_seconds += seg.duration_seconds || 0;
        existing.mouse_movement += seg.mouse_movement || 0;
        existing.mouse_clicks += seg.mouse_clicks || 0;
        existing.keyboard_strokes += seg.keyboard_strokes || 0;
        existing.active_seconds += seg.active_seconds || 0;
        if (seg.client_id) existing.client_ids.push(seg.client_id);
    }
    return Array.from(map.values()).filter((s) => (s.duration_seconds || 0) > 0);
}

async function pollForeground() {
    if (!deps) return;

    const sample = systemInput.sampleSystemActivity();
    pollCountSinceAck += 1;
    if (sample.systemIdleSec < activityIdleThresholdSec) {
        activePollCountSinceAck += 1;
    }

    const { appName, windowTitle } = await deps.getForegroundApp();
    if (isInternalApp(appName, windowTitle)) {
        finalizeCurrentSegment();
        emitLiveUpdate();
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
            client_id: newClientId(),
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
        emitLiveUpdate();
        return;
    }

    currentSegment.duration_seconds += pollSec;
    currentSegment.mouse_movement += inputBump.mouse_movement;
    currentSegment.mouse_clicks += inputBump.mouse_clicks;
    currentSegment.keyboard_strokes += inputBump.keyboard_strokes;
    currentSegment.active_seconds += inputBump.active_seconds;
    emitLiveUpdate();
}

/**
 * Build sync payload WITHOUT removing segments. Caller must acknowledgeSync on 2xx.
 */
function prepareSyncPayload(timeEntryId) {
    if (syncInFlight) {
        return {
            payload: {
                time_entry_id: timeEntryId,
                logs: [],
                idle_seconds: 0,
                active_seconds: 0,
            },
            clientIds: [],
            pollSnapshot: null,
            hadInputCounters: false,
            skipped: true,
        };
    }

    finalizeCurrentSegment();

    const batch = pendingSegments.slice();
    const clientIds = batch.map((s) => s.client_id).filter(Boolean);
    const merged = mergeSegments(batch);

    const pollsThisWindow = pollCountSinceAck;
    const activePollsThisWindow = activePollCountSinceAck;
    const pollIntervalSec = Math.round(POLL_MS / 1000);
    const syncIntervalSec = Math.round(SYNC_MS / 1000);
    const idleSeconds = Math.min(
        syncIntervalSec * 10,
        Math.max(0, (pollsThisWindow - activePollsThisWindow) * pollIntervalSec),
    );
    const activeSeconds = Math.min(
        syncIntervalSec * 10,
        Math.max(0, activePollsThisWindow * pollIntervalSec),
    );

    const counters = systemInput.getActivityCounters();

    const logs = merged.map((seg) => ({
        app_name: seg.app_name,
        window_title: seg.window_title,
        url: seg.url || '',
        duration_seconds: seg.duration_seconds,
        mouse_movement: seg.mouse_movement || 0,
        mouse_clicks: seg.mouse_clicks || 0,
        keyboard_strokes: seg.keyboard_strokes || 0,
        logged_at: seg.logged_at || new Date().toISOString(),
        metadata: deps?.detectSensitiveApp
            ? deps.detectSensitiveApp(seg.app_name, seg.window_title)
            : undefined,
        client_id: (seg.client_ids && seg.client_ids[0]) || undefined,
    }));

    if (logs.length > 0 && (counters.mouseMovements || counters.clicks || counters.keystrokes)) {
        const totalDur = logs.reduce((sum, l) => sum + l.duration_seconds, 0) || 1;
        for (const log of logs) {
            const ratio = log.duration_seconds / totalDur;
            log.mouse_movement += Math.round(counters.mouseMovements * ratio);
            log.mouse_clicks += Math.round(counters.clicks * ratio);
            log.keyboard_strokes += Math.round(counters.keystrokes * ratio);
        }
    }

    syncInFlight = logs.length > 0 || idleSeconds > 0 || activeSeconds > 0;
    if (syncInFlight) {
        emitLiveUpdate();
    }

    return {
        payload: {
            time_entry_id: timeEntryId,
            logs,
            idle_seconds: idleSeconds,
            active_seconds: activeSeconds,
        },
        clientIds,
        pollSnapshot: {
            pollCount: pollsThisWindow,
            activePollCount: activePollsThisWindow,
        },
        hadInputCounters: !!(counters.mouseMovements || counters.clicks || counters.keystrokes),
        skipped: false,
    };
}

/** @deprecated Use prepareSyncPayload + acknowledgeSync — kept for callers that expect the old name. */
function buildSyncPayload(timeEntryId) {
    const prepared = prepareSyncPayload(timeEntryId);
    // Legacy callers cleared immediately; that drops data on failure. Prefer prepare+ack.
    return prepared.payload;
}

function acknowledgeSync(clientIds, pollSnapshot = null, options = {}) {
    const idSet = new Set((clientIds || []).filter(Boolean));
    if (idSet.size > 0) {
        pendingSegments = pendingSegments.filter((s) => !idSet.has(s.client_id));
        persistQueue();
    }

    if (pollSnapshot) {
        pollCountSinceAck = Math.max(0, pollCountSinceAck - (pollSnapshot.pollCount || 0));
        activePollCountSinceAck = Math.max(
            0,
            activePollCountSinceAck - (pollSnapshot.activePollCount || 0),
        );
    }

    if (options.resetInputCounters !== false) {
        systemInput.resetActivityCounters();
    }

    lastSyncAt = Date.now();
    lastSyncError = null;
    syncInFlight = false;
    emitLiveUpdate();
}

function markSyncFailed(message) {
    lastSyncError = message || 'Sync failed';
    syncInFlight = false;
    emitLiveUpdate();
}

function getSessionTopApps() {
    const segments = [...pendingSegments];
    if (currentSegment && !isInternalApp(currentSegment.app_name, currentSegment.window_title)) {
        segments.push({ ...currentSegment });
    }
    if (segments.length === 0) return [];

    const map = new Map();
    for (const seg of segments) {
        const name = sessionAppLabel(seg);
        map.set(name, (map.get(name) || 0) + (Number(seg.duration_seconds) || 0));
    }
    const total = [...map.values()].reduce((sum, v) => sum + v, 0) || 1;
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([app_name, duration_seconds]) => ({
            app_name,
            duration_seconds,
            percentage: Math.round((duration_seconds / total) * 100),
        }));
}

function getLiveSnapshot() {
    const idleSec = systemInput.getSystemIdleSeconds();
    const softIdle = idleSec >= activityIdleThresholdSec;
    const queuedSeconds = pendingSegments.reduce(
        (sum, s) => sum + (Number(s.duration_seconds) || 0),
        0,
    ) + (currentSegment ? (Number(currentSegment.duration_seconds) || 0) : 0);

    return {
        tracking: !!pollTimer,
        current: currentSegment
            ? {
                app_name: currentSegment.app_name,
                window_title: currentSegment.window_title,
                url: currentSegment.url || '',
                duration_seconds: currentSegment.duration_seconds || 0,
            }
            : null,
        session_apps: getSessionTopApps(),
        soft_idle: softIdle,
        system_idle_seconds: idleSec,
        pending_count: pendingSegments.length + (currentSegment ? 1 : 0),
        queued_seconds: queuedSeconds,
        last_sync_at: lastSyncAt,
        last_sync_error: lastSyncError,
        sync_in_flight: syncInFlight,
    };
}

function start(dependencies) {
    deps = dependencies;
    if (dependencies?.queuePath) {
        setQueuePath(dependencies.queuePath);
    }
    systemInput.init();
    stopTimersOnly();
    loadQueue();

    pollTimer = setInterval(() => {
        pollForeground().catch((err) => console.error('[ActivityTracker] Poll error:', err.message));
    }, POLL_MS);

    syncTimer = setInterval(() => {
        if (deps?.onSync) {
            deps.onSync().catch((err) => console.error('[ActivityTracker] Sync error:', err.message));
        }
    }, SYNC_MS);

    pollForeground().catch(() => undefined);
    emitLiveUpdate();
    console.log(
        `[ActivityTracker] Polling every ${Math.round(POLL_MS / 1000)}s, `
        + `syncing every ${SYNC_MS / 1000}s, activity-idle≥${activityIdleThresholdSec}s`
        + (queueFilePath ? `, queue=${queueFilePath}` : ''),
    );
}

function stopTimersOnly() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
}

/**
 * Stop polling/sync timers. Finalizes the open segment into the durable queue.
 * Does NOT clear the queue — pending work survives pause/stop/crash until ACK.
 */
function stop() {
    stopTimersOnly();
    finalizeCurrentSegment();
    currentSegment = null;
    syncInFlight = false;
    systemInput.shutdown();
    emitLiveUpdate();
}

function getScreenshotActivityLevel() {
    const counters = systemInput.getActivityCounters();
    const base = systemInput.calculateActivityLevel(counters);
    const polls = Math.max(pollCountSinceAck, 1);
    const sessionRatio = activePollCountSinceAck / polls;
    const sessionScore = Math.round(sessionRatio * 100);
    return Math.min(100, Math.round(base * 0.55 + sessionScore * 0.45));
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
    setQueuePath,
    setActivityIdleThreshold,
    prepareSyncPayload,
    buildSyncPayload,
    acknowledgeSync,
    markSyncFailed,
    getLiveSnapshot,
    getScreenshotActivityLevel,
    getLastInputTimestamp,
};
