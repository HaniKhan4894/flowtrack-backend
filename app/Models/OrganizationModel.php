<?php

namespace App\Models;

use CodeIgniter\Model;

class OrganizationModel extends Model
{
    protected $table = 'organizations';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $returnType = 'array';
    protected $useSoftDeletes = false;
    protected $protectFields = true;
    protected $allowedFields = [
        'uuid',
        'name',
        'slug',
        'owner_id',
        'settings',
        'billing_email',
        'country_id',
        'state_id',
        'city_id',
        'timezone_id',
        'php_timezone',
        'currency',
        'is_active',
        'trial_ends_at'
    ];

    protected bool $allowEmptyInserts = false;
    protected bool $updateOnlyChanged = true;

    // Dates
    protected $useTimestamps = true;
    protected $dateFormat = 'datetime';
    protected $createdField = 'created_at';
    protected $updatedField = 'updated_at';

    // Validation
    protected $validationRules = [
        'name' => 'required|max_length[255]',
        'slug' => 'permit_empty|alpha_dash|is_unique[organizations.slug,id,{id}]',
        'owner_id' => 'required|is_natural_no_zero',
    ];

    protected $validationMessages = [];
    protected $skipValidation = false;
    protected $cleanValidationRules = true;

    // Callbacks
    protected $allowCallbacks = true;
    protected $beforeInsert = ['generateUUID', 'generateSlug'];
    protected $beforeUpdate = [];

    protected function generateUUID(array $data)
    {
        if (!isset($data['data']['uuid'])) {
            $data['data']['uuid'] = sprintf(
                '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0xffff)
            );
        }
        return $data;
    }

    protected function generateSlug(array $data)
    {
        if (!isset($data['data']['slug']) && isset($data['data']['name'])) {
            $base = url_title($data['data']['name'], '-', true) ?: 'team';
            $slug = $base;
            $counter = 1;

            while ($this->where('slug', $slug)->first()) {
                $slug = $base . '-' . $counter;
                $counter++;
            }

            $data['data']['slug'] = $slug;
        }
        return $data;
    }
}
