<?php

namespace App\Services;

class ScheduleService
{
    protected TimezoneService $timezoneService;
    protected $db;

    public function __construct()
    {
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
    }

    public function getSchedule(int $organizationId, int $userId): array
    {
        $rows = $this->db->table('member_schedules')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->orderBy('day_of_week', 'ASC')
            ->get()
            ->getResultArray();

        return array_map(fn ($r) => $this->formatScheduleRow($r), $rows);
    }

    public function upsertSchedule(int $organizationId, int $userId, array $days): array
    {
        if (empty($days)) {
            throw new \Exception('Schedule days are required');
        }

        foreach ($days as $day) {
            $dayOfWeek = (int) ($day['day_of_week'] ?? -1);
            if ($dayOfWeek < 0 || $dayOfWeek > 6) {
                throw new \Exception('day_of_week must be 0-6 (Sun-Sat)');
            }

            $existing = $this->db->table('member_schedules')
                ->where('organization_id', $organizationId)
                ->where('user_id', $userId)
                ->where('day_of_week', $dayOfWeek)
                ->get()
                ->getRowArray();

            $payload = [
                'start_time' => $day['start_time'] ?? null,
                'end_time' => $day['end_time'] ?? null,
                'expected_hours' => (float) ($day['expected_hours'] ?? 8),
                'is_working_day' => (int) (bool) ($day['is_working_day'] ?? true),
                'updated_at' => date('Y-m-d H:i:s'),
            ];

            if ($existing) {
                $this->db->table('member_schedules')->where('id', $existing['id'])->update($payload);
            } else {
                $this->db->table('member_schedules')->insert(array_merge($payload, [
                    'user_id' => $userId,
                    'organization_id' => $organizationId,
                    'day_of_week' => $dayOfWeek,
                    'created_at' => date('Y-m-d H:i:s'),
                ]));
            }
        }

        return $this->getSchedule($organizationId, $userId);
    }

    public function deleteScheduleDay(int $organizationId, int $userId, int $dayOfWeek): bool
    {
        return (bool) $this->db->table('member_schedules')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('day_of_week', $dayOfWeek)
            ->delete();
    }

    public function getExpectedVsActual(int $organizationId, int $userId, string $startDate, string $endDate): array
    {
        $phpTz = $this->timezoneService->getOrgTimezone($organizationId);
        [$startUtc, $endUtc] = $this->timezoneService->dateRangeUtc($startDate, $endDate, $phpTz);

        $schedule = $this->getSchedule($organizationId, $userId);
        $scheduleByDay = [];
        foreach ($schedule as $row) {
            $scheduleByDay[(int) $row['day_of_week']] = $row;
        }

        $entries = $this->db->table('time_entries')
            ->select('DATE(started_at) as work_date, SUM(duration_seconds) as total_seconds')
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->where('started_at >=', $startUtc)
            ->where('started_at <=', $endUtc)
            ->groupBy('DATE(started_at)')
            ->get()
            ->getResultArray();

        $actualByDate = [];
        foreach ($entries as $entry) {
            $actualByDate[$entry['work_date']] = (int) $entry['total_seconds'];
        }

        $days = [];
        $totalExpected = 0;
        $totalActual = 0;

        $period = new \DatePeriod(
            new \DateTime($startDate),
            new \DateInterval('P1D'),
            (new \DateTime($endDate))->modify('+1 day')
        );

        foreach ($period as $date) {
            $dateStr = $date->format('Y-m-d');
            $dow = (int) $date->format('w');
            $sched = $scheduleByDay[$dow] ?? null;
            $expectedHours = ($sched && $sched['is_working_day'])
                ? (float) $sched['expected_hours']
                : 0;
            $expectedSeconds = (int) round($expectedHours * 3600);
            $actualSeconds = $actualByDate[$dateStr] ?? 0;
            $variance = $actualSeconds - $expectedSeconds;

            $days[] = [
                'date' => $dateStr,
                'day_of_week' => $dow,
                'is_working_day' => (bool) ($sched['is_working_day'] ?? false),
                'expected_hours' => $expectedHours,
                'actual_hours' => round($actualSeconds / 3600, 2),
                'variance_hours' => round($variance / 3600, 2),
            ];

            $totalExpected += $expectedSeconds;
            $totalActual += $actualSeconds;
        }

        return [
            'user_id' => $userId,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'days' => $days,
            'summary' => [
                'expected_hours' => round($totalExpected / 3600, 2),
                'actual_hours' => round($totalActual / 3600, 2),
                'variance_hours' => round(($totalActual - $totalExpected) / 3600, 2),
            ],
        ];
    }

    private function formatScheduleRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'organization_id' => (int) $row['organization_id'],
            'day_of_week' => (int) $row['day_of_week'],
            'start_time' => $row['start_time'] ?? null,
            'end_time' => $row['end_time'] ?? null,
            'expected_hours' => (float) ($row['expected_hours'] ?? 0),
            'is_working_day' => (bool) ($row['is_working_day'] ?? true),
        ];
    }
}
