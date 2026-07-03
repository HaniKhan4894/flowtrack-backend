<?php

namespace App\Services;

use App\Models\WorkLedgerModel;

/**
 * Phase 6 — Proof-of-work ledger.
 *
 * Maintains a per-organization append-only hash chain over tracked time. Each
 * appended record links the previous record's hash to a deterministic hash of
 * the time entry's core fields. Verification can therefore detect:
 *   - ledger tampering / reordering (chain link mismatch)
 *   - a time entry edited after it was recorded (payload hash mismatch)
 *   - a recorded entry later deleted (missing referenced row)
 */
class LedgerService
{
    private const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';

    protected WorkLedgerModel $model;
    protected $db;

    public function __construct()
    {
        $this->model = new WorkLedgerModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * Append a ledger record for a time entry. Best-effort: callers should wrap
     * in try/catch so tracking never fails because of the ledger.
     */
    public function appendTimeEntry(int $organizationId, int $userId, int $entryId, string $action = 'record'): void
    {
        $payload = $this->timeEntryPayload($entryId);
        if ($payload === null && $action !== 'delete') {
            return; // nothing to record
        }

        // Stamp a work-integrity score (metadata only, not part of the hash).
        $meta = [];
        if ($action !== 'delete') {
            try {
                $integrity = (new WorkIntegrityService())->scoreForEntry($entryId);
                $meta['integrity_score'] = $integrity['score'];
                $meta['integrity_flags'] = $integrity['flags'];
            } catch (\Throwable $e) {
                log_message('error', 'Integrity scoring failed: ' . $e->getMessage());
            }
        }

        $this->append($organizationId, $userId, 'time_entry', $entryId, $payload ?? ['deleted' => true, 'id' => $entryId], $action, $meta);
    }

    /**
     * @param array<string,mixed> $payload
     * @param array{integrity_score?:float, integrity_flags?:array<int,string>} $meta
     */
    public function append(int $organizationId, int $userId, string $entryType, ?int $referenceId, array $payload, string $action = 'record', array $meta = []): array
    {
        $this->db->transStart();

        $last = $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('sequence', 'DESC')
            ->first();

        $prevHash = $last['hash'] ?? self::GENESIS;
        $sequence = (int) ($last['sequence'] ?? 0) + 1;
        $createdAt = date('Y-m-d H:i:s');

        $payloadHash = $this->hashPayload($payload);
        $hash = $this->linkHash($prevHash, $payloadHash, $sequence, $action, (int) ($referenceId ?? 0), $createdAt);

        $row = [
            'organization_id' => $organizationId,
            'user_id'         => $userId,
            'sequence'        => $sequence,
            'entry_type'      => $entryType,
            'action'          => $action,
            'reference_id'    => $referenceId,
            'payload_hash'    => $payloadHash,
            'prev_hash'       => $prevHash,
            'hash'            => $hash,
            'created_at'      => $createdAt,
        ];

        if (array_key_exists('integrity_score', $meta) && $meta['integrity_score'] !== null) {
            $row['integrity_score'] = $meta['integrity_score'];
        }
        if (!empty($meta['integrity_flags'])) {
            $row['integrity_flags'] = json_encode(array_values($meta['integrity_flags']));
        }

        $this->model->insert($row);
        $this->db->transComplete();

        return $row;
    }

    /**
     * Recompute the chain and validate data integrity of referenced entries.
     *
     * @return array{
     *   chain_valid:bool, records:int, first_broken_sequence:?int,
     *   data_valid:bool, tampered:array<int,array>, verified_entries:int
     * }
     */
    public function verify(int $organizationId): array
    {
        $rows = $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('sequence', 'ASC')
            ->findAll();

        $chainValid = true;
        $firstBroken = null;
        $prevHash = self::GENESIS;

        // Latest record per reference for data-integrity checks.
        $latestByRef = [];

        foreach ($rows as $r) {
            $expected = $this->linkHash(
                $prevHash,
                (string) $r['payload_hash'],
                (int) $r['sequence'],
                (string) $r['action'],
                (int) ($r['reference_id'] ?? 0),
                (string) $r['created_at']
            );

            if (($r['prev_hash'] ?? '') !== $prevHash || ($r['hash'] ?? '') !== $expected) {
                $chainValid = false;
                if ($firstBroken === null) {
                    $firstBroken = (int) $r['sequence'];
                }
            }

            $prevHash = (string) $r['hash'];

            if ($r['entry_type'] === 'time_entry' && $r['reference_id']) {
                $latestByRef[(int) $r['reference_id']] = $r;
            }
        }

        $tampered = [];
        $verified = 0;
        foreach ($latestByRef as $refId => $r) {
            $verified++;
            $current = $this->timeEntryPayload($refId);

            if ($r['action'] === 'delete') {
                if ($current !== null) {
                    $tampered[] = ['reference_id' => $refId, 'issue' => 'reappeared', 'sequence' => (int) $r['sequence']];
                }
                continue;
            }

            if ($current === null) {
                $tampered[] = ['reference_id' => $refId, 'issue' => 'deleted', 'sequence' => (int) $r['sequence']];
                continue;
            }

            if ($this->hashPayload($current) !== $r['payload_hash']) {
                $tampered[] = ['reference_id' => $refId, 'issue' => 'modified', 'sequence' => (int) $r['sequence']];
            }
        }

        return [
            'chain_valid'           => $chainValid,
            'records'               => count($rows),
            'first_broken_sequence' => $firstBroken,
            'data_valid'            => count($tampered) === 0,
            'tampered'              => $tampered,
            'verified_entries'      => $verified,
        ];
    }

    /**
     * @return array{records:int, last_hash:?string, last_sequence:int, last_recorded_at:?string}
     */
    public function summary(int $organizationId): array
    {
        $last = $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('sequence', 'DESC')
            ->first();

        return [
            'records'          => (int) $this->model->where('organization_id', $organizationId)->countAllResults(),
            'last_hash'        => $last['hash'] ?? null,
            'last_sequence'    => (int) ($last['sequence'] ?? 0),
            'last_recorded_at' => $last['created_at'] ?? null,
        ];
    }

    /**
     * Recent ledger rows joined with entry/user context for display.
     *
     * @return array<int, array<string, mixed>>
     */
    public function recent(int $organizationId, int $limit = 50): array
    {
        return $this->db->table('work_ledger l')
            ->select('l.sequence, l.action, l.entry_type, l.reference_id, l.hash, l.prev_hash, l.created_at, l.integrity_score, l.integrity_flags, u.first_name, u.last_name')
            ->join('users u', 'u.id = l.user_id', 'left')
            ->where('l.organization_id', $organizationId)
            ->orderBy('l.sequence', 'DESC')
            ->limit($limit)
            ->get()
            ->getResultArray();
    }

    /**
     * Deterministic, order-independent payload hash for a time entry's core
     * fields. Built from RAW (UTC) stored values so verification is stable.
     *
     * @return array<string,mixed>|null
     */
    private function timeEntryPayload(int $entryId): ?array
    {
        $row = $this->db->table('time_entries')->where('id', $entryId)->get()->getRowArray();
        if (!$row) {
            return null;
        }

        return [
            'id'               => (int) $row['id'],
            'user_id'          => (int) $row['user_id'],
            'organization_id'  => (int) $row['organization_id'],
            'project_id'       => $row['project_id'] !== null ? (int) $row['project_id'] : null,
            'task_id'          => $row['task_id'] !== null ? (int) $row['task_id'] : null,
            'description'      => (string) ($row['description'] ?? ''),
            'started_at'       => (string) ($row['started_at'] ?? ''),
            'ended_at'         => (string) ($row['ended_at'] ?? ''),
            'duration_seconds' => (int) ($row['duration_seconds'] ?? 0),
            'is_manual'        => (int) ($row['is_manual'] ?? 0),
        ];
    }

    /**
     * @param array<string,mixed> $payload
     */
    private function hashPayload(array $payload): string
    {
        ksort($payload);
        return hash('sha256', json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function linkHash(string $prevHash, string $payloadHash, int $sequence, string $action, int $referenceId, string $createdAt): string
    {
        return hash('sha256', implode('|', [$prevHash, $payloadHash, $sequence, $action, $referenceId, $createdAt]));
    }
}
