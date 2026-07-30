<?php

namespace App\Services\Admin;

use App\Models\OrganizationModel;
use App\Models\PlanModel;
use App\Models\SubscriptionModel;
use App\Services\SubscriptionService;
use CodeIgniter\Database\BaseConnection;

/**
 * Cross-tenant organization administration for the platform portal.
 *
 * Plan changes made here are applied locally only: Stripe is deliberately left
 * untouched so support can grant or correct access without creating charges.
 */
class AdminOrganizationService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected OrganizationModel $organizationModel;
    protected SubscriptionModel $subscriptionModel;
    protected PlanModel $planModel;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->organizationModel = new OrganizationModel();
        $this->subscriptionModel = new SubscriptionModel();
        $this->planModel = new PlanModel();
    }

    /**
     * @param array{search?:string, status?:string, plan_id?:int|string, subscription_status?:string, sort?:string, direction?:string, page?:int, per_page?:int} $filters
     */
    public function list(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table('organizations o')
            ->select('
                o.id, o.uuid, o.name, o.slug, o.is_active, o.php_timezone, o.currency,
                o.trial_ends_at, o.created_at,
                u.id AS owner_id, u.email AS owner_email, u.first_name AS owner_first_name,
                u.last_name AS owner_last_name,
                os.id AS subscription_id, os.status AS subscription_status, os.billing_cycle,
                os.amount, os.user_count, os.current_period_end, os.trial_ends_at AS subscription_trial_ends_at,
                os.cancel_at_period_end, os.stripe_subscription_id,
                p.id AS plan_id, p.name AS plan_name, p.slug AS plan_slug,
                (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
                (SELECT COUNT(*) FROM projects pr WHERE pr.organization_id = o.id) AS project_count,
                (SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
                    WHERE te.organization_id = o.id
                      AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS seconds_30d,
                (SELECT MAX(te.started_at) FROM time_entries te WHERE te.organization_id = o.id) AS last_activity_at
            ', false)
            ->join('users u', 'u.id = o.owner_id', 'left')
            ->join(
                'organization_subscriptions os',
                "os.organization_id = o.id AND os.status IN ('trial', 'active', 'past_due')",
                'left'
            )
            ->join('plans p', 'p.id = os.plan_id', 'left');

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('o.name', $search)
                ->orLike('o.slug', $search)
                ->orLike('u.email', $search)
                ->groupEnd();
        }

        if (($filters['status'] ?? '') === 'active') {
            $builder->where('o.is_active', 1);
        } elseif (($filters['status'] ?? '') === 'suspended') {
            $builder->where('o.is_active', 0);
        }

        if (!empty($filters['plan_id'])) {
            $builder->where('os.plan_id', (int) $filters['plan_id']);
        }

        if (!empty($filters['subscription_status'])) {
            if ($filters['subscription_status'] === 'none') {
                $builder->where('os.id IS NULL', null, false);
            } else {
                $builder->where('os.status', $filters['subscription_status']);
            }
        }

        $sortable = [
            'created_at' => 'o.created_at',
            'name' => 'o.name',
            'members' => 'member_count',
            'hours' => 'seconds_30d',
            'amount' => 'os.amount',
            'last_activity' => 'last_activity_at',
        ];
        $sort = $sortable[$filters['sort'] ?? 'created_at'] ?? 'o.created_at';
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy($sort, $direction)
            ->limit($perPage, $offset)
            ->get()
            ->getResultArray();

        return [
            'data' => array_map(fn (array $row) => $this->formatListRow($row), $rows),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    private function formatListRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'uuid' => $row['uuid'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'is_active' => (bool) $row['is_active'],
            'php_timezone' => $row['php_timezone'] ?? 'UTC',
            'currency' => $row['currency'] ?? 'USD',
            'created_at' => $row['created_at'],
            'owner' => [
                'id' => $row['owner_id'] !== null ? (int) $row['owner_id'] : null,
                'name' => trim(($row['owner_first_name'] ?? '') . ' ' . ($row['owner_last_name'] ?? '')) ?: null,
                'email' => $row['owner_email'],
            ],
            'plan' => [
                'id' => $row['plan_id'] !== null ? (int) $row['plan_id'] : null,
                'name' => $row['plan_name'] ?? 'No plan',
                'slug' => $row['plan_slug'],
            ],
            'subscription' => [
                'id' => $row['subscription_id'] !== null ? (int) $row['subscription_id'] : null,
                'status' => $row['subscription_status'],
                'billing_cycle' => $row['billing_cycle'],
                'amount' => (float) ($row['amount'] ?? 0),
                'mrr' => $this->normalizeToMrr((float) ($row['amount'] ?? 0), (string) ($row['billing_cycle'] ?? 'monthly')),
                'user_count' => (int) ($row['user_count'] ?? 0),
                'current_period_end' => $row['current_period_end'],
                'trial_ends_at' => $row['subscription_trial_ends_at'],
                'cancel_at_period_end' => (bool) ($row['cancel_at_period_end'] ?? false),
                'is_stripe_linked' => !empty($row['stripe_subscription_id']),
            ],
            'member_count' => (int) $row['member_count'],
            'project_count' => (int) $row['project_count'],
            'hours_30d' => round(((int) $row['seconds_30d']) / 3600, 1),
            'last_activity_at' => $row['last_activity_at'],
        ];
    }

    private function normalizeToMrr(float $amount, string $cycle): float
    {
        return round($cycle === 'yearly' ? $amount / 12 : $amount, 2);
    }

    public function detail(int $organizationId): ?array
    {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            return null;
        }

        $owner = !empty($org['owner_id'])
            ? $this->db->table('users')
                ->select('id, first_name, last_name, email, avatar_url, created_at')
                ->where('id', $org['owner_id'])
                ->get()
                ->getRowArray()
            : null;

        $members = $this->db->table('organization_members om')
            ->select('
                om.id, om.user_id, om.role, om.hourly_rate, om.joined_at,
                u.first_name, u.last_name, u.email, u.is_active, u.email_verified_at,
                u.avatar_url, r.name AS role_name,
                (SELECT COALESCE(SUM(te.duration_seconds), 0) FROM time_entries te
                    WHERE te.user_id = om.user_id AND te.organization_id = om.organization_id
                      AND te.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS seconds_30d
            ', false)
            ->join('users u', 'u.id = om.user_id')
            ->join('roles r', 'r.id = om.role_id', 'left')
            ->where('om.organization_id', $organizationId)
            ->orderBy('om.joined_at', 'ASC')
            ->get()
            ->getResultArray();

        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);

        $history = $this->db->table('subscription_history sh')
            ->select('sh.*, fp.name AS from_plan, tp.name AS to_plan')
            ->join('plans fp', 'fp.id = sh.from_plan_id', 'left')
            ->join('plans tp', 'tp.id = sh.to_plan_id', 'left')
            ->where('sh.organization_id', $organizationId)
            ->orderBy('sh.created_at', 'DESC')
            ->limit(25)
            ->get()
            ->getResultArray();

        $usage = $this->db->query("
            SELECT
                (SELECT COUNT(*) FROM projects WHERE organization_id = ?) AS projects,
                (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.organization_id = ?) AS tasks,
                (SELECT COUNT(*) FROM time_entries WHERE organization_id = ?) AS time_entries,
                (SELECT COALESCE(SUM(duration_seconds), 0) FROM time_entries WHERE organization_id = ?) AS total_seconds,
                (SELECT COALESCE(SUM(duration_seconds), 0) FROM time_entries
                    WHERE organization_id = ? AND started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS seconds_30d,
                (SELECT COUNT(*) FROM screenshots s JOIN time_entries te ON te.id = s.time_entry_id
                    WHERE te.organization_id = ?) AS screenshots,
                (SELECT COUNT(*) FROM invoices WHERE organization_id = ?) AS invoices,
                (SELECT COUNT(*) FROM clients WHERE organization_id = ?) AS clients,
                (SELECT COUNT(*) FROM api_keys WHERE organization_id = ?) AS api_keys,
                (SELECT COUNT(*) FROM organization_invitations WHERE organization_id = ?) AS pending_invitations
        ", array_fill(0, 10, $organizationId))->getRowArray() ?: [];

        $dailyHours = $this->db->query("
            SELECT DATE(started_at) AS day, COALESCE(SUM(duration_seconds), 0) AS seconds
            FROM time_entries
            WHERE organization_id = ? AND started_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(started_at)
            ORDER BY day ASC
        ", [$organizationId])->getResultArray();

        $integrations = $this->db->table('organization_integrations')
            ->select('provider, is_enabled, updated_at')
            ->where('organization_id', $organizationId)
            ->get()
            ->getResultArray();

        $activeSessions = $this->db->table('time_entries te')
            ->select('te.id, te.user_id, te.started_at, u.first_name, u.last_name, p.name AS project_name')
            ->join('users u', 'u.id = te.user_id')
            ->join('projects p', 'p.id = te.project_id', 'left')
            ->where('te.organization_id', $organizationId)
            ->where('te.ended_at', null)
            ->get()
            ->getResultArray();

        $auditLogs = $this->db->table('audit_logs al')
            ->select('al.id, al.action, al.entity_type, al.entity_id, al.created_at, u.first_name, u.last_name')
            ->join('users u', 'u.id = al.user_id', 'left')
            ->where('al.organization_id', $organizationId)
            ->orderBy('al.created_at', 'DESC')
            ->limit(20)
            ->get()
            ->getResultArray();

        return [
            'organization' => [
                'id' => (int) $org['id'],
                'uuid' => $org['uuid'],
                'name' => $org['name'],
                'slug' => $org['slug'],
                'is_active' => (bool) $org['is_active'],
                'currency' => $org['currency'] ?? 'USD',
                'php_timezone' => $org['php_timezone'] ?? 'UTC',
                'trial_ends_at' => $org['trial_ends_at'] ?? null,
                'created_at' => $org['created_at'],
                'settings' => $this->decodeSettings($org['settings'] ?? null),
            ],
            'owner' => $owner,
            'members' => array_map(static function (array $m) {
                $m['hours_30d'] = round(((int) $m['seconds_30d']) / 3600, 1);
                unset($m['seconds_30d']);
                $m['is_active'] = (bool) $m['is_active'];

                return $m;
            }, $members),
            'subscription' => $subscription,
            'subscription_history' => $history,
            'usage' => [
                'projects' => (int) ($usage['projects'] ?? 0),
                'tasks' => (int) ($usage['tasks'] ?? 0),
                'time_entries' => (int) ($usage['time_entries'] ?? 0),
                'total_hours' => round(((int) ($usage['total_seconds'] ?? 0)) / 3600, 1),
                'hours_30d' => round(((int) ($usage['seconds_30d'] ?? 0)) / 3600, 1),
                'screenshots' => (int) ($usage['screenshots'] ?? 0),
                'invoices' => (int) ($usage['invoices'] ?? 0),
                'clients' => (int) ($usage['clients'] ?? 0),
                'api_keys' => (int) ($usage['api_keys'] ?? 0),
                'pending_invitations' => (int) ($usage['pending_invitations'] ?? 0),
            ],
            'daily_hours' => array_map(static fn (array $r) => [
                'day' => $r['day'],
                'label' => date('M j', strtotime($r['day'])),
                'hours' => round(((int) $r['seconds']) / 3600, 2),
            ], $dailyHours),
            'integrations' => $integrations,
            'active_sessions' => $activeSessions,
            'audit_logs' => $auditLogs,
        ];
    }

    private function decodeSettings(?string $settings): ?array
    {
        if (!$settings) {
            return null;
        }
        $decoded = json_decode($settings, true);

        return is_array($decoded) ? $decoded : null;
    }

    public function setActive(int $organizationId, bool $isActive, int $adminUserId, ?string $reason = null): array
    {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            throw new \RuntimeException('Organization not found');
        }

        $this->db->table('organizations')->where('id', $organizationId)->update(['is_active' => $isActive ? 1 : 0]);

        $this->recordAdminAction(
            $adminUserId,
            $isActive ? 'organization.activate' : 'organization.suspend',
            'organization',
            $organizationId,
            ['name' => $org['name'], 'reason' => $reason],
            $organizationId
        );

        return ['id' => $organizationId, 'is_active' => $isActive];
    }

    /**
     * Move an organization onto a plan without touching Stripe.
     */
    public function changePlan(
        int $organizationId,
        int $planId,
        int $adminUserId,
        string $billingCycle = 'monthly',
        ?string $status = null,
        ?string $reason = null
    ): array {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            throw new \RuntimeException('Organization not found');
        }

        $plan = $this->planModel->find($planId);
        if (!$plan) {
            throw new \RuntimeException('Plan not found');
        }

        $billingCycle = in_array($billingCycle, ['monthly', 'yearly'], true) ? $billingCycle : 'monthly';
        $subscriptionService = new SubscriptionService();
        $userCount = $subscriptionService->resolveBillableUserCount($organizationId, $plan);
        $amount = $subscriptionService->calculatePrice($planId, $userCount, $billingCycle);

        $current = $this->subscriptionModel->getActiveSubscription($organizationId);
        $fromPlanId = $current['plan_id'] ?? null;
        $resolvedStatus = $status && in_array($status, ['trial', 'active', 'cancelled', 'expired', 'past_due'], true)
            ? $status
            : ($current['status'] ?? 'active');

        $periodEnd = $billingCycle === 'yearly'
            ? date('Y-m-d H:i:s', strtotime('+1 year'))
            : date('Y-m-d H:i:s', strtotime('+1 month'));

        $payload = [
            'plan_id' => $planId,
            'user_count' => $userCount,
            'amount' => $amount,
            'billing_cycle' => $billingCycle,
            'status' => $resolvedStatus,
            'cancel_at_period_end' => false,
            'cancelled_at' => null,
        ];

        if ($current) {
            $this->subscriptionModel->update($current['id'], $payload);
            $subscriptionId = (int) $current['id'];
        } else {
            $payload['organization_id'] = $organizationId;
            $payload['current_period_start'] = date('Y-m-d H:i:s');
            $payload['current_period_end'] = $periodEnd;
            if ($resolvedStatus === 'trial') {
                $payload['trial_ends_at'] = date('Y-m-d H:i:s', strtotime('+' . max(1, (int) $plan['trial_days']) . ' days'));
            }
            $this->subscriptionModel->insert($payload);
            $subscriptionId = (int) $this->subscriptionModel->getInsertID();
        }

        $this->db->table('subscription_history')->insert([
            'organization_id' => $organizationId,
            'from_plan_id' => $fromPlanId,
            'to_plan_id' => $planId,
            'action' => $fromPlanId && (int) $fromPlanId !== $planId ? 'upgrade' : 'subscribe',
            'amount' => $amount,
            'billing_cycle' => $billingCycle,
            'notes' => 'Changed by platform admin' . ($reason ? ': ' . $reason : ''),
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        $this->recordAdminAction(
            $adminUserId,
            'organization.plan_change',
            'subscription',
            $subscriptionId,
            [
                'organization' => $org['name'],
                'from_plan_id' => $fromPlanId,
                'to_plan_id' => $planId,
                'billing_cycle' => $billingCycle,
                'amount' => $amount,
                'status' => $resolvedStatus,
                'reason' => $reason,
            ],
            $organizationId
        );

        return $this->subscriptionModel->getActiveSubscription($organizationId) ?? [];
    }

    public function extendTrial(int $organizationId, int $days, int $adminUserId): array
    {
        $days = max(1, min(365, $days));
        $subscription = $this->subscriptionModel->getActiveSubscription($organizationId);
        if (!$subscription) {
            throw new \RuntimeException('No active subscription to extend');
        }

        $base = !empty($subscription['trial_ends_at']) && strtotime((string) $subscription['trial_ends_at']) > time()
            ? strtotime((string) $subscription['trial_ends_at'])
            : time();
        $newTrialEnd = date('Y-m-d H:i:s', strtotime("+{$days} days", $base));

        $this->subscriptionModel->update($subscription['id'], [
            'status' => 'trial',
            'trial_ends_at' => $newTrialEnd,
            'current_period_end' => $newTrialEnd,
        ]);
        $this->db->table('organizations')->where('id', $organizationId)->update(['trial_ends_at' => $newTrialEnd]);

        $this->recordAdminAction(
            $adminUserId,
            'organization.trial_extend',
            'subscription',
            (int) $subscription['id'],
            ['days' => $days, 'trial_ends_at' => $newTrialEnd],
            $organizationId
        );

        return ['trial_ends_at' => $newTrialEnd, 'days' => $days];
    }

    public function updateOrganization(int $organizationId, array $data, int $adminUserId): array
    {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            throw new \RuntimeException('Organization not found');
        }

        $allowed = array_intersect_key($data, array_flip(['name', 'currency', 'php_timezone']));
        if ($allowed === []) {
            throw new \RuntimeException('Nothing to update');
        }

        $this->db->table('organizations')->where('id', $organizationId)->update($allowed);

        $this->recordAdminAction(
            $adminUserId,
            'organization.update',
            'organization',
            $organizationId,
            $allowed,
            $organizationId
        );

        return $this->organizationModel->find($organizationId) ?? [];
    }

    /**
     * Hard-delete an organization. Foreign keys cascade the tenant's data.
     */
    public function delete(int $organizationId, int $adminUserId, ?string $reason = null): void
    {
        $org = $this->organizationModel->find($organizationId);
        if (!$org) {
            throw new \RuntimeException('Organization not found');
        }

        $this->recordAdminAction(
            $adminUserId,
            'organization.delete',
            'organization',
            $organizationId,
            ['name' => $org['name'], 'slug' => $org['slug'], 'reason' => $reason],
            null
        );

        $this->db->transStart();
        // `audit_logs` has no FK cascade to organizations, so clear it first.
        $this->db->table('audit_logs')->where('organization_id', $organizationId)->delete();
        $this->db->table('organizations')->where('id', $organizationId)->delete();
        $this->db->transComplete();

        if ($this->db->transStatus() === false) {
            throw new \RuntimeException('Failed to delete organization');
        }
    }
}
