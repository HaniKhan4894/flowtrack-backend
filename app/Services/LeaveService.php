<?php

namespace App\Services;

class LeaveService
{
    protected $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    public function getLeaveTypes(int $organizationId): array
    {
        return $this->db->table('leave_types')
            ->where('organization_id', $organizationId)
            ->orderBy('name', 'ASC')
            ->get()
            ->getResultArray();
    }

    public function createLeaveType(int $organizationId, array $data): array
    {
        $payload = [
            'organization_id' => $organizationId,
            'name' => trim((string) ($data['name'] ?? '')),
            'days_per_year' => (float) ($data['days_per_year'] ?? 0),
            'is_paid' => (int) (bool) ($data['is_paid'] ?? true),
            'created_at' => date('Y-m-d H:i:s'),
        ];

        if ($payload['name'] === '') {
            throw new \Exception('Leave type name is required');
        }

        $this->db->table('leave_types')->insert($payload);
        $id = (int) $this->db->insertID();

        return $this->db->table('leave_types')->where('id', $id)->get()->getRowArray();
    }

    public function updateLeaveType(int $id, int $organizationId, array $data): array
    {
        $existing = $this->db->table('leave_types')
            ->where('id', $id)
            ->where('organization_id', $organizationId)
            ->get()
            ->getRowArray();

        if (!$existing) {
            throw new \Exception('Leave type not found');
        }

        $updates = [];
        if (isset($data['name'])) {
            $updates['name'] = trim((string) $data['name']);
        }
        if (isset($data['days_per_year'])) {
            $updates['days_per_year'] = (float) $data['days_per_year'];
        }
        if (isset($data['is_paid'])) {
            $updates['is_paid'] = (int) (bool) $data['is_paid'];
        }

        if (!empty($updates)) {
            $this->db->table('leave_types')->where('id', $id)->update($updates);
        }

        return $this->db->table('leave_types')->where('id', $id)->get()->getRowArray();
    }

    public function getBalances(int $organizationId, ?int $userId = null, ?int $year = null): array
    {
        $year = $year ?? (int) date('Y');

        $builder = $this->db->table('leave_balances lb')
            ->select('lb.*, lt.name as leave_type_name, lt.is_paid, users.first_name, users.last_name, users.email')
            ->join('leave_types lt', 'lt.id = lb.leave_type_id')
            ->join('users', 'users.id = lb.user_id')
            ->where('lb.organization_id', $organizationId)
            ->where('lb.year', $year);

        if ($userId) {
            $builder->where('lb.user_id', $userId);
        }

        return $builder->orderBy('users.first_name', 'ASC')->get()->getResultArray();
    }

    public function ensureBalance(int $organizationId, int $userId, int $leaveTypeId, int $year): array
    {
        $existing = $this->db->table('leave_balances')
            ->where('user_id', $userId)
            ->where('leave_type_id', $leaveTypeId)
            ->where('year', $year)
            ->get()
            ->getRowArray();

        if ($existing) {
            return $existing;
        }

        $type = $this->db->table('leave_types')
            ->where('id', $leaveTypeId)
            ->where('organization_id', $organizationId)
            ->get()
            ->getRowArray();

        if (!$type) {
            throw new \Exception('Leave type not found');
        }

        $this->db->table('leave_balances')->insert([
            'user_id' => $userId,
            'organization_id' => $organizationId,
            'leave_type_id' => $leaveTypeId,
            'balance_days' => (float) $type['days_per_year'],
            'used_days' => 0,
            'year' => $year,
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        return $this->db->table('leave_balances')->where('id', $this->db->insertID())->get()->getRowArray();
    }

    public function requestLeave(int $organizationId, int $userId, array $data): array
    {
        $leaveTypeId = (int) ($data['leave_type_id'] ?? 0);
        $startDate = $data['start_date'] ?? '';
        $endDate = $data['end_date'] ?? '';
        $days = isset($data['days']) ? (float) $data['days'] : 0;

        if (!$leaveTypeId || !$startDate || !$endDate) {
            throw new \Exception('leave_type_id, start_date, and end_date are required');
        }

        if ($days <= 0) {
            $days = $this->calculateLeaveDays($startDate, $endDate);
        }

        if ($days <= 0) {
            throw new \Exception('Invalid date range');
        }

        $year = (int) date('Y', strtotime($startDate));
        $balance = $this->ensureBalance($organizationId, $userId, $leaveTypeId, $year);

        $available = (float) $balance['balance_days'] - (float) $balance['used_days'];
        if ($days > $available) {
            throw new \Exception('Insufficient leave balance');
        }

        $this->db->table('leave_requests')->insert([
            'user_id' => $userId,
            'organization_id' => $organizationId,
            'leave_type_id' => $leaveTypeId,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'days' => $days,
            'reason' => $data['reason'] ?? null,
            'status' => 'pending',
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $id = (int) $this->db->insertID();

        return $this->getRequest($id, $organizationId);
    }

    public function getRequests(int $organizationId, array $filters = []): array
    {
        $builder = $this->db->table('leave_requests lr')
            ->select('lr.*, lt.name as leave_type_name, users.first_name, users.last_name, users.email')
            ->join('leave_types lt', 'lt.id = lr.leave_type_id')
            ->join('users', 'users.id = lr.user_id')
            ->where('lr.organization_id', $organizationId);

        if (!empty($filters['user_id'])) {
            $builder->where('lr.user_id', (int) $filters['user_id']);
        }
        if (!empty($filters['status'])) {
            $builder->where('lr.status', $filters['status']);
        }

        return $builder->orderBy('lr.created_at', 'DESC')->get()->getResultArray();
    }

    public function getRequest(int $id, int $organizationId): array
    {
        $row = $this->db->table('leave_requests lr')
            ->select('lr.*, lt.name as leave_type_name, users.first_name, users.last_name')
            ->join('leave_types lt', 'lt.id = lr.leave_type_id')
            ->join('users', 'users.id = lr.user_id')
            ->where('lr.id', $id)
            ->where('lr.organization_id', $organizationId)
            ->get()
            ->getRowArray();

        if (!$row) {
            throw new \Exception('Leave request not found');
        }

        return $row;
    }

    public function reviewRequest(int $id, int $organizationId, int $reviewerId, string $action, ?string $reason = null): array
    {
        if (!in_array($action, ['approve', 'reject'], true)) {
            throw new \Exception('Action must be approve or reject');
        }

        $request = $this->getRequest($id, $organizationId);

        if ($request['status'] !== 'pending') {
            throw new \Exception('Request has already been reviewed');
        }

        $status = $action === 'approve' ? 'approved' : 'rejected';

        $this->db->transStart();

        $this->db->table('leave_requests')->where('id', $id)->update([
            'status' => $status,
            'reviewed_by' => $reviewerId,
            'reviewed_at' => date('Y-m-d H:i:s'),
        ]);

        if ($action === 'approve') {
            $year = (int) date('Y', strtotime($request['start_date']));
            $balance = $this->ensureBalance(
                $organizationId,
                (int) $request['user_id'],
                (int) $request['leave_type_id'],
                $year
            );

            $this->db->table('leave_balances')->where('id', $balance['id'])->update([
                'used_days' => (float) $balance['used_days'] + (float) $request['days'],
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        $this->db->transComplete();

        if ($this->db->transStatus() === false) {
            throw new \Exception('Failed to review leave request');
        }

        return $this->getRequest($id, $organizationId);
    }

    public function cancelRequest(int $id, int $organizationId, int $userId): array
    {
        $request = $this->getRequest($id, $organizationId);

        if ((int) $request['user_id'] !== $userId) {
            throw new \Exception('Unauthorized');
        }

        if (!in_array($request['status'], ['pending', 'approved'], true)) {
            throw new \Exception('Cannot cancel this request');
        }

        if ($request['status'] === 'approved') {
            $year = (int) date('Y', strtotime($request['start_date']));
            $balance = $this->ensureBalance(
                $organizationId,
                $userId,
                (int) $request['leave_type_id'],
                $year
            );

            $this->db->table('leave_balances')->where('id', $balance['id'])->update([
                'used_days' => max(0, (float) $balance['used_days'] - (float) $request['days']),
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        $this->db->table('leave_requests')->where('id', $id)->update(['status' => 'cancelled']);

        return $this->getRequest($id, $organizationId);
    }

    private function calculateLeaveDays(string $startDate, string $endDate): float
    {
        $start = strtotime($startDate);
        $end = strtotime($endDate);
        if (!$start || !$end || $end < $start) {
            return 0;
        }

        return (float) (floor(($end - $start) / 86400) + 1);
    }
}
