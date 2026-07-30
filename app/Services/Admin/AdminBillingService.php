<?php

namespace App\Services\Admin;

use App\Models\SubscriptionModel;
use CodeIgniter\Database\BaseConnection;

/**
 * Subscription and revenue reporting for the platform portal.
 */
class AdminBillingService
{
    use AdminAuditTrail;

    protected BaseConnection $db;
    protected SubscriptionModel $subscriptionModel;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->subscriptionModel = new SubscriptionModel();
    }

    /**
     * @param array{search?:string, status?:string, plan_id?:int|string, billing_cycle?:string, stripe?:string, sort?:string, direction?:string, page?:int, per_page?:int} $filters
     */
    public function listSubscriptions(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table('organization_subscriptions os')
            ->select('
                os.id, os.organization_id, os.plan_id, os.user_count, os.amount, os.billing_cycle,
                os.status, os.trial_ends_at, os.current_period_start, os.current_period_end,
                os.cancel_at_period_end, os.cancelled_at, os.stripe_subscription_id, os.stripe_customer_id,
                os.created_at,
                o.name AS organization_name, o.slug AS organization_slug, o.is_active AS organization_active,
                p.name AS plan_name, p.slug AS plan_slug,
                u.email AS owner_email
            ', false)
            ->join('organizations o', 'o.id = os.organization_id')
            ->join('plans p', 'p.id = os.plan_id', 'left')
            ->join('users u', 'u.id = o.owner_id', 'left');

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('o.name', $search)
                ->orLike('u.email', $search)
                ->orLike('os.stripe_subscription_id', $search)
                ->orLike('os.stripe_customer_id', $search)
                ->groupEnd();
        }

        if (!empty($filters['status'])) {
            $builder->where('os.status', $filters['status']);
        }

        if (!empty($filters['plan_id'])) {
            $builder->where('os.plan_id', (int) $filters['plan_id']);
        }

        if (!empty($filters['billing_cycle'])) {
            $builder->where('os.billing_cycle', $filters['billing_cycle']);
        }

        if (($filters['stripe'] ?? '') === 'linked') {
            $builder->where('os.stripe_subscription_id IS NOT NULL', null, false);
        } elseif (($filters['stripe'] ?? '') === 'unlinked') {
            $builder->where('os.stripe_subscription_id IS NULL', null, false);
        }

        $sortable = [
            'created_at' => 'os.created_at',
            'amount' => 'os.amount',
            'period_end' => 'os.current_period_end',
            'organization' => 'o.name',
        ];
        $sort = $sortable[$filters['sort'] ?? 'created_at'] ?? 'os.created_at';
        $direction = strtolower((string) ($filters['direction'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy($sort, $direction)->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => array_map(static function (array $row) {
                $amount = (float) $row['amount'];
                $row['id'] = (int) $row['id'];
                $row['organization_id'] = (int) $row['organization_id'];
                $row['plan_id'] = $row['plan_id'] !== null ? (int) $row['plan_id'] : null;
                $row['amount'] = $amount;
                $row['mrr'] = round($row['billing_cycle'] === 'yearly' ? $amount / 12 : $amount, 2);
                $row['user_count'] = (int) $row['user_count'];
                $row['cancel_at_period_end'] = (bool) $row['cancel_at_period_end'];
                $row['organization_active'] = (bool) $row['organization_active'];
                $row['is_stripe_linked'] = !empty($row['stripe_subscription_id']);

                return $row;
            }, $rows),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
            'summary' => $this->subscriptionSummary(),
        ];
    }

    public function subscriptionSummary(): array
    {
        $rows = $this->db->query("
            SELECT
                status,
                COUNT(*) AS accounts,
                COALESCE(SUM(CASE WHEN billing_cycle = 'yearly' THEN amount / 12 ELSE amount END), 0) AS mrr,
                COALESCE(SUM(user_count), 0) AS seats
            FROM organization_subscriptions
            GROUP BY status
        ")->getResultArray();

        $out = [];
        foreach ($rows as $row) {
            $out[$row['status']] = [
                'accounts' => (int) $row['accounts'],
                'mrr' => round((float) $row['mrr'], 2),
                'seats' => (int) $row['seats'],
            ];
        }

        return $out;
    }

    /**
     * Monthly revenue movement derived from `subscription_history`.
     */
    public function getRevenueTrend(int $months = 12): array
    {
        $months = max(3, min(36, $months));

        $rows = $this->db->query("
            SELECT
                DATE_FORMAT(created_at, '%Y-%m') AS month,
                action,
                COUNT(*) AS events,
                COALESCE(SUM(amount), 0) AS amount
            FROM subscription_history
            WHERE created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m'), action
            ORDER BY month ASC
        ", [$months - 1])->getResultArray();

        $byMonth = [];
        foreach ($rows as $row) {
            $month = $row['month'];
            $byMonth[$month] ??= ['new' => 0.0, 'expansion' => 0.0, 'churned' => 0, 'events' => 0];
            $byMonth[$month]['events'] += (int) $row['events'];

            if (in_array($row['action'], ['subscribe', 'stripe_checkout'], true)) {
                $byMonth[$month]['new'] += (float) $row['amount'];
            } elseif (in_array($row['action'], ['upgrade', 'renew', 'renewal'], true)) {
                $byMonth[$month]['expansion'] += (float) $row['amount'];
            } elseif ($row['action'] === 'cancel') {
                $byMonth[$month]['churned'] += (int) $row['events'];
            }
        }

        $series = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("first day of -{$i} month"));
            $bucket = $byMonth[$month] ?? ['new' => 0.0, 'expansion' => 0.0, 'churned' => 0, 'events' => 0];
            $series[] = [
                'month' => $month,
                'label' => date('M Y', strtotime($month . '-01')),
                'new_revenue' => round($bucket['new'], 2),
                'expansion_revenue' => round($bucket['expansion'], 2),
                'cancellations' => $bucket['churned'],
                'events' => $bucket['events'],
            ];
        }

        return $series;
    }

    /**
     * Force a subscription status (e.g. clear a stuck past_due) without Stripe.
     */
    public function updateSubscriptionStatus(int $subscriptionId, string $status, int $adminUserId, ?string $reason = null): array
    {
        $allowed = ['trial', 'active', 'cancelled', 'expired', 'past_due'];
        if (!in_array($status, $allowed, true)) {
            throw new \RuntimeException('Invalid subscription status');
        }

        $subscription = $this->subscriptionModel->find($subscriptionId);
        if (!$subscription) {
            throw new \RuntimeException('Subscription not found');
        }

        $payload = ['status' => $status];
        if ($status === 'cancelled') {
            $payload['cancelled_at'] = date('Y-m-d H:i:s');
        } elseif ($status === 'active') {
            $payload['cancelled_at'] = null;
            $payload['cancel_at_period_end'] = false;
        }

        $this->subscriptionModel->update($subscriptionId, $payload);

        if ($status === 'cancelled') {
            $this->db->table('subscription_history')->insert([
                'organization_id' => (int) $subscription['organization_id'],
                'from_plan_id' => $subscription['plan_id'],
                'to_plan_id' => $subscription['plan_id'],
                'action' => 'cancel',
                'amount' => $subscription['amount'],
                'billing_cycle' => $subscription['billing_cycle'],
                'notes' => 'Cancelled by platform admin' . ($reason ? ': ' . $reason : ''),
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        }

        $this->recordAdminAction(
            $adminUserId,
            'subscription.status_change',
            'subscription',
            $subscriptionId,
            ['from' => $subscription['status'], 'to' => $status, 'reason' => $reason],
            (int) $subscription['organization_id']
        );

        return $this->subscriptionModel->find($subscriptionId) ?? [];
    }

    /**
     * Client-facing invoices across all tenants — useful for support lookups.
     */
    public function listInvoices(array $filters = []): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table('invoices i')
            ->select('i.id, i.invoice_number, i.organization_id, i.client_name, i.client_email, i.status,
                      i.total, i.currency, i.issue_date, i.due_date, i.paid_at, i.created_at,
                      o.name AS organization_name', false)
            ->join('organizations o', 'o.id = i.organization_id', 'left');

        if (!empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $builder->groupStart()
                ->like('i.invoice_number', $search)
                ->orLike('i.client_name', $search)
                ->orLike('i.client_email', $search)
                ->orLike('o.name', $search)
                ->groupEnd();
        }

        if (!empty($filters['status'])) {
            $builder->where('i.status', $filters['status']);
        }

        if (!empty($filters['organization_id'])) {
            $builder->where('i.organization_id', (int) $filters['organization_id']);
        }

        $total = $builder->countAllResults(false);
        $rows = $builder->orderBy('i.created_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();

        $totals = $this->db->query("
            SELECT status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount
            FROM invoices GROUP BY status
        ")->getResultArray();

        return [
            'data' => $rows,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
            'totals_by_status' => $totals,
        ];
    }
}
