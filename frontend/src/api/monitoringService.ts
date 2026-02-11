import client from './client';

let monitoringInterval: any = null;
let activityData = {
    mouseMovement: 0,
    clicks: 0,
    keystrokes: 0,
    lastApp: 'FlowTrack Web',
    lastTitle: document.title
};

// Event listeners for activity tracking
const trackActivity = () => {
    window.addEventListener('mousemove', () => activityData.mouseMovement++);
    window.addEventListener('click', () => activityData.clicks++);
    window.addEventListener('keydown', () => activityData.keystrokes++);
};

export const monitoringService = {
    startMonitoring: (timeEntryId: number) => {
        if (monitoringInterval) return;

        trackActivity();

        // 1. Activity Logging (Every 1 minute)
        monitoringInterval = setInterval(async () => {
            try {
                const logData = {
                    time_entry_id: timeEntryId,
                    app_name: activityData.lastApp,
                    window_title: document.title,
                    mouse_movement: activityData.mouseMovement,
                    mouse_clicks: activityData.clicks,
                    keyboard_strokes: activityData.keystrokes,
                    logged_at: new Date().toISOString()
                };

                await client.post('/activity-logs/sync', logData);

                // Reset counters
                activityData.mouseMovement = 0;
                activityData.clicks = 0;
                activityData.keystrokes = 0;

            } catch (error) {
                console.error('Monitoring Error:', error);
            }
        }, 60000); // 1 minute intervals for demo, usually 5-10 mins

        // 2. Screenshot Capture (Every 3 minutes for simulation)
        const screenshotInterval = setInterval(async () => {
            try {
                // In a browser, we simulate screenshots for the SaaS demo
                // or use html2canvas if we wanted a real "web app" screenshot.
                // For now, we'll send a signal to the backend to "generate" or "store" a capture.

                const formData = new FormData();
                formData.append('time_entry_id', timeEntryId.toString());
                formData.append('activity_level', Math.floor(Math.random() * 100).toString());

                // Generate a dummy screenshot using canvas
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 180;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#1e293b';
                    ctx.fillRect(0, 0, 320, 180);
                    ctx.fillStyle = '#3b82f6';
                    ctx.font = '12px Arial';
                    ctx.fillText('FlowTrack Screenshot Capture', 20, 40);
                    ctx.fillText(new Date().toLocaleTimeString(), 20, 60);
                }

                const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg'));
                formData.append('screenshot', blob, 'screenshot.jpg');

                await client.post(`/screenshots/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

            } catch (error) {
                console.error('Screenshot Error:', error);
            }
        }, 180000); // 3 minutes

        return () => {
            clearInterval(monitoringInterval);
            clearInterval(screenshotInterval);
            monitoringInterval = null;
        };
    },

    stopMonitoring: () => {
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
            monitoringInterval = null;
        }
    }
};
