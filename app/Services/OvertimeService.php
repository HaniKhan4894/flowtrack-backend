<?php

namespace App\Services;

class OvertimeService
{
    protected TimezoneService $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    public function getRules(int $organizationId): ?array
    {
        $rule = $this->db->table('overtime_rules')
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->orderBy('id', 'DESC')
            ->get()
            ->getRowArray();

        return $rule ? $this->formatRule($rule) : null;
    }

    public function upsertRules(int $organizationId, array $data): array
    {
        $existing = $this->db->table('overtime_rules')
            ->where('organization_id', $organizationId)
            ->where('is_active', 1)
            ->get()
            ->getRowArray();

        $payload = [
            'daily_threshold_hours' => (float) ($data['daily_threshold_hours'] ?? 8),
            'weekly_threshold_hours' => (float) ($data['weekly_threshold_hours'] ?? 40),
            'multiplier' => (float) ($data['multiplier'] ?? 1.5),
            'is_active' => 1,
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        if ($existing) {
            $this->db->table('overtime_rules')->where('id', $existing['id'])->update($payload);
            $id = (int) $existing['id'];
        } else {
            $payload['organization_id'] = $organizationId;
            $payload['created_at'] = date('Y-m-d H:i:s');
            $this->db->table('overtime_rules')->insert($payload);
            $id = (int) $this->db->insertID();
        }

        return $this->formatRule(
            $this->db->table('overtime_rules')->where('id', $id)->get()->getRowArray()
        );
    }

    public function calculate(int $organizationId, int $userId, string $startDate, string $endDate): array
    {
        $rule = $this->getRules($organizationId) ?? [
            'daily_threshold_hours' => 8,
            'weekly_threshold_hours' => 40,
            'multiplier' => 1.5,
        ];

        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $entries = $this->db->table('time_entries')
            ->select('started_at, duration_seconds')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->where('duration_seconds >', 0)
            ->orderBy('started_at', 'ASC')
            ->get()
            ->getResultArray();

        $tz = new \DateTimeZone($phpTz);
        $dailySeconds = [];
        $weeklySeconds = [];

        foreach ($entries as $entry) {
            $dt = new \DateTime($entry['started_at'], new \DateTimeZone('UTC'));
            $dt->setTimezone($tz);
            $dateKey = $dt->format('Y-m-d');
            $weekKey = $dt->format('o-W');
            $seconds = (int) $entry['duration_seconds'];

            $dailySeconds[$dateKey] = ($dailySeconds[$dateKey] ?? 0) + $seconds;
            $weeklySeconds[$weekKey] = ($weeklySeconds[$weekKey] ?? 0) + $seconds;
        }

        $dailyThreshold = (float) $rule['daily_threshold_hours'] * 3600;
        $weeklyThreshold = (float) $rule['weekly_threshold_hours'] * 3600;
        $multiplier = (float) $rule['multiplier'];

        $dailyOvertimeSeconds = 0;
        foreach ($dailySeconds as $seconds) {
            if ($seconds > $dailyThreshold) {
                $dailyOvertimeSeconds += $seconds - $dailyThreshold;
            }
        }

        $weeklyOvertimeSeconds = 0;
        foreach ($weeklySeconds as $seconds) {
            if ($seconds > $weeklyThreshold) {
                $weeklyOvertimeSeconds += $seconds - $weeklyThreshold;
            }
        }

        $overtimeSeconds = max($dailyOvertimeSeconds, $weeklyOvertimeSeconds);
        $regularSeconds = array_sum($dailySeconds) - $overtimeSeconds;

        return [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'rules' => $rule,
            'regular_hours' => round(max(0, $regularSeconds) / 3600, 2),
            'overtime_hours' => round($overtimeSeconds / 3600, 2),
            'overtime_pay_multiplier' => $multiplier,
            'daily_breakdown' => array_map(function ($date, $seconds) use ($dailyThreshold) {
                $ot = max(0, $seconds - $dailyThreshold);
                return [
                    'date' => $date,
                    'total_hours' => round($seconds / 3600, 2),
                    'overtime_hours' => round($ot / 3600, 2),
                ];
            }, array_keys($dailySeconds), array_values($dailySeconds)),
        ];
    }

    private function formatRule(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'daily_threshold_hours' => (float) $row['daily_threshold_hours'],
            'weekly_threshold_hours' => (float) $row['weekly_threshold_hours'],
            'multiplier' => (float) $row['multiplier'],
            'is_active' => (bool) $row['is_active'],
        ];
    }
}
