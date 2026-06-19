<?php

namespace App\Services;

use App\Models\OfficeLocationModel;

class OfficeLocationService
{
    protected OfficeLocationModel $model;
    protected OrganizationSettingsService $settingsService;
    protected $db;

    public function __construct()
    {
        $this->model = new OfficeLocationModel();
        $this->settingsService = new OrganizationSettingsService();
        $this->db = \Config\Database::connect();
    }

    public function list(int $organizationId, ?string $type = null): array
    {
        $builder = $this->model->where('organization_id', $organizationId);
        if ($type) {
            $builder->where('location_type', $type);
        }

        return $builder->orderBy('name', 'ASC')->findAll();
    }

    public function create(int $organizationId, array $data): array
    {
        $row = [
            'organization_id' => $organizationId,
            'name' => trim((string) ($data['name'] ?? 'Office')),
            'public_ip' => $this->normalizeIp($data['public_ip'] ?? null),
            'router_mac' => $this->normalizeMac($data['router_mac'] ?? null),
            'location_type' => in_array($data['location_type'] ?? 'office', ['office', 'non_office'], true)
                ? $data['location_type'] : 'office',
            'is_auto_detected' => 0,
            'last_active_at' => null,
        ];

        if ($row['name'] === '') {
            throw new \RuntimeException('Location name is required');
        }

        $id = $this->model->insert($row);
        return $this->model->find($id);
    }

    public function update(int $id, int $organizationId, array $data): array
    {
        $existing = $this->getById($id, $organizationId);
        if (!$existing) {
            throw new \RuntimeException('Location not found');
        }

        $update = [];
        if (isset($data['name'])) {
            $update['name'] = trim((string) $data['name']);
        }
        if (array_key_exists('public_ip', $data)) {
            $update['public_ip'] = $this->normalizeIp($data['public_ip']);
        }
        if (array_key_exists('router_mac', $data)) {
            $update['router_mac'] = $this->normalizeMac($data['router_mac']);
        }
        if (isset($data['location_type'])) {
            $update['location_type'] = in_array($data['location_type'], ['office', 'non_office'], true)
                ? $data['location_type'] : $existing['location_type'];
        }

        if (!empty($update)) {
            $this->model->update($id, $update);
        }

        return $this->model->find($id);
    }

    public function delete(int $id, int $organizationId): void
    {
        $existing = $this->getById($id, $organizationId);
        if (!$existing) {
            throw new \RuntimeException('Location not found');
        }
        $this->model->delete($id);
    }

    public function getById(int $id, int $organizationId): ?array
    {
        $row = $this->model->find($id);
        if (!$row || (int) $row['organization_id'] !== $organizationId) {
            return null;
        }

        return $row;
    }

    public function resolveWorkLocation(int $organizationId, ?string $publicIp, ?string $routerMac): string
    {
        $ip = $this->normalizeIp($publicIp);
        $mac = $this->normalizeMac($routerMac);
        $locations = $this->list($organizationId);

        foreach ($locations as $loc) {
            if ($loc['location_type'] === 'non_office') {
                continue;
            }
            $ipMatch = $ip && !empty($loc['public_ip']) && strcasecmp($ip, $loc['public_ip']) === 0;
            $macMatch = $mac && !empty($loc['router_mac']) && strcasecmp($mac, $loc['router_mac']) === 0;
            if ($ipMatch || $macMatch) {
                $this->model->update($loc['id'], ['last_active_at' => date('Y-m-d H:i:s')]);
                return 'office';
            }
        }

        foreach ($locations as $loc) {
            if ($loc['location_type'] !== 'non_office') {
                continue;
            }
            $ipMatch = $ip && !empty($loc['public_ip']) && strcasecmp($ip, $loc['public_ip']) === 0;
            $macMatch = $mac && !empty($loc['router_mac']) && strcasecmp($mac, $loc['router_mac']) === 0;
            if ($ipMatch || $macMatch) {
                return 'remote';
            }
        }

        return 'remote';
    }

    public function runAutoDetect(int $organizationId): int
    {
        $officeSettings = $this->settingsService->getOfficeSettings($organizationId);
        if (empty($officeSettings['auto_detect_enabled'])) {
            return 0;
        }

        $since = date('Y-m-d H:i:s', strtotime('-7 days'));
        $rows = $this->db->table('time_entries')
            ->select('client_router_mac, client_public_ip, COUNT(DISTINCT user_id) as member_count')
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $since)
            ->where('client_router_mac IS NOT NULL')
            ->where('client_router_mac !=', '')
            ->groupBy('client_router_mac, client_public_ip')
            ->having('member_count >=', 3)
            ->get()
            ->getResultArray();

        $created = 0;
        foreach ($rows as $row) {
            $mac = $this->normalizeMac($row['client_router_mac'] ?? null);
            if (!$mac) {
                continue;
            }

            $exists = $this->model
                ->where('organization_id', $organizationId)
                ->where('router_mac', $mac)
                ->first();

            if ($exists) {
                $this->model->update($exists['id'], ['last_active_at' => date('Y-m-d H:i:s')]);
                continue;
            }

            $this->model->insert([
                'organization_id' => $organizationId,
                'name' => 'Auto-detected office (' . substr($mac, -8) . ')',
                'public_ip' => $this->normalizeIp($row['client_public_ip'] ?? null),
                'router_mac' => $mac,
                'location_type' => 'office',
                'is_auto_detected' => 1,
                'last_active_at' => date('Y-m-d H:i:s'),
            ]);
            $created++;
        }

        return $created;
    }

    public function getLocationBreakdown(int $organizationId, string $startDate, string $endDate): array
    {
        $phpTz = (new TimezoneService())->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = (new TimezoneService())->dateRangeUtc($startDate, $endDate, $phpTz);

        $rows = $this->db->table('time_entries')
            ->select("COALESCE(work_location, 'remote') as work_location, COALESCE(SUM(duration_seconds),0) as total_seconds", false)
            ->where('organization_id', $organizationId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->where('ended_at IS NOT NULL')
            ->groupBy('work_location')
            ->get()
            ->getResultArray();

        $total = array_sum(array_map(fn ($r) => (int) $r['total_seconds'], $rows));
        $result = [];
        foreach ($rows as $row) {
            $seconds = (int) $row['total_seconds'];
            $result[] = [
                'work_location' => $row['work_location'],
                'hours' => round($seconds / 3600, 2),
                'percent' => $total > 0 ? round(($seconds / $total) * 100, 1) : 0,
            ];
        }

        return $result;
    }

    protected function normalizeIp($value): ?string
    {
        $ip = trim((string) ($value ?? ''));
        return $ip !== '' ? $ip : null;
    }

    protected function normalizeMac($value): ?string
    {
        $mac = strtoupper(preg_replace('/[^a-fA-F0-9]/', '', (string) ($value ?? '')));
        if (strlen($mac) !== 12) {
            return null;
        }

        return implode(':', str_split($mac, 2));
    }
}
