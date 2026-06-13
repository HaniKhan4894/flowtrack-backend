<?php

namespace App\Services;

use App\Models\OrganizationModel;
use App\Models\SubscriptionModel;

class AdminService
{
    protected OrganizationModel $organizationModel;
    protected SubscriptionModel $subscriptionModel;
    protected $db;

    public function __construct()
    {
        $this->organizationModel = new OrganizationModel();
        $this->subscriptionModel = new SubscriptionModel();
        $this->db = \Config\Database::connect();
    }

    public function getOrganizationsOverview(): array
    {
        $orgs = $this->organizationModel
            ->select('organizations.*, users.email as owner_email, users.first_name as owner_first_name, users.last_name as owner_last_name')
            ->join('users', 'users.id = organizations.owner_id', 'left')
            ->orderBy('organizations.created_at', 'DESC')
            ->findAll();

        $result = [];
        foreach ($orgs as $org) {
            $memberCount = $this->db->table('organization_members')
                ->where('organization_id', $org['id'])
                ->countAllResults();

            $subscription = $this->subscriptionModel->getActiveSubscription((int) $org['id']);
            $plan = $subscription['plan'] ?? null;

            $result[] = [
                'id' => (int) $org['id'],
                'name' => $org['name'],
                'slug' => $org['slug'],
                'owner' => trim(($org['owner_first_name'] ?? '') . ' ' . ($org['owner_last_name'] ?? '')),
                'owner_email' => $org['owner_email'] ?? null,
                'member_count' => $memberCount,
                'plan_name' => $plan['name'] ?? 'None',
                'plan_slug' => $plan['slug'] ?? null,
                'subscription_status' => $subscription['status'] ?? null,
                'is_active' => (bool) ($org['is_active'] ?? true),
                'php_timezone' => $org['php_timezone'] ?? 'UTC',
                'created_at' => $org['created_at'],
            ];
        }

        return $result;
    }

    public function getSubscriptionStats(): array
    {
        $rows = $this->db->query("
            SELECT p.name, p.slug, COUNT(os.id) as org_count, COALESCE(SUM(os.amount), 0) as total_revenue
            FROM organization_subscriptions os
            JOIN plans p ON p.id = os.plan_id
            WHERE os.status IN ('trial', 'active')
            GROUP BY p.id, p.name, p.slug
            ORDER BY org_count DESC
        ")->getResultArray();

        return $rows;
    }

    public function getActivityOverview(): array
    {
        $activeTimers = $this->db->table('time_entries')
            ->select('time_entries.id, time_entries.user_id, time_entries.organization_id, time_entries.started_at, users.first_name, users.last_name, organizations.name as org_name')
            ->join('users', 'users.id = time_entries.user_id')
            ->join('organizations', 'organizations.id = time_entries.organization_id')
            ->where('time_entries.ended_at', null)
            ->orderBy('time_entries.started_at', 'DESC')
            ->limit(50)
            ->get()
            ->getResultArray();

        $recentEntries = $this->db->table('time_entries')
            ->select('time_entries.id, time_entries.user_id, time_entries.organization_id, time_entries.started_at, time_entries.ended_at, time_entries.duration_seconds, users.first_name, users.last_name, organizations.name as org_name')
            ->join('users', 'users.id = time_entries.user_id')
            ->join('organizations', 'organizations.id = time_entries.organization_id')
            ->where('time_entries.ended_at IS NOT NULL')
            ->orderBy('time_entries.ended_at', 'DESC')
            ->limit(20)
            ->get()
            ->getResultArray();

        return [
            'active_sessions' => $activeTimers,
            'recent_sessions' => $recentEntries,
        ];
    }

    public function getOrganizationDetail(int $orgId): ?array
    {
        $org = $this->organizationModel->find($orgId);
        if (!$org) {
            return null;
        }

        $members = $this->db->table('organization_members')
            ->select('organization_members.*, users.email, users.first_name, users.last_name')
            ->join('users', 'users.id = organization_members.user_id')
            ->where('organization_members.organization_id', $orgId)
            ->get()
            ->getResultArray();

        $subscription = $this->subscriptionModel->getActiveSubscription($orgId);
        $projectCount = $this->db->table('projects')->where('organization_id', $orgId)->countAllResults();
        $timeEntryCount = $this->db->table('time_entries')->where('organization_id', $orgId)->countAllResults();

        return [
            'organization' => $org,
            'members' => $members,
            'subscription' => $subscription,
            'usage' => [
                'projects' => $projectCount,
                'time_entries' => $timeEntryCount,
            ],
        ];
    }
}
