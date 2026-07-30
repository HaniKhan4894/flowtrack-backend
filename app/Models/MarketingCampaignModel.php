<?php

namespace App\Models;

use CodeIgniter\Model;

class MarketingCampaignModel extends Model
{
    protected $table            = 'marketing_campaigns';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'name', 'goal', 'segment_key', 'segment_config', 'channel', 'subject', 'body',
        'cta_label', 'cta_url', 'coupon_id', 'status', 'mode', 'scheduled_at',
        'interval_hours', 'cooldown_days', 'max_per_run', 'attribution_days',
        'last_run_at', 'next_run_at', 'total_recipients', 'total_sent', 'total_failed',
        'total_opened', 'total_clicked', 'total_converted', 'converted_revenue',
        'is_playbook', 'playbook_key', 'created_by',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
        'name' => 'required|max_length[191]',
        'subject' => 'required|max_length[255]',
        'body' => 'required',
        'segment_key' => 'required|max_length[60]',
    ];

    /**
     * Campaigns the CLI runner should process now: due one-offs and recurring automations.
     */
    public function due(int $limit = 20): array
    {
        $now = date('Y-m-d H:i:s');

        return $this->groupStart()
                ->groupStart()
                    ->where('status', 'scheduled')
                    ->where('scheduled_at <=', $now)
                ->groupEnd()
                ->orGroupStart()
                    ->where('status', 'active')
                    ->where('mode', 'recurring')
                    ->groupStart()
                        ->where('next_run_at IS NULL', null, false)
                        ->orWhere('next_run_at <=', $now)
                    ->groupEnd()
                ->groupEnd()
            ->groupEnd()
            ->orderBy('scheduled_at', 'ASC')
            ->findAll($limit);
    }
}
