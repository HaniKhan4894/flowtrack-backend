<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class BillingSettingsAndPlanFeatureFlags extends Migration
{
    public function up()
    {
        if (!$this->db->tableExists('billing_settings')) {
            $this->forge->addField([
                'id' => ['type' => 'INT', 'unsigned' => true],
                'slider_min' => ['type' => 'INT', 'default' => 1],
                'slider_max' => ['type' => 'INT', 'default' => 100],
                'slider_step' => ['type' => 'INT', 'default' => 1],
                'slider_default' => ['type' => 'INT', 'default' => 5],
                'slider_marks' => ['type' => 'JSON', 'null' => true],
                'yearly_discount_percent' => ['type' => 'DECIMAL', 'constraint' => '5,2', 'default' => 10.00],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ]);
            $this->forge->addKey('id', true);
            $this->forge->createTable('billing_settings');

            $this->db->table('billing_settings')->insert([
                'id' => 1,
                'slider_min' => 1,
                'slider_max' => 200,
                'slider_step' => 5,
                'slider_default' => 5,
                'slider_marks' => json_encode([1, 5, 25, 50, 100, 150, 200]),
                'yearly_discount_percent' => 10.00,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        }

        if ($this->db->tableExists('plans') && !$this->db->fieldExists('max_users', 'plans')) {
            $this->forge->addColumn('plans', [
                'max_users' => [
                    'type' => 'INT',
                    'unsigned' => true,
                    'null' => true,
                    'comment' => 'NULL = unlimited',
                    'after' => 'min_users',
                ],
            ]);

            $limits = [
                'free' => 1,
                'starter' => 5,
                'professional' => 25,
                'enterprise' => null,
            ];
            foreach ($limits as $slug => $max) {
                $this->db->table('plans')->where('slug', $slug)->update(['max_users' => $max]);
            }
        }

        if ($this->db->tableExists('plan_features')) {
            if (!$this->db->fieldExists('is_enabled', 'plan_features')) {
                $this->forge->addColumn('plan_features', [
                    'is_enabled' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'after' => 'display_name'],
                    'show_on_pricing' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1, 'after' => 'is_enabled'],
                    'sort_order' => ['type' => 'INT', 'default' => 0, 'after' => 'show_on_pricing'],
                ]);
            }

            $this->db->table('plan_features')->update(['is_enabled' => 1, 'show_on_pricing' => 1]);

            $hideOnPricing = [
                'screenshot_interval', 'screenshot_blur', 'screenshot_ocr', 'api_rate_limit',
                'reports', 'support', 'sla', 'saml',
            ];
            $this->db->table('plan_features')->whereIn('feature_key', $hideOnPricing)->update(['show_on_pricing' => 0]);

            $order = 0;
            foreach ([
                'max_users', 'max_projects', 'max_tasks_per_project', 'screenshots',
                'activity_tracking', 'productivity_rules', 'report_export', 'invoicing',
                'custom_roles', 'api_access', 'webhooks', 'white_label', 'sso',
                'data_retention', 'dedicated_server',
            ] as $key) {
                $this->db->table('plan_features')->where('feature_key', $key)->update(['sort_order' => $order]);
                $order += 10;
            }
        }
    }

    public function down()
    {
        if ($this->db->tableExists('plans') && $this->db->fieldExists('max_users', 'plans')) {
            $this->forge->dropColumn('plans', 'max_users');
        }
        if ($this->db->tableExists('plan_features') && $this->db->fieldExists('is_enabled', 'plan_features')) {
            $this->forge->dropColumn('plan_features', ['is_enabled', 'show_on_pricing', 'sort_order']);
        }
        $this->forge->dropTable('billing_settings', true);
    }
}
