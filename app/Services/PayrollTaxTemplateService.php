<?php

namespace App\Services;

use App\Models\PayrollTaxTemplateModel;

class PayrollTaxTemplateService
{
    protected PayrollTaxTemplateModel $templateModel;

    public function __construct()
    {
        $this->templateModel = new PayrollTaxTemplateModel();
    }

    public function list(int $organizationId): array
    {
        $rows = $this->templateModel
            ->where('organization_id', $organizationId)
            ->orderBy('name', 'ASC')
            ->findAll();

        return array_map(fn ($r) => $this->format($r), $rows);
    }

    public function get(int $id, int $organizationId): ?array
    {
        $row = $this->templateModel
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->first();

        return $row ? $this->format($row) : null;
    }

    public function create(int $organizationId, array $data): array
    {
        $payload = $this->buildPayload($organizationId, $data);
        $id = $this->templateModel->insert($payload);

        if (!$id) {
            throw new \Exception('Failed to create tax template');
        }

        return $this->get((int) $id, $organizationId);
    }

    public function update(int $id, int $organizationId, array $data): array
    {
        if (!$this->get($id, $organizationId)) {
            throw new \Exception('Tax template not found');
        }

        $payload = $this->buildPayload($organizationId, $data, false);
        unset($payload['organization_id']);

        $this->templateModel->update($id, $payload);

        return $this->get($id, $organizationId);
    }

    public function delete(int $id, int $organizationId): bool
    {
        if (!$this->get($id, $organizationId)) {
            throw new \Exception('Tax template not found');
        }

        return (bool) $this->templateModel->delete($id);
    }

    private function buildPayload(int $organizationId, array $data, bool $includeOrg = true): array
    {
        $type = $data['type'] ?? 'percentage';
        if (!in_array($type, ['percentage', 'fixed'], true)) {
            throw new \Exception('type must be percentage or fixed');
        }

        $payload = [
            'name' => trim((string) ($data['name'] ?? '')),
            'type' => $type,
            'rate' => $type === 'percentage' ? (float) ($data['rate'] ?? 0) : null,
            'amount' => $type === 'fixed' ? (float) ($data['amount'] ?? 0) : null,
            'is_active' => (int) (bool) ($data['is_active'] ?? true),
        ];

        if ($payload['name'] === '') {
            throw new \Exception('Template name is required');
        }

        if ($includeOrg) {
            $payload['organization_id'] = $organizationId;
        }

        return $payload;
    }

    private function format(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'rate' => $row['rate'] !== null ? (float) $row['rate'] : null,
            'amount' => $row['amount'] !== null ? (float) $row['amount'] : null,
            'is_active' => (bool) ($row['is_active'] ?? true),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
}
