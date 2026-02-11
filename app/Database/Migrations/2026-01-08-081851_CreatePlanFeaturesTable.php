<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePlanFeaturesTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
                'auto_increment' => true,
            ],
            'plan_id' => [
                'type' => 'BIGINT',
                'constraint' => 20,
                'unsigned' => true,
            ],
            'feature_key' => [
                'type' => 'VARCHAR',
                'constraint' => 100,
                'comment' => 'max_users, max_projects, screenshots, etc.',
            ],
            'feature_value' => [
                'type' => 'VARCHAR',
                'constraint' => 255,
                'comment' => 'Value: number, unlimited, true, false',
            ],
            'display_name' => [
                'type' => 'VARCHAR',
                'constraint' => 255,
            ],
            'created_at' => [
                'type' => 'TIMESTAMP',
                'null' => true,
            ],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('plan_id');
        $this->forge->addUniqueKey(['plan_id', 'feature_key']);
        $this->forge->addForeignKey('plan_id', 'plans', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('plan_features');

        // Seed plan features
        $this->seedPlanFeatures();
    }

    private function seedPlanFeatures()
    {
        $features = [];

        // Free Plan (plan_id = 1)
        $freeFeatures = [
            ['plan_id' => 1, 'feature_key' => 'max_users', 'feature_value' => '1', 'display_name' => 'Single user only'],
            ['plan_id' => 1, 'feature_key' => 'max_projects', 'feature_value' => '2', 'display_name' => 'Up to 2 projects'],
            ['plan_id' => 1, 'feature_key' => 'max_tasks_per_project', 'feature_value' => '10', 'display_name' => '10 tasks per project'],
            ['plan_id' => 1, 'feature_key' => 'screenshots', 'feature_value' => 'false', 'display_name' => 'No screenshot monitoring'],
            ['plan_id' => 1, 'feature_key' => 'screenshot_interval', 'feature_value' => '0', 'display_name' => 'No screenshots'],
            ['plan_id' => 1, 'feature_key' => 'activity_tracking', 'feature_value' => 'false', 'display_name' => 'No activity tracking'],
            ['plan_id' => 1, 'feature_key' => 'reports', 'feature_value' => 'basic', 'display_name' => 'Basic reports only'],
            ['plan_id' => 1, 'feature_key' => 'report_export', 'feature_value' => 'false', 'display_name' => 'No report export'],
            ['plan_id' => 1, 'feature_key' => 'invoicing', 'feature_value' => 'false', 'display_name' => 'No invoicing'],
            ['plan_id' => 1, 'feature_key' => 'custom_roles', 'feature_value' => 'false', 'display_name' => 'Basic roles only'],
            ['plan_id' => 1, 'feature_key' => 'api_access', 'feature_value' => 'false', 'display_name' => 'No API access'],
            ['plan_id' => 1, 'feature_key' => 'support', 'feature_value' => 'community', 'display_name' => 'Community support'],
            ['plan_id' => 1, 'feature_key' => 'data_retention', 'feature_value' => '30', 'display_name' => '30 days data retention'],
        ];

        // Starter Plan (plan_id = 2)
        $starterFeatures = [
            ['plan_id' => 2, 'feature_key' => 'max_users', 'feature_value' => '5', 'display_name' => 'Up to 5 team members'],
            ['plan_id' => 2, 'feature_key' => 'max_projects', 'feature_value' => '10', 'display_name' => 'Up to 10 projects'],
            ['plan_id' => 2, 'feature_key' => 'max_tasks_per_project', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited tasks'],
            ['plan_id' => 2, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Screenshot monitoring'],
            ['plan_id' => 2, 'feature_key' => 'screenshot_interval', 'feature_value' => '10', 'display_name' => 'Every 10 minutes'],
            ['plan_id' => 2, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'Blur sensitive content'],
            ['plan_id' => 2, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'Activity tracking'],
            ['plan_id' => 2, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'Productivity categorization'],
            ['plan_id' => 2, 'feature_key' => 'reports', 'feature_value' => 'advanced', 'display_name' => 'Advanced reports'],
            ['plan_id' => 2, 'feature_key' => 'report_export', 'feature_value' => 'csv', 'display_name' => 'Export to CSV'],
            ['plan_id' => 2, 'feature_key' => 'invoicing', 'feature_value' => 'false', 'display_name' => 'No invoicing'],
            ['plan_id' => 2, 'feature_key' => 'custom_roles', 'feature_value' => 'false', 'display_name' => 'Standard roles'],
            ['plan_id' => 2, 'feature_key' => 'api_access', 'feature_value' => 'limited', 'display_name' => 'Limited API access'],
            ['plan_id' => 2, 'feature_key' => 'api_rate_limit', 'feature_value' => '1000', 'display_name' => '1,000 requests/day'],
            ['plan_id' => 2, 'feature_key' => 'support', 'feature_value' => 'email', 'display_name' => 'Email support'],
            ['plan_id' => 2, 'feature_key' => 'data_retention', 'feature_value' => '90', 'display_name' => '90 days data retention'],
        ];

        // Professional Plan (plan_id = 3)
        $proFeatures = [
            ['plan_id' => 3, 'feature_key' => 'max_users', 'feature_value' => '25', 'display_name' => 'Up to 25 team members'],
            ['plan_id' => 3, 'feature_key' => 'max_projects', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited projects'],
            ['plan_id' => 3, 'feature_key' => 'max_tasks_per_project', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited tasks'],
            ['plan_id' => 3, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Screenshot monitoring'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_interval', 'feature_value' => '5', 'display_name' => 'Every 5 minutes'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'Blur sensitive content'],
            ['plan_id' => 3, 'feature_key' => 'screenshot_ocr', 'feature_value' => 'true', 'display_name' => 'OCR text search'],
            ['plan_id' => 3, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'Advanced activity tracking'],
            ['plan_id' => 3, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'Custom productivity rules'],
            ['plan_id' => 3, 'feature_key' => 'reports', 'feature_value' => 'advanced', 'display_name' => 'Advanced reports & analytics'],
            ['plan_id' => 3, 'feature_key' => 'report_export', 'feature_value' => 'all', 'display_name' => 'Export to CSV, PDF, Excel'],
            ['plan_id' => 3, 'feature_key' => 'team_leaderboard', 'feature_value' => 'true', 'display_name' => 'Team leaderboard'],
            ['plan_id' => 3, 'feature_key' => 'invoicing', 'feature_value' => 'true', 'display_name' => 'Invoicing & billing'],
            ['plan_id' => 3, 'feature_key' => 'custom_roles', 'feature_value' => 'true', 'display_name' => 'Custom roles & permissions'],
            ['plan_id' => 3, 'feature_key' => 'api_access', 'feature_value' => 'full', 'display_name' => 'Full API access'],
            ['plan_id' => 3, 'feature_key' => 'api_rate_limit', 'feature_value' => '10000', 'display_name' => '10,000 requests/day'],
            ['plan_id' => 3, 'feature_key' => 'webhooks', 'feature_value' => 'true', 'display_name' => 'Webhook integrations'],
            ['plan_id' => 3, 'feature_key' => 'support', 'feature_value' => 'priority', 'display_name' => 'Priority support'],
            ['plan_id' => 3, 'feature_key' => 'data_retention', 'feature_value' => '365', 'display_name' => '1 year data retention'],
        ];

        // Enterprise Plan (plan_id = 4)
        $enterpriseFeatures = [
            ['plan_id' => 4, 'feature_key' => 'max_users', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited team members'],
            ['plan_id' => 4, 'feature_key' => 'max_projects', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited projects'],
            ['plan_id' => 4, 'feature_key' => 'max_tasks_per_project', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited tasks'],
            ['plan_id' => 4, 'feature_key' => 'screenshots', 'feature_value' => 'true', 'display_name' => 'Advanced screenshot monitoring'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_interval', 'feature_value' => '3', 'display_name' => 'Every 3 minutes'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_blur', 'feature_value' => 'true', 'display_name' => 'AI-powered blur'],
            ['plan_id' => 4, 'feature_key' => 'screenshot_ocr', 'feature_value' => 'true', 'display_name' => 'Advanced OCR search'],
            ['plan_id' => 4, 'feature_key' => 'activity_tracking', 'feature_value' => 'true', 'display_name' => 'AI activity insights'],
            ['plan_id' => 4, 'feature_key' => 'productivity_rules', 'feature_value' => 'true', 'display_name' => 'AI productivity analysis'],
            ['plan_id' => 4, 'feature_key' => 'reports', 'feature_value' => 'enterprise', 'display_name' => 'Enterprise analytics'],
            ['plan_id' => 4, 'feature_key' => 'report_export', 'feature_value' => 'all', 'display_name' => 'All export formats'],
            ['plan_id' => 4, 'feature_key' => 'team_leaderboard', 'feature_value' => 'true', 'display_name' => 'Advanced leaderboard'],
            ['plan_id' => 4, 'feature_key' => 'invoicing', 'feature_value' => 'true', 'display_name' => 'Advanced invoicing'],
            ['plan_id' => 4, 'feature_key' => 'custom_roles', 'feature_value' => 'true', 'display_name' => 'Unlimited custom roles'],
            ['plan_id' => 4, 'feature_key' => 'white_label', 'feature_value' => 'true', 'display_name' => 'White-label branding'],
            ['plan_id' => 4, 'feature_key' => 'custom_domain', 'feature_value' => 'true', 'display_name' => 'Custom domain'],
            ['plan_id' => 4, 'feature_key' => 'sso', 'feature_value' => 'true', 'display_name' => 'Single Sign-On (SSO)'],
            ['plan_id' => 4, 'feature_key' => 'saml', 'feature_value' => 'true', 'display_name' => 'SAML authentication'],
            ['plan_id' => 4, 'feature_key' => 'api_access', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited API access'],
            ['plan_id' => 4, 'feature_key' => 'api_rate_limit', 'feature_value' => 'unlimited', 'display_name' => 'No rate limits'],
            ['plan_id' => 4, 'feature_key' => 'webhooks', 'feature_value' => 'true', 'display_name' => 'Advanced webhooks'],
            ['plan_id' => 4, 'feature_key' => 'dedicated_server', 'feature_value' => 'true', 'display_name' => 'Dedicated server option'],
            ['plan_id' => 4, 'feature_key' => 'support', 'feature_value' => 'dedicated', 'display_name' => 'Dedicated account manager'],
            ['plan_id' => 4, 'feature_key' => 'sla', 'feature_value' => '99.9', 'display_name' => '99.9% uptime SLA'],
            ['plan_id' => 4, 'feature_key' => 'data_retention', 'feature_value' => 'unlimited', 'display_name' => 'Unlimited data retention'],
        ];

        $features = array_merge($freeFeatures, $starterFeatures, $proFeatures, $enterpriseFeatures);
        $this->db->table('plan_features')->insertBatch($features);
    }

    public function down()
    {
        $this->forge->dropTable('plan_features');
    }
}
