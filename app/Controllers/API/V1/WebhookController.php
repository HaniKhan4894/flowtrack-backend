<?php

namespace App\Controllers\API\V1;

use App\Services\WebhookService;
use CodeIgniter\RESTful\ResourceController;

class WebhookController extends ResourceController
{
    protected $format = 'json';
    protected WebhookService $service;

    public function __construct()
    {
        $this->service = new WebhookService();
    }

    /** GET /api/v1/developer/webhooks */
    public function index()
    {
        try {
            return $this->respond([
                'success' => true,
                'data' => [
                    'endpoints' => $this->service->list($this->orgId()),
                    'events'    => WebhookService::EVENTS,
                ],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** POST /api/v1/developer/webhooks  { url, events[] } */
    public function create()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];
            $events = is_array($body['events'] ?? null) ? $body['events'] : [];
            $result = $this->service->create($orgId, $userId, (string) ($body['url'] ?? ''), $events);
            return $this->respondCreated([
                'success' => true,
                'message' => 'Webhook created. Store the signing secret securely.',
                'data' => $result,
            ]);
        } catch (\InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** POST /api/v1/developer/webhooks/(:num)/test */
    public function test($id = null)
    {
        try {
            $result = $this->service->test($this->orgId(), (int) $id);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /** DELETE /api/v1/developer/webhooks/(:num) */
    public function delete($id = null)
    {
        try {
            $this->service->delete($this->orgId(), (int) $id);
            return $this->respond(['success' => true, 'message' => 'Webhook deleted']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }

    private function context(): array
    {
        return [$this->orgId(), (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0)];
    }
}
