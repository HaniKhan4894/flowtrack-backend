<?php

namespace App\Controllers\API\V1;

use App\Services\Admin\MarketingCampaignService;

/**
 * Lifecycle marketing campaigns and playbooks.
 */
class AdminCampaignController extends AdminBaseController
{
    protected MarketingCampaignService $campaigns;

    public function __construct()
    {
        $this->campaigns = new MarketingCampaignService();
    }

    public function index()
    {
        $filters = $this->queryFilters(['page', 'per_page', 'status', 'goal', 'search']);

        return $this->attempt(fn () => [
            'campaigns' => $this->campaigns->list($filters),
            'performance' => $this->campaigns->performanceSummary(),
        ]);
    }

    public function show($id = null)
    {
        $campaignId = (int) $id;

        return $this->attempt(fn () => $this->campaigns->detail($campaignId));
    }

    public function create()
    {
        return $this->attempt(
            fn () => $this->campaigns->create($this->payload(), $this->adminId()),
            'Campaign created'
        );
    }

    public function update($id = null)
    {
        $campaignId = (int) $id;

        return $this->attempt(
            fn () => $this->campaigns->update($campaignId, $this->payload(), $this->adminId()),
            'Campaign updated'
        );
    }

    public function delete($id = null)
    {
        $campaignId = (int) $id;

        return $this->attempt(function () use ($campaignId) {
            $this->campaigns->delete($campaignId, $this->adminId());

            return ['deleted' => true];
        }, 'Campaign deleted');
    }

    public function duplicate(int $campaignId)
    {
        return $this->attempt(
            fn () => $this->campaigns->duplicate($campaignId, $this->adminId()),
            'Campaign duplicated'
        );
    }

    /**
     * Audience size + sample for the segment currently chosen in the editor.
     */
    public function preview()
    {
        $data = $this->payload();
        $segment = (string) ($data['segment_key'] ?? '');
        $config = (array) ($data['segment_config'] ?? []);

        return $this->attempt(fn () => $this->campaigns->previewAudience($segment, $config));
    }

    public function send(int $campaignId)
    {
        return $this->attempt(
            fn () => $this->campaigns->dispatch($campaignId, $this->adminId()),
            'Campaign dispatched'
        );
    }

    public function test(int $campaignId)
    {
        $email = (string) ($this->payload()['email'] ?? '');

        return $this->attempt(function () use ($campaignId, $email) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new \RuntimeException('A valid email address is required');
            }

            return $this->campaigns->sendTest($campaignId, $email, $this->adminId());
        }, 'Test email sent');
    }

    public function status(int $campaignId)
    {
        $status = (string) ($this->payload()['status'] ?? '');

        return $this->attempt(
            fn () => $this->campaigns->setStatus($campaignId, $status, $this->adminId()),
            'Campaign status updated'
        );
    }

    public function playbooks()
    {
        return $this->attempt(fn () => $this->campaigns->playbooks());
    }

    public function installPlaybook()
    {
        $data = $this->payload();
        $key = (string) ($data['key'] ?? '');
        $couponId = empty($data['coupon_id']) ? null : (int) $data['coupon_id'];

        return $this->attempt(
            fn () => $this->campaigns->installPlaybook($key, $this->adminId(), $couponId),
            'Playbook installed as a draft campaign'
        );
    }
}
