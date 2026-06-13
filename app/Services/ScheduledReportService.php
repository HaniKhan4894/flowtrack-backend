<?php

namespace App\Services;

class ScheduledReportService
{
    protected ReportService $reportService;
    protected EmailService $emailService;
    protected $db;

    public function __construct()
    {
        $this->reportService = new ReportService();
        $this->emailService = new EmailService();
        $this->db = \Config\Database::connect();
    }

    public function getScheduledReports(int $organizationId): array
    {
        $rows = $this->db->table('scheduled_reports')
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->get()
            ->getResultArray();

        return array_map(fn ($r) => $this->formatReport($r), $rows);
    }

    public function create(int $organizationId, int $createdBy, array $data): array
    {
        $payload = $this->buildPayload($organizationId, $createdBy, $data);
        $this->db->table('scheduled_reports')->insert($payload);

        return $this->formatReport(
            $this->db->table('scheduled_reports')->where('id', $this->db->insertID())->get()->getRowArray()
        );
    }

    public function update(int $id, int $organizationId, array $data): array
    {
        $existing = $this->getReportRow($id, $organizationId);
        $payload = $this->buildPayload($organizationId, (int) $existing['created_by'], $data, false);
        unset($payload['organization_id'], $payload['created_by'], $payload['created_at']);

        $this->db->table('scheduled_reports')->where('id', $id)->update($payload);

        return $this->formatReport($this->getReportRow($id, $organizationId));
    }

    public function delete(int $id, int $organizationId): bool
    {
        $this->getReportRow($id, $organizationId);

        return (bool) $this->db->table('scheduled_reports')
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->delete();
    }

    public function sendDueReports(): array
    {
        $reports = $this->db->table('scheduled_reports')
            ->where('is_active', 1)
            ->get()
            ->getResultArray();

        $sent = [];
        $now = time();

        foreach ($reports as $report) {
            if (!$this->isDue($report, $now)) {
                continue;
            }

            try {
                $this->sendReport($report);
                $this->db->table('scheduled_reports')->where('id', $report['id'])->update([
                    'last_sent_at' => date('Y-m-d H:i:s'),
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);
                $sent[] = (int) $report['id'];
            } catch (\Exception $e) {
                log_message('error', 'Scheduled report {id} failed: {msg}', [
                    'id' => $report['id'],
                    'msg' => $e->getMessage(),
                ]);
            }
        }

        return ['sent_count' => count($sent), 'sent_ids' => $sent];
    }

    private function isDue(array $report, int $now): bool
    {
        $lastSent = !empty($report['last_sent_at']) ? strtotime($report['last_sent_at']) : 0;
        $cadence = $report['cadence'] ?? 'weekly';

        return match ($cadence) {
            'daily' => ($now - $lastSent) >= 86400,
            'weekly' => ($now - $lastSent) >= 604800,
            'monthly' => ($now - $lastSent) >= 2592000,
            default => false,
        };
    }

    private function sendReport(array $report): void
    {
        $orgId = (int) $report['organization_id'];
        $recipients = json_decode($report['recipients'] ?? '[]', true) ?: [];

        if (empty($recipients)) {
            throw new \Exception('No recipients configured');
        }

        $startDate = date('Y-m-d', strtotime('-7 days'));
        $endDate = date('Y-m-d');

        $reportData = match ($report['report_type']) {
            'time_summary' => [$this->reportService->getTimeSummary([
                'organization_id' => $orgId,
                'start_date' => $startDate,
                'end_date' => $endDate,
            ])],
            'project_breakdown' => $this->reportService->getProjectBreakdown([
                'organization_id' => $orgId,
                'start_date' => $startDate,
                'end_date' => $endDate,
            ]),
            'team_leaderboard' => $this->reportService->getTeamLeaderboard($orgId, $startDate, $endDate),
            default => [$this->reportService->getSummary($orgId)],
        };

        $format = $report['format'] ?? 'csv';
        $filename = sprintf('scheduled_%s_%s.%s', $report['report_type'], date('Y-m-d'), $format === 'xlsx' ? 'xlsx' : ($format === 'pdf' ? 'pdf' : 'csv'));

        $filepath = match ($format) {
            'pdf' => $this->reportService->exportToPdf($reportData, $filename, ucfirst(str_replace('_', ' ', $report['report_type']))),
            'xlsx' => $this->reportService->exportToExcel($reportData, $filename),
            default => $this->reportService->exportToCSV(
                $this->normalizeForCsv($reportData),
                $filename
            ),
        };

        foreach ($recipients as $email) {
            $this->emailService->sendScheduledReportEmail(
                (string) $email,
                $report['report_type'],
                $filepath,
                basename($filepath)
            );
        }
    }

    private function normalizeForCsv(array $data): array
    {
        if (empty($data)) {
            return [['message' => 'No data']];
        }

        if (isset($data[0]) && is_array($data[0])) {
            return $data;
        }

        return [$data];
    }

    private function buildPayload(int $organizationId, int $createdBy, array $data, bool $includeMeta = true): array
    {
        $payload = [
            'report_type' => $data['report_type'] ?? 'time_summary',
            'cadence' => $data['cadence'] ?? 'weekly',
            'recipients' => json_encode($data['recipients'] ?? []),
            'format' => $data['format'] ?? 'csv',
            'is_active' => (int) (bool) ($data['is_active'] ?? true),
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        if ($includeMeta) {
            $payload['organization_id'] = $organizationId;
            $payload['created_by'] = $createdBy;
            $payload['created_at'] = date('Y-m-d H:i:s');
        }

        return $payload;
    }

    private function getReportRow(int $id, int $organizationId): array
    {
        $row = $this->db->table('scheduled_reports')
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->get()
            ->getRowArray();

        if (!$row) {
            throw new \Exception('Scheduled report not found');
        }

        return $row;
    }

    private function formatReport(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'organization_id' => (int) $row['organization_id'],
            'report_type' => $row['report_type'],
            'cadence' => $row['cadence'],
            'recipients' => json_decode($row['recipients'] ?? '[]', true) ?: [],
            'format' => $row['format'],
            'is_active' => (bool) $row['is_active'],
            'last_sent_at' => $row['last_sent_at'] ?? null,
            'created_by' => (int) $row['created_by'],
            'created_at' => $row['created_at'] ?? null,
        ];
    }
}
