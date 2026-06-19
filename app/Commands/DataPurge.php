<?php

namespace App\Commands;

use App\Models\PlanModel;
use App\Models\SubscriptionModel;
use App\Services\OrganizationSettingsService;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

class DataPurge extends BaseCommand
{
    protected $group       = 'Data';
    protected $name        = 'data:purge';
    protected $description = 'Purge old screenshots and activity logs per plan data_retention';
    protected $usage       = 'data:purge';

    public function run(array $params)
    {
        $db = \Config\Database::connect();
        $planModel = new PlanModel();
        $subscriptionModel = new SubscriptionModel();

        $organizations = $db->table('organizations')->select('id')->get()->getResultArray();
        $totalScreenshots = 0;
        $totalActivity = 0;

        foreach ($organizations as $org) {
            $orgId = (int) $org['id'];
            $subscription = $subscriptionModel->getActiveSubscription($orgId);
            $settingsService = new OrganizationSettingsService();
            $effective = $settingsService->getEffectiveTrackingConfig($orgId);

            $planRetention = null;
            if ($subscription) {
                $planRetention = $planModel->getFeatureValue((int) $subscription['plan_id'], 'data_retention');
            }

            $orgRetention = (int) ($effective['screenshot_retention_days'] ?? 90);
            if ($planRetention && $planRetention !== 'unlimited') {
                $days = min($orgRetention, (int) $planRetention);
            } elseif ($orgRetention > 0) {
                $days = $orgRetention;
            } else {
                continue;
            }

            if ($days <= 0) {
                continue;
            }

            $cutoff = date('Y-m-d H:i:s', strtotime("-{$days} days"));

            $screenshots = $db->table('screenshots s')
                ->select('s.id, s.file_path')
                ->join('time_entries te', 'te.id = s.time_entry_id')
                ->where('te.organization_id', $orgId)
                ->where('s.captured_at <', $cutoff)
                ->where('s.deleted_by_user', 0)
                ->get()
                ->getResultArray();

            foreach ($screenshots as $shot) {
                $path = WRITEPATH . 'uploads/screenshots/' . $shot['file_path'];
                if (is_file($path)) {
                    @unlink($path);
                }
                $db->table('screenshots')->where('id', $shot['id'])->delete();
                $totalScreenshots++;
            }

            $activityIds = $db->table('activity_logs al')
                ->select('al.id')
                ->join('time_entries te', 'te.id = al.time_entry_id')
                ->where('te.organization_id', $orgId)
                ->where('al.logged_at <', $cutoff)
                ->get()
                ->getResultArray();

            if (!empty($activityIds)) {
                $ids = array_column($activityIds, 'id');
                $db->table('activity_logs')->whereIn('id', $ids)->delete();
                $totalActivity += count($ids);
            }

            $db->table('daily_idle_stats')
                ->where('organization_id', $orgId)
                ->where('date <', date('Y-m-d', strtotime($cutoff)))
                ->delete();
        }

        CLI::write("Purged {$totalScreenshots} screenshot(s) and {$totalActivity} activity log(s).", 'green');
    }
}
