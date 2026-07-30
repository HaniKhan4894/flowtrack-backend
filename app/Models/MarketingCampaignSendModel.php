<?php

namespace App\Models;

use CodeIgniter\Model;

class MarketingCampaignSendModel extends Model
{
    protected $table            = 'marketing_campaign_sends';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'campaign_id', 'organization_id', 'user_id', 'email', 'token', 'status', 'channel',
        'error', 'sent_at', 'opened_at', 'open_count', 'clicked_at', 'click_count',
        'converted_at', 'conversion_amount',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = false;

    public function findByToken(string $token): ?array
    {
        return $this->where('token', $token)->first();
    }
}
