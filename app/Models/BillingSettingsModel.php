<?php

namespace App\Models;

use CodeIgniter\Model;

class BillingSettingsModel extends Model
{
    protected $table = 'billing_settings';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $allowedFields = [
        'slider_min',
        'slider_max',
        'slider_step',
        'slider_default',
        'slider_marks',
        'yearly_discount_percent',
        'updated_at',
    ];

    public function getSettings(): array
    {
        $row = $this->find(1);
        if (!$row) {
            return $this->defaults();
        }

        $marks = $row['slider_marks'] ?? null;
        if (is_string($marks)) {
            $decoded = json_decode($marks, true);
            $row['slider_marks'] = is_array($decoded) ? $decoded : $this->defaults()['slider_marks'];
        }

        return array_merge($this->defaults(), $row);
    }

    private function defaults(): array
    {
        return [
            'slider_min' => 1,
            'slider_max' => 200,
            'slider_step' => 5,
            'slider_default' => 5,
            'slider_marks' => [1, 5, 25, 50, 100, 150, 200],
            'yearly_discount_percent' => 10.0,
        ];
    }
}
