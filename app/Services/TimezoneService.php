<?php

namespace App\Services;

use App\Models\OrganizationModel;
use DateTime;
use DateTimeZone;
use Exception;

class TimezoneService
{
    protected OrganizationModel $organizationModel;

    public function __construct()
    {
        $this->organizationModel = new OrganizationModel();
    }

    public function getOrgTimezone(int $organizationId): string
    {
        if ($organizationId <= 0) {
            return 'UTC';
        }

        $org = $this->organizationModel->select('php_timezone')->find($organizationId);
        $tz = trim((string) ($org['php_timezone'] ?? ''));

        return $tz !== '' ? $tz : 'UTC';
    }

    public function toOrgLocal(?string $utcTimestamp, string $phpTz): ?string
    {
        if (!$utcTimestamp) {
            return null;
        }

        try {
            $utc = new DateTime($utcTimestamp, new DateTimeZone('UTC'));
            $utc->setTimezone(new DateTimeZone($phpTz));

            return $utc->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            return $utcTimestamp;
        }
    }

    public function toUtc(?string $localTimestamp, string $phpTz): ?string
    {
        if (!$localTimestamp) {
            return null;
        }

        try {
            $local = new DateTime($localTimestamp, new DateTimeZone($phpTz));
            $local->setTimezone(new DateTimeZone('UTC'));

            return $local->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            return $localTimestamp;
        }
    }

    /**
     * @return array{0: string, 1: string}
     */
    public function dayRangeUtc(string $localDate, string $phpTz): array
    {
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', trim($localDate), $matches)) {
            $date = $matches[1];
        } else {
            $date = date('Y-m-d');
        }

        try {
            $start = new DateTime($date . ' 00:00:00', new DateTimeZone($phpTz));
            $end = new DateTime($date . ' 23:59:59', new DateTimeZone($phpTz));
            $start->setTimezone(new DateTimeZone('UTC'));
            $end->setTimezone(new DateTimeZone('UTC'));

            return [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')];
        } catch (Exception $e) {
            return [$date . ' 00:00:00', $date . ' 23:59:59'];
        }
    }

    /**
     * @return array{0: string, 1: string}
     */
    public function dateRangeUtc(string $startDate, string $endDate, string $phpTz): array
    {
        [$startUtc] = $this->dayRangeUtc($startDate, $phpTz);
        [, $endUtc] = $this->dayRangeUtc($endDate, $phpTz);

        return [$startUtc, $endUtc];
    }

    public function applyToRecord(array $record, string $phpTz, array $fields = ['started_at', 'ended_at', 'paused_at', 'logged_at', 'captured_at', 'created_at']): array
    {
        foreach ($fields as $field) {
            if (array_key_exists($field, $record) && $record[$field]) {
                $record[$field . '_local'] = $this->toOrgLocal((string) $record[$field], $phpTz);
            }
        }

        $record['timezone'] = $phpTz;

        return $record;
    }

    public function applyToCollection(array $records, string $phpTz, array $fields = ['started_at', 'ended_at', 'paused_at', 'logged_at', 'captured_at', 'created_at']): array
    {
        return array_map(fn ($record) => $this->applyToRecord($record, $phpTz, $fields), $records);
    }
}
