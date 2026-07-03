<?php

namespace App\Services;

use App\Models\AutomationModel;

/**
 * Phase 10 — Automations engine ("if trigger then action").
 *
 * A generalization of smart notifications: any registered event can trigger a
 * rule; if its (optional) conditions match the event context, its actions run
 * (Slack post, outbound webhook, in-app notify).
 */
class AutomationService
{
    /** Events that can start an automation. */
    public const TRIGGERS = [
        'time_entry.completed',
        'time_entry.updated',
        'time_entry.deleted',
        'timesheet.submitted',
        'timesheet.approved',
        'invoice.sent',
        'invoice.paid',
    ];

    /** Action types a rule can run. */
    public const ACTIONS = ['slack_post', 'teams_post', 'webhook', 'notify_managers'];

    protected AutomationModel $model;

    public function __construct()
    {
        $this->model = new AutomationModel();
    }

    /**
     * @return array<int, array<string,mixed>>
     */
    public function list(int $organizationId): array
    {
        $rows = $this->model
            ->where('organization_id', $organizationId)
            ->orderBy('created_at', 'DESC')
            ->findAll();

        return array_map(fn ($r) => $this->format($r), $rows);
    }

    public function metadata(): array
    {
        return ['triggers' => self::TRIGGERS, 'actions' => self::ACTIONS];
    }

    /**
     * @param array<string,mixed> $data
     */
    public function create(int $organizationId, int $userId, array $data): array
    {
        $trigger = (string) ($data['trigger_event'] ?? '');
        if (!in_array($trigger, self::TRIGGERS, true)) {
            throw new \InvalidArgumentException('Invalid trigger event.');
        }

        $actions = $this->sanitizeActions($data['actions'] ?? []);
        if ($actions === []) {
            throw new \InvalidArgumentException('At least one valid action is required.');
        }

        $id = $this->model->insert([
            'organization_id' => $organizationId,
            'name'            => mb_substr(trim((string) ($data['name'] ?? 'Automation')), 0, 150) ?: 'Automation',
            'trigger_event'   => $trigger,
            'conditions'      => json_encode($this->sanitizeConditions($data['conditions'] ?? [])),
            'actions'         => json_encode($actions),
            'is_active'       => !empty($data['is_active']) ? 1 : 0,
            'created_by'      => $userId,
        ]);

        return $this->format($this->model->find($id));
    }

    /**
     * @param array<string,mixed> $data
     */
    public function update(int $id, int $organizationId, array $data): array
    {
        $row = $this->model->find($id);
        if (!$row || (int) $row['organization_id'] !== $organizationId) {
            throw new \RuntimeException('Automation not found.');
        }

        $update = [];
        if (isset($data['name'])) {
            $update['name'] = mb_substr(trim((string) $data['name']), 0, 150) ?: 'Automation';
        }
        if (isset($data['trigger_event']) && in_array($data['trigger_event'], self::TRIGGERS, true)) {
            $update['trigger_event'] = $data['trigger_event'];
        }
        if (array_key_exists('conditions', $data)) {
            $update['conditions'] = json_encode($this->sanitizeConditions($data['conditions'] ?? []));
        }
        if (array_key_exists('actions', $data)) {
            $actions = $this->sanitizeActions($data['actions'] ?? []);
            if ($actions === []) {
                throw new \InvalidArgumentException('At least one valid action is required.');
            }
            $update['actions'] = json_encode($actions);
        }
        if (array_key_exists('is_active', $data)) {
            $update['is_active'] = !empty($data['is_active']) ? 1 : 0;
        }

        if ($update !== []) {
            $this->model->update($id, $update);
        }

        return $this->format($this->model->find($id));
    }

    public function delete(int $id, int $organizationId): void
    {
        $row = $this->model->find($id);
        if ($row && (int) $row['organization_id'] === $organizationId) {
            $this->model->delete($id);
        }
    }

    /**
     * Evaluate + run all automations subscribed to an event.
     *
     * @param array<string,mixed> $context
     */
    public function handle(int $organizationId, string $event, array $context): void
    {
        $rows = $this->model
            ->where('organization_id', $organizationId)
            ->where('trigger_event', $event)
            ->where('is_active', 1)
            ->findAll();

        foreach ($rows as $rule) {
            try {
                if (!$this->conditionsMatch($this->decode($rule['conditions']), $context)) {
                    continue;
                }
                $this->runActions($organizationId, $this->decode($rule['actions']), $rule, $context);
                $this->model->update((int) $rule['id'], [
                    'run_count'   => (int) $rule['run_count'] + 1,
                    'last_run_at' => date('Y-m-d H:i:s'),
                ]);
            } catch (\Throwable $e) {
                log_message('error', 'Automation run failed: ' . $e->getMessage());
            }
        }
    }

    /**
     * @param array<int,array<string,mixed>> $conditions
     * @param array<string,mixed> $context
     */
    private function conditionsMatch(array $conditions, array $context): bool
    {
        foreach ($conditions as $c) {
            $field = (string) ($c['field'] ?? '');
            $op = (string) ($c['op'] ?? '==');
            $expected = $c['value'] ?? null;
            $actual = $context[$field] ?? null;

            $ok = match ($op) {
                '=='  => $actual == $expected,
                '!='  => $actual != $expected,
                '>'   => (float) $actual > (float) $expected,
                '>='  => (float) $actual >= (float) $expected,
                '<'   => (float) $actual < (float) $expected,
                '<='  => (float) $actual <= (float) $expected,
                'contains' => is_string($actual) && stripos($actual, (string) $expected) !== false,
                default => true,
            };

            if (!$ok) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param array<int,array<string,mixed>> $actions
     * @param array<string,mixed> $rule
     * @param array<string,mixed> $context
     */
    private function runActions(int $organizationId, array $actions, array $rule, array $context): void
    {
        foreach ($actions as $action) {
            $type = (string) ($action['type'] ?? '');
            $config = is_array($action['config'] ?? null) ? $action['config'] : [];
            $message = $this->renderTemplate((string) ($config['message'] ?? ''), $context, $rule);

            switch ($type) {
                case 'slack_post':
                    $slack = new SlackService();
                    if ($slack->isConnected($organizationId)) {
                        $slack->send($organizationId, $message !== '' ? $message : $this->defaultMessage($rule, $context));
                    }
                    break;

                case 'teams_post':
                    $teams = new TeamsService();
                    if ($teams->isConnected($organizationId)) {
                        $teams->send($organizationId, $message !== '' ? $message : $this->defaultMessage($rule, $context), (string) ($rule['name'] ?? 'FlowTrack'));
                    }
                    break;

                case 'webhook':
                    $url = (string) ($config['url'] ?? '');
                    if (filter_var($url, FILTER_VALIDATE_URL)) {
                        $client = \Config\Services::curlrequest(['timeout' => 10, 'http_errors' => false]);
                        $client->post($url, [
                            'headers' => ['Content-Type' => 'application/json'],
                            'body' => json_encode([
                                'automation' => $rule['name'] ?? 'Automation',
                                'event'      => $rule['trigger_event'] ?? null,
                                'data'       => $context,
                            ], JSON_UNESCAPED_SLASHES),
                        ]);
                    }
                    break;

                case 'notify_managers':
                    $this->notifyManagers($organizationId, (string) ($rule['name'] ?? 'Automation'),
                        $message !== '' ? $message : $this->defaultMessage($rule, $context), $context);
                    break;
            }
        }
    }

    private function notifyManagers(int $organizationId, string $title, string $message, array $context): void
    {
        $db = \Config\Database::connect();
        $rows = $db->table('organization_members om')
            ->select('om.user_id')
            ->join('roles r', 'r.id = om.role_id')
            ->where('om.organization_id', $organizationId)
            ->whereIn('r.slug', ['owner', 'admin', 'manager', 'team_lead'])
            ->get()
            ->getResultArray();

        $notifications = new NotificationService();
        foreach ($rows as $r) {
            $notifications->create((int) $r['user_id'], 'automation', $title, $message, $context);
        }
    }

    private function renderTemplate(string $template, array $context, array $rule): string
    {
        if ($template === '') {
            return '';
        }
        $replacements = [];
        foreach ($context as $k => $v) {
            if (is_scalar($v)) {
                $replacements['{' . $k . '}'] = (string) $v;
            }
        }
        $replacements['{automation}'] = (string) ($rule['name'] ?? '');
        return strtr($template, $replacements);
    }

    private function defaultMessage(array $rule, array $context): string
    {
        $who = $context['user_name'] ?? 'A team member';
        return sprintf('Automation "%s" triggered by %s (%s).', $rule['name'] ?? 'Automation', $who, $rule['trigger_event'] ?? 'event');
    }

    /**
     * @param mixed $actions
     * @return array<int,array{type:string, config:array}>
     */
    private function sanitizeActions($actions): array
    {
        if (!is_array($actions)) {
            return [];
        }
        $out = [];
        foreach ($actions as $a) {
            if (!is_array($a)) {
                continue;
            }
            $type = (string) ($a['type'] ?? '');
            if (!in_array($type, self::ACTIONS, true)) {
                continue;
            }
            $out[] = ['type' => $type, 'config' => is_array($a['config'] ?? null) ? $a['config'] : []];
        }
        return $out;
    }

    /**
     * @param mixed $conditions
     * @return array<int,array{field:string, op:string, value:mixed}>
     */
    private function sanitizeConditions($conditions): array
    {
        if (!is_array($conditions)) {
            return [];
        }
        $out = [];
        foreach ($conditions as $c) {
            if (!is_array($c) || empty($c['field'])) {
                continue;
            }
            $out[] = [
                'field' => (string) $c['field'],
                'op'    => in_array($c['op'] ?? '==', ['==', '!=', '>', '>=', '<', '<=', 'contains'], true) ? $c['op'] : '==',
                'value' => $c['value'] ?? null,
            ];
        }
        return $out;
    }

    private function decode(?string $json): array
    {
        $d = $json ? json_decode($json, true) : [];
        return is_array($d) ? $d : [];
    }

    private function format(?array $row): array
    {
        if (!$row) {
            return [];
        }
        return [
            'id'            => (int) $row['id'],
            'name'          => $row['name'],
            'trigger_event' => $row['trigger_event'],
            'conditions'    => $this->decode($row['conditions']),
            'actions'       => $this->decode($row['actions']),
            'is_active'     => (bool) $row['is_active'],
            'run_count'     => (int) $row['run_count'],
            'last_run_at'   => $row['last_run_at'],
            'created_at'    => $row['created_at'],
        ];
    }
}
