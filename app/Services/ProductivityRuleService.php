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
}
