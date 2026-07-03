<?php

namespace App\Controllers\API\V1;

use App\Models\TimeEntryGithubLinkModel;
use App\Services\JiraService;
use App\Services\TimeEntryService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Jira integration actions: list a user's issues and turn one into a tracked
 * time entry (optionally pushing a matching worklog back to Jira).
 */
class JiraController extends ResourceController
{
    protected $format = 'json';
    protected JiraService $jira;

    public function __construct()
    {
        $this->jira = new JiraService();
    }

    /**
     * GET /api/v1/integrations/jira/issues
     */
    public function issues()
    {
        try {
            $orgId = $this->orgId();
            if (!$this->jira->isConnected($orgId)) {
                return $this->respond(['success' => true, 'data' => ['connected' => false, 'issues' => []]]);
            }
            return $this->respond([
                'success' => true,
                'data' => ['connected' => true, 'issues' => $this->jira->recentIssues($orgId)],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/jira/log-time
     * Body: { issue_key, summary, url?, project_id?, duration_minutes?, push_worklog? }
     */
    public function logTime()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];

            $issueKey = trim((string) ($body['issue_key'] ?? ''));
            $summary = trim((string) ($body['summary'] ?? ''));
            if ($issueKey === '') {
                return $this->fail('A Jira issue key is required.', 400);
            }

            $minutes = (int) ($body['duration_minutes'] ?? 30);
            $minutes = max(1, min(600, $minutes));
            $endTs = time();
            $startTs = $endTs - ($minutes * 60);

            $description = trim((string) ($body['description'] ?? ''));
            if ($description === '') {
                $description = "[{$issueKey}] " . ($summary !== '' ? $summary : 'Jira work');
            }

            $entry = (new TimeEntryService())->createManualEntry($userId, $orgId, [
                'project_id'  => isset($body['project_id']) && $body['project_id'] ? (int) $body['project_id'] : null,
                'description' => mb_substr($description, 0, 1000),
                'started_at'  => date('Y-m-d H:i:s', $startTs),
                'ended_at'    => date('Y-m-d H:i:s', $endTs),
                'is_billable' => (bool) ($body['is_billable'] ?? true),
            ]);

            // Record the link (reuse the generic github-links table).
            (new TimeEntryGithubLinkModel())->insert([
                'organization_id' => $orgId,
                'time_entry_id'   => (int) $entry['id'],
                'user_id'         => $userId,
                'type'            => 'jira_issue',
                'repo'            => isset($body['project']) ? mb_substr((string) $body['project'], 0, 191) : null,
                'external_id'     => mb_substr($issueKey, 0, 191),
                'title'           => mb_substr($summary !== '' ? $summary : $issueKey, 0, 500),
                'url'             => isset($body['url']) ? mb_substr((string) $body['url'], 0, 500) : null,
                'authored_at'     => date('Y-m-d H:i:s', $endTs),
            ]);

            $worklogPushed = false;
            if (!empty($body['push_worklog'])) {
                try {
                    $worklogPushed = $this->jira->addWorklog(
                        $orgId,
                        $issueKey,
                        $minutes * 60,
                        date('Y-m-d H:i:s', $startTs),
                        $description
                    );
                } catch (\Throwable $e) {
                    log_message('error', 'Jira worklog push failed: ' . $e->getMessage());
                }
            }

            return $this->respondCreated([
                'success' => true,
                'data' => ['entry' => $entry, 'worklog_pushed' => $worklogPushed],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }

    private function context(): array
    {
        $orgId = $this->orgId();
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$userId) {
            throw new \RuntimeException('Unauthorized');
        }
        return [$orgId, $userId];
    }
}
