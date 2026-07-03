<?php

namespace App\Models;

use CodeIgniter\Model;

class TimeEntryGithubLinkModel extends Model
{
    protected $table            = 'time_entry_github_links';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [
        'organization_id', 'time_entry_id', 'user_id', 'type', 'repo',
        'external_id', 'title', 'url', 'authored_at',
    ];

    protected $useTimestamps = true;
    protected $dateFormat    = 'datetime';
    protected $createdField  = 'created_at';
    protected $updatedField  = '';

    /**
     * @return array<int, array<string, mixed>>
     */
    public function forTimeEntry(int $timeEntryId): array
    {
        return $this->where('time_entry_id', $timeEntryId)->orderBy('authored_at', 'DESC')->findAll();
    }
}
