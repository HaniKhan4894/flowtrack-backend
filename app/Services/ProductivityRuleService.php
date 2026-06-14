<?php

namespace App\Services;

use App\Models\ProductivityRuleModel;

class ProductivityRuleService
{
    protected ProductivityRuleModel $ruleModel;

    public function __construct()
    {
        $this->ruleModel = new ProductivityRuleModel();
    }

    public function getRules(int $organizationId, array $filters = []): array
    {
        $builder = $this->ruleModel->builder();
        $builder->where('organization_id', $organizationId);

        if (isset($filters['is_active'])) {
            $builder->where('is_active', (int) $filters['is_active']);
        }

        if (isset($filters['rule_type'])) {
            $builder->where('rule_type', $filters['rule_type']);
        }

        if (!empty($filters['search'])) {
            $builder->like('pattern', $filters['search']);
        }

        $page = (int) ($filters['page'] ?? 1);
        $perPage = (int) ($filters['per_page'] ?? 50);
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $rules = $builder->orderBy('created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $rules,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function getRuleById(int $id, int $organizationId): ?array
    {
        $rule = $this->ruleModel->find($id);
        if (!$rule || (int) $rule['organization_id'] !== $organizationId) {
            return null;
        }

        return $rule;
    }

    public function createRule(int $organizationId, int $createdBy, array $data): array
    {
        $ruleId = $this->ruleModel->insert([
            'organization_id' => $organizationId,
            'rule_type' => $data['rule_type'],
            'pattern' => $data['pattern'],
            'category' => $data['category'],
            'is_active' => $data['is_active'] ?? true,
            'created_by' => $createdBy,
        ]);

        if (!$ruleId) {
            throw new \Exception('Failed to create productivity rule');
        }

        return $this->ruleModel->find($ruleId);
    }

    public function updateRule(int $id, int $organizationId, array $data): bool
    {
        $rule = $this->getRuleById($id, $organizationId);
        if (!$rule) {
            throw new \Exception('Productivity rule not found');
        }

        $allowed = ['rule_type', 'pattern', 'category', 'is_active'];
        $updates = array_intersect_key($data, array_flip($allowed));

        if (empty($updates)) {
            return true;
        }

        return $this->ruleModel->update($id, $updates);
    }

    public function deleteRule(int $id, int $organizationId): bool
    {
        $rule = $this->getRuleById($id, $organizationId);
        if (!$rule) {
            throw new \Exception('Productivity rule not found');
        }

        return $this->ruleModel->delete($id);
    }

    public function seedDefaultRules(int $organizationId, ?int $createdBy = null): void
    {
        $existing = $this->ruleModel
            ->where('organization_id', $organizationId)
            ->countAllResults();

        if ($existing > 0) {
            return;
        }

        if ($createdBy === null) {
            $org = (new \App\Models\OrganizationModel())->find($organizationId);
            $createdBy = (int) ($org['owner_id'] ?? 0);
        }

        if ($createdBy <= 0) {
            return;
        }

        $defaults = [
            ['rule_type' => 'app', 'pattern' => 'Cursor', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Code.exe', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'devenv', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'WindowsTerminal', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'phpstorm', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Figma', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Notion', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Slack', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Teams', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Zoom', 'category' => 'productive'],
            ['rule_type' => 'app', 'pattern' => 'Chrome', 'category' => 'neutral'],
            ['rule_type' => 'app', 'pattern' => 'firefox', 'category' => 'neutral'],
            ['rule_type' => 'app', 'pattern' => 'msedge', 'category' => 'neutral'],
            ['rule_type' => 'app', 'pattern' => 'TikTok', 'category' => 'unproductive'],
            ['rule_type' => 'app', 'pattern' => 'Spotify', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'github.com', 'category' => 'productive'],
            ['rule_type' => 'url', 'pattern' => 'gitlab.com', 'category' => 'productive'],
            ['rule_type' => 'url', 'pattern' => 'stackoverflow', 'category' => 'productive'],
            ['rule_type' => 'url', 'pattern' => 'localhost', 'category' => 'productive'],
            ['rule_type' => 'url', 'pattern' => 'tiktok.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'youtube.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'instagram.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'facebook.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'netflix.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'reddit.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'twitter.com', 'category' => 'unproductive'],
            ['rule_type' => 'url', 'pattern' => 'x.com', 'category' => 'unproductive'],
            ['rule_type' => 'keyword', 'pattern' => 'TikTok', 'category' => 'unproductive'],
            ['rule_type' => 'keyword', 'pattern' => 'YouTube', 'category' => 'unproductive'],
            ['rule_type' => 'keyword', 'pattern' => 'Instagram', 'category' => 'unproductive'],
            ['rule_type' => 'keyword', 'pattern' => 'Netflix', 'category' => 'unproductive'],
            ['rule_type' => 'keyword', 'pattern' => 'Facebook', 'category' => 'unproductive'],
        ];

        $now = date('Y-m-d H:i:s');
        foreach ($defaults as $rule) {
            $this->ruleModel->insert([
                'organization_id' => $organizationId,
                'rule_type' => $rule['rule_type'],
                'pattern' => $rule['pattern'],
                'category' => $rule['category'],
                'is_active' => true,
                'created_by' => $createdBy,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}





