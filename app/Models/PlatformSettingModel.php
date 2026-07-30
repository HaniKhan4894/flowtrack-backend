<?php

namespace App\Models;

use CodeIgniter\Model;

class PlatformSettingModel extends Model
{
    protected $table            = 'platform_settings';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = ['setting_key', 'setting_value', 'updated_by', 'updated_at'];

    protected $useTimestamps = false;

    /** @return array<string, string|null> */
    public function allValues(): array
    {
        $rows = $this->findAll();
        $out = [];
        foreach ($rows as $row) {
            $out[$row['setting_key']] = $row['setting_value'];
        }

        return $out;
    }

    public function getValue(string $key, ?string $default = null): ?string
    {
        $row = $this->where('setting_key', $key)->first();

        return $row ? ($row['setting_value'] ?? $default) : $default;
    }

    public function setValue(string $key, ?string $value, ?int $updatedBy = null): void
    {
        $existing = $this->where('setting_key', $key)->first();
        $payload = [
            'setting_value' => $value,
            'updated_by' => $updatedBy,
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        if ($existing) {
            $this->update($existing['id'], $payload);

            return;
        }

        $this->insert($payload + ['setting_key' => $key]);
    }
}
