<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\MarketingCampaignService;
use CodeIgniter\Controller;

/**
 * Public email tracking endpoints (no auth — hit directly by mail clients).
 */
class TrackingController extends Controller
{
    /** Transparent 1x1 GIF. */
    private const PIXEL = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    public function open(string $token)
    {
        $token = pathinfo($token, PATHINFO_FILENAME);

        try {
            (new MarketingCampaignService())->recordOpen($token);
        } catch (\Throwable $e) {
            log_message('error', 'Campaign open tracking failed: ' . $e->getMessage());
        }

        return $this->response
            ->setHeader('Content-Type', 'image/gif')
            ->setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            ->setHeader('Pragma', 'no-cache')
            ->setBody((string) base64_decode(self::PIXEL, true));
    }

    public function click(string $token)
    {
        $encoded = (string) ($this->request->getGet('u') ?? '');
        $fallback = rtrim((string) (env('app.frontendURL') ?? 'http://localhost:5173'), '/');

        try {
            $destination = (new MarketingCampaignService())->recordClick($token, $encoded);
        } catch (\Throwable $e) {
            log_message('error', 'Campaign click tracking failed: ' . $e->getMessage());
            $destination = $fallback;
        }

        return $this->response->redirect($destination, 'auto', 302);
    }
}
